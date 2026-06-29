# AR2 — Architecture Critique

**Verdict: 8/10 — READY TO BUILD.** The locked seam decision is correct, ground-truthed against the real `runSession`, and the lightest change that satisfies all four ACs without weakening teardown. No CRITICAL findings. Three WARNINGs (all builder-actionable during green; none require a designer re-plan) and a few NICE-TO-HAVEs.

Reviewer ground-truthed every load-bearing claim against the real code (`session-provisioning.ts`, `session-lifecycle.ts`, `require-harness.ts`, the baseline `session-provisioning.integration.test.ts`, `AM2-builtin-gateway.integration.test.ts`, `vitest.integration.config.ts`, `honest-harness-guard.ts`, the migrations dir). This is not a paper review.

---

## Ground-truth verifications (the six scrutiny points)

### 1. Seam timing — CORRECT (verified against real `runSession`)
Plan fires `onBeforeTeardown` after the drain `try/finally` (`adapterPool.release`, line 1092–1095) and before the `if (crashed)` dispatch (line 1137). Verified the actual control flow:
- Line 1095 `finally`: drain complete, `harness.stopSession` already ran (line 1080/1089) → sandbox quiescent, native writes flushed.
- Lines 1105–1135: `deregister`, MCP `unregister`, `computeForceReturnCount` def — no filesystem mutation.
- Line 1137 `if (crashed)` → `crashSession` (does **NOT** delete the sandbox, line 415–416).
- Line 1157 `budget_exhausted` → `endSession` (`rm` at `:341`) then `workspace.destroy` (line 1160).
- Line 1184 `not_returned` → `endSession` (`rm`) then `workspace.destroy` (line 1202).
- Line 1215 completed → `endSession` (`rm`) then `workspace.destroy` (line 1220).

A single fire-point at ~line 1136 precedes **all four** branches and every `rm`. The sandbox directory exists and is fully written at that instant. **The plan's claim that `endSession` holds the `rm` (`:341`) and runs before `workspace.destroy()` is confirmed.** Not too early (drain done, stop done), not too late (nothing deleted yet). Alternative C (wrap `SandboxAdapter.destroy()`) is correctly rejected — `workspace.destroy` runs *after* `endSession`'s `rm`, so it would observe an already-emptied dir.

### 2. Full production `provisionSession()` — YES (AC1 satisfied)
`provisionSession` (line 1306) is `admitSession` + `runSession` with deps passed straight through. `runSession` destructures `deps` (line 612) — adding `onBeforeTeardown` to that destructure or reading `deps.onBeforeTeardown` directly threads it with **no signature change** to `provisionSession`/`admitSession`/`startSessionProvision`/dispatcher. The test calls real `provisionSession`, not a bespoke rig. Confirmed no phases are bypassed.

### 3. Teardown contract not weakened — CORRECT (AC constraint satisfied)
The seam is try/catch-wrapped; a throwing observer is logged and swallowed; teardown runs unconditionally afterward on every branch. No leaked-sandbox risk. The `rm` at `:341` is untouched; no schema/migration/`session-lifecycle.ts` change. The concept's "observes, never disables" invariant holds at the code level.

### 4. `requireHarness` hard-fail (both lanes) — CORRECT
`require-harness.ts` confirmed: `claude` → `which claude` binary check; `builtin` → `OPENROUTER_API_KEY` presence. Throws (never skips) on absence, names the missing harness, never echoes a secret. Plan gates Lane 1 on `requireHarness("builtin")` and Lane 2 on `requireHarness("claude")` — both correct per the strict harness model. No `anthropic-key`/`openai-key` token anywhere. Each lane counts toward the AR1 attestation agentic floor.

### 5. AC4 extractable pattern — REAL, not vaporware
`provision-real-session.ts` (`createSandboxCapture` + `startMcpBridgeServer`) is a concrete module beside `require-harness.ts`. `startMcpBridgeServer` is verified to already exist inline in `session-provisioning.integration.test.ts` (line 68–97) — the plan lifts that exact, working shape. `createSandboxCapture` returns `{ onBeforeTeardown, files }` — a real read-into-map affordance, not a stub. The documented four-step recipe (provision-real → capture → assert → teardown) is concrete enough for AR3–AR6 to import rather than rebuild. **Guard-clean** (see Finding W3).

### 6. Stale-premise pivot — CONFIRMED RIGHT (designer correctly flagged the spec)
Verified: highest migration is `0040_chubby_chimera.sql` (`packages/db/drizzle/`); there is **no `0041`**; `grep -rn filesystem_captures` across `packages/` returns **nothing** (`.ts` and `.sql`). The spec's "AO2 added `filesystem_captures` (migration 0041)" premise is **stale/false on this base** (matches MEMORY "Stale #370 discarded"). The designer's pivot — reframing the choice as "build a brand-new capture subsystem vs. a thin observation hook" and rejecting the table as unearned (ETHOS) — is **justified and correct**. Had the table existed, "extend it" would have merited weight; it does not, so Option D is right. This is the single highest-leverage call in the plan and the designer got it right.

---

## Findings

### WARNING-1 — Baseline test lore attributes the `isReturnAction` fix to AR2; the plan defers it. Resolve the drift.
`session-provisioning.integration.test.ts:273–293` asserts `result.outcome === "not_returned"` and lore says *"Once AR2 fixes `isReturnAction` this drops to ['completed']"* — i.e. the baseline test names **AR2** as the owner of the MCP-namespace return-action fix. AR2's plan §6 explicitly **defers** that fix ("tracked but not gated here; keep scope tight") and sidesteps it by asserting on the captured file rather than the verdict. That is a defensible scope decision for AR2's *own* test, but it leaves a documented expectation pointing at AR2 that AR2 will not fulfill — the next agent reading that lore will be confused, and the `not_returned` baseline assertion stays "wrong-but-expected." **Action:** the builder must either (a) make the small `isReturnAction` namespace-strip fix here (it is genuinely small and the baseline test already documents the exact root cause), or (b) update the baseline lore at `:273–293` to re-point the fix away from AR2 (e.g. to a follow-up WP) so the deferral is honest and traceable. Leaving both as-is ships a known doc/scope contradiction. Not blocking the seam, but must be closed in the build PR.

### WARNING-2 — Builtin lane depends on the in-registry `commit_file` tool actually writing to the sandbox; verify the tool exists and writes a real file before relying on it for AC2.
Lane 1's whole AC2 proof rests on the builtin agent calling `commit_file` to write `answer.txt` into `sandboxPath`. The plan asserts this works but does not cite where `commit_file` writes, or confirm it writes to the *session sandbox* (vs. the canonical store / a DB row). If `commit_file` does not land bytes in `sandboxPath`, Lane 1's `onBeforeTeardown` reads nothing and the lane proves only Lane 2. The plan's own belt-and-suspenders (`result.totalCostCents > 0`) guards against a *stub* but not against "tool wrote to the wrong place." **Action:** builder must confirm `commit_file`'s write target is the session sandbox before red-phase, and if it is not, pick a tool that does (or rely on Lane 2's native-write as the load-bearing AC2 proof and demote Lane 1's file assertion). This is exactly the "stub vs. real" trap AR exists to kill, applied to the tool layer.

### WARNING-3 — `createSandboxCapture` is guard-clean today, but confirm the AR1 stub-content guard does not regress on it.
Verified `honest-harness-guard.ts` `STUB_PATTERNS`: matches `new (Scripted|Echo|Capturing|Mock)(Adapter|Harness|HarnessAdapter)`, `class … implements HarnessAdapter`, `): HarnessAdapter` return-type, `mock-harness-adapter` import, and `vi.mock(harness|llm-client|callLlm)`. `createSandboxCapture` returns `{ onBeforeTeardown, files }` (not `HarnessAdapter`), constructs no adapter, mocks nothing — **clean**. The note "Capturing" in the pattern set is for `CapturingHarnessAdapter`, not "capture"; `createSandboxCapture` does not contain `Adapter`/`Harness` so `/new\s+…Capturing…(Adapter|Harness…)/` cannot fire. No action required beyond a sanity `npm run lint` after the helper lands — flagged only because the word "capturing" is in both the guard and the new helper's domain and a future careless rename to `new CapturingAdapter`-style would trip it.

### NICE-TO-HAVE-1 — `provision-real-session.ts` lives in `harness/__tests__/` but is imported by tests in `__tests__/` (the baseline) too.
The helper sits in `packages/server/src/harness/__tests__/`. AR3–AR6 and the baseline `session-provisioning.integration.test.ts` (in `packages/server/src/__tests__/`) will cross-import it. That is fine (it's a sibling import), but confirm the helper is not picked up as a test file itself — it has no `.test.ts` suffix, so the integration glob (`**/*.integration.test.ts`) will not collect it. Verified the glob; no issue, just call it out so the builder doesn't accidentally suffix it.

### NICE-TO-HAVE-2 — `⚠️ UNVERIFIED` OpenRouter model id is correctly flagged; keep the bounded-list pattern.
The plan honestly flags the cheap tool-capable model id as unverified. Good. The existing `AM2-builtin-gateway` test uses a **bounded candidate list** (`["openai/gpt-4o-mini","openai/gpt-3.5-turbo"]`) with auth-error→FAIL / model-not-found→next semantics. The builtin lane should reuse that bounded-list pattern (tool-capable model that supports function-calling), not a single hardcoded id, to survive catalog churn without becoming an unbounded fallback. The plan implies a single id; recommend the bounded list.

### NICE-TO-HAVE-3 — Crash-path observability is a real (acceptable) asymmetry; note it.
On the crash path `crashSession` does **not** delete the sandbox (line 415–416, "knowledge preserved for debugging"). So `onBeforeTeardown` fires before crash teardown but the sandbox would survive crash teardown anyway. Harmless — the seam still fires once on every outcome as the concept promises — but worth a one-line lore note so a future reader understands the seam is the *only* pre-deletion window for completed/not_returned/budget paths and a *redundant* (but consistent) one for crash.

---

## Rubric scores (9 dimensions)

| # | Dimension | Score | Note |
|---|---|---|---|
| 1 | Layer integrity | 9 | Seam is one optional dep field in the Agent-Runtime orchestrator; observes only; no upward reach. |
| 2 | Contract fidelity (AC coverage) | 8 | AC1–AC4 all addressed and ground-truthed. −1: WARNING-1 (deferred `isReturnAction` vs. baseline lore) and WARNING-2 (Lane-1 tool-write assumption) are open contract-edges. |
| 3 | Data-model honesty | 10 | Correctly refuses a new table/migration; verified `filesystem_captures` does not exist; nothing persists. Best decision in the plan. |
| 4 | API/type-surface minimalism | 9 | One optional field + one small context interface; `ProvisionSessionResult` deliberately untouched; mirrors existing optional deps + `onHarnessStarted`. |
| 5 | Naming honesty | 9 | `onBeforeTeardown` / `BeforeTeardownContext` / `createSandboxCapture` say exactly what they do. |
| 6 | Module depth / reuse | 8 | Real extractable helper; lifts the proven inline `startMcpBridgeServer`; recipe documented. AR6 owns dedup of the inline copies (correctly out of scope). |
| 7 | Failure handling | 9 | try/catch-swallow observer; teardown unconditional on all 4 branches; no leaked sandbox; honest-test posture (no stub) preserved. |
| 8 | Testability / proof | 8 | Two real lanes, hard-fail gates, sanity-break (revert fire line → red) specified. −1: WARNING-2 (the AC2 proof leans on an unverified tool-write target on Lane 1). |
| 9 | Scope discipline | 8 | Tight seam + pattern; correctly defers `isReturnAction` and inline-helper dedup. −1: the deferral collides with the baseline lore (WARNING-1) and should be reconciled. |

**Weighted overall: 8/10. Ready to build (≥7).** No designer revision required. Builder must close WARNING-1 and WARNING-2 during the green/verify phase (both are build-time confirmations, not plan defects).
