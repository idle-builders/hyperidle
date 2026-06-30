# AR4 — Code Review (Phase 4)

**Reviewer:** single evaluator persona (carried from Phase-2 critique, 8/10 APPROVE).
**Round:** 1.
**Verdict: NOT DONE.** One CRITICAL (the CLI-lane `crashed`-acceptance re-opens CC-004 — the exact failure the AR track exists to kill) + supporting findings.

The dispatcher/builtin half is strong and honest. The 3 CLI lanes on AD2-real + R1-real were weakened below the sanctioned AR2 floor, which is the load-bearing seam proof for AC2/AC4. That weakening is the failure mode the whole track exists to prevent.

---

## CRITICAL

### C-1. AD2-real + R1-real CLI lanes accept `crashed` — a startup crash mints green with zero real agent work (CC-004, the seam stubbed in disguise).

**Files / lines:**
- `packages/server/src/__tests__/AD2-task-dispatcher-real.integration.test.ts:341,358` (claude), `:450,460` (codex), `:567,579` (opencode)
- `packages/server/src/__tests__/R1-wire-agent-execution-real.integration.test.ts:326,337` (claude), `:432,440` (codex), `:542,550` (opencode)

All three CLI lanes in both files assert:
```ts
expect(["done", "crashed"]).toContain(s?.state);
expect(["completed", "not_returned", "crashed"]).toContain(s?.outcome);
```

**Why this is a false green.** The session row is inserted at Phase 5 of `provisionSession` (`session-provisioning.ts:519`, `state:"active"`) **before the harness runs** (Phase 9 `harness.startSession` at `:1035`). Any failure in `startSession` is caught and routed to `crashSession` (`:1036-1038`), which sets `state="crashed", outcome="crashed"` (`session-lifecycle.ts:379-380,395`). So a CLI binary that fails to spawn, hits a bad MCP config, fails keychain auth, or crashes at startup — having done **zero real LLM work** — produces exactly `state=crashed, outcome=crashed` with a session row present. The test's `vi.waitFor` finds the row, and both assertions pass.

The only unconditional assertions are "session row exists" + "terminal state reached." The builder's lore (AD2-real `:347-357`, R1-real `:332-335`) argues this is "the unconditional load-bearing seam-existence proof." **It is not.** It proves the orchestrator created a row and the harness *terminated* — not that a real agent *ran*. The artifact check (`if (answerContent !== undefined)`) is conditional and therefore proves nothing on its own. Sanity-break: a claude binary that crashed at startup on every run would mint green forever on this lane.

**This is the precise weakening the AR track exists to kill.** The sanctioned AR2 reference is explicit and was the established contract:
- `AR2-provision-real-session.integration.test.ts:499,606`: `expect(["completed","not_returned"]).toContain(result.outcome)` — **FAIL on crashed.**
- AR2 lore (`:69`): *"a stub/echo adapter yields cost=0, outcome=**crashed**, no files. A real codex run ends **non-crash** AND writes a file."* — `crashed` is precisely the value AR2 uses to distinguish a real run from a stub/startup-crash.

**The plan also mandates FAIL-on-crashed** (it was carried forward from Phase 2, not invented here):
- architecture.md §"Key design decisions" #4: *"FAIL on `crashed`/`error`."*
- architecture.md per-file triage, AC4 crashed-path row: crash path is a **demoted** service-integration concern, never a pass condition on the real lane.

The attestation per-harness floor (`assertPerHarnessFloor`) does **not** save this: it only requires each harness to have ≥1 *executed* assertion, and a passing assertion over a crashed-at-startup session counts as executed. So claude/codex/opencode can crash at startup on every run and still satisfy the floor.

**Fix.** Restore the AR2 floor on all six CLI lanes: `expect(["completed","not_returned"]).toContain(outcome)` — **remove `"crashed"`** and remove `"crashed"` from the `state` waitFor (wait for `"done"` only, as AR2 does; if the CLI genuinely cannot reach `done`, that is a real bug to surface, not to accept). For the codex/opencode `not_returned` posture (real billable work, no MCP return call) keep `not_returned` — that is the honest AR2 floor and is non-crash. The artifact check should stay best-effort, but it is no longer the load-bearing proof: the non-crash outcome is. If a CLI lane genuinely cannot run green in this environment, that is a binary/auth problem to fix or surface via `requireHarness`, not to paper over by accepting `crashed`.

---

## WARNING

### W-1. R1-real builtin test title claims `real cost > 0` but never asserts it (Auditor: claim ≠ diff).
`R1-wire-agent-execution-real.integration.test.ts:158` — `test("POST /api/sessions → real builtin provisionSession → session done, real cost > 0", ...)`. There is **no cost assertion in the test body** (grep for `cost` in the test finds only the seed `costCap: null` and the title). The plan's AC1 verification row explicitly names cost as the builtin real-work proof. `cost > 0` is exactly the unconditional "a real model ran" assertion the builtin lane should carry (and would partly compensate C-1 for builtin). **Fix:** either assert `row.totalCostCents` / cost > 0 on the builtin lane, or correct the misleading title. Asserting it is strongly preferred — it is the cheapest unconditional real-work proof available on the builtin lane.

### W-2. AH6 lane-gate "verdict" tests a test-local function — tautology, proves nothing about production.
`AH6-lane-gate-verdict.test.ts:27-29` and `AH6-lane-gates-broken-turn-real.integration.test.ts:39-41` both **define `s1DistinctReplyPredicate` locally inside the test file** and then assert on it. There is **no production `s1DistinctReplyPredicate` / lane-gate function** — confirmed by grep across `packages/server/src` (only a stray comment in `builtin-harness-adapter.ts:558` mentions "S1 predicate"). So the verdict unit (`length>0 && reply !== welcome`) is asserting a function written two lines above it — a pure tautology that violates testing.md ("never write tests that assert on a function defined in the test"). The broken-lane "proof" of AC3 therefore proves nothing about the system.

The **valid-lane** leg in AH6-real has independent value (it asserts a real builtin turn persisted a non-empty, non-welcome reply over **real** output), but the predicate being trivially-true and test-local means AC3's lane-gate claim is thin. **Fix:** if a production lane-gate predicate exists (or should), import it and assert against it; if AC3's "lane gate" is really just "a real turn produced a distinct non-empty reply," state that plainly and drop the `s1DistinctReplyPredicate` ceremony — it dresses a `length>0` check up as a gate. Either way the verdict unit as written is not a test of production behavior. (This is partly inherited from the pre-AR4 AH6, but AR4 is the conversion that was supposed to make AC3 honest, and it carried the tautology forward.)

### W-3. AH3 service-integration remainder keeps two inline fake adapters in a mislabeled `.integration.test.ts`, dodging the guard by anonymization.
`AH3-assistant-turn.integration.test.ts:868` (capturingAdapter) and `:978` (validatingAdapter) are hand-rolled fake `HarnessAdapter` objects inside a file named `*.integration.test.ts`. The path-only guard does not flag them because (a) the file is deliberately **not** in `EXPLICIT_HARNESS_INTEGRATION`, and (b) the fakes are anonymous object literals, not `class … implements HarnessAdapter` or `new XHarnessAdapter`, so the stub-content regex misses them even if the file were selected.

**Acceptable in substance, flag the mechanism.** The real "user message reaches the model" proof (H3) genuinely landed in `AH3-assistant-turn-real.integration.test.ts` (the PONG turn over a real builtin model), and these remnants test `SessionConfig.messages` transcript assembly — a pre-harness service concern. Per the plan's single-archetype split that is the intended home. **But** the block's own docstring still claims "user message reaches the model" with a fake terminal adapter, and the file is `.integration.test.ts` carrying harness fakes that only escape the guard via anonymization. **Fix (low cost):** rename/relabel this H3 block to name its true subject (transcript assembly), and note in `honest-harness-predicate.ts` that the stub regex does not catch anonymous inline fakes — a mechanism gap the next track should close (e.g. flag inline objects with `startSession`+`streamEvents`+`stopSession` shape). Not a blocker on its own.

---

## NIT

- **N-1.** `AH3-assistant-turn-real.integration.test.ts:69-76,126-138`: the PONG/text assertions are wrapped in `if (astReply) {…}` after an unconditional `expect(astReply).toBeDefined()`. The `if` is redundant defensive slop (if undefined, `toBeDefined` already failed). Inline the assertions. Harmless but it reads like the PONG check is optional when it is not.
- **N-2.** `AH3-assistant-turn-real.integration.test.ts:85-141` (H3): dead `SENTINEL = "PONG-AR4-H3"` constant + `void SENTINEL`, plus a multi-line comment block (`:109-114`) explaining the test "cannot update the seeded message" — but the seed **does** ask for PONG (`seedAssistantTurnDomain` payload `:670`), so the assertion is real. The confused comment and dead sentinel are AI slop; delete them. The test is sound; the narration around it is not.
- **N-3.** `AD2-task-dispatcher-real.integration.test.ts:206,208,250` builtin lane builds `laneParams` then `void laneParams` (only used to "structurally confirm we built real params"). Dead — the builtin lane passes `resolveModel` inline (`:218-223`) and never uses `laneParams`. Remove it.
- **N-4.** `AH3-assistant-turn-real.integration.test.ts:93-94`: empty `beforeEach(async () => {})` / `afterEach(() => {})`. Delete.
- **N-5.** The `crashed`-acceptance lore comments (AD2-real `:339-357`, `:456-459`, `:564-578`; R1-real `:322-335`, `:438-439`, `:548-549`) are long, confident, and wrong (see C-1). When C-1 is fixed, delete them — they actively argue for the weakened floor.

---

## What is correct (verified, not assumed)

- **No `vi.mock` of harness/llm-client and no named fake adapter in any AR4 harness-facing `*.integration.test.ts`** (grep clean across the five `-real` files; only doc-comment mentions of the word). AC1's "no vi.mock remains" holds for the selected set. The `vi.mock` in `assistant-turn-per-agent-seam.test.ts` and `AK4-assistant-draft-registry.test.ts` is legitimate — both are demoted `.test.ts` units, not selected by the guard.
- **`requireHarness` hard-fails, never skips** (`require-harness.ts:74-83` throws; no `skipIf` anywhere in the AR4 set). AC4 mechanism is sound.
- **Guard wiring is correct.** `--check` runs clean. The five `-real` files are in `EXPLICIT_HARNESS_INTEGRATION`; the three assistant-turn files are additionally in `BUILTIN_ONLY_INTEGRATION`; the carve-out in `ruleFor` (`honest-harness-guard.ts:358-374`) runs **after** the stub + skipIf checks and still requires `requireHarness("builtin")`, exactly as the Phase-2 carry-forward demanded. `routes/__tests__` added to `SCAN_DIRS` for lint only.
- **Attestation per-harness floor holds** (`attestation-floor.ts` `assertPerHarnessFloor`): claude/codex/opencode each get ≥1 executed assertion from AD2-real + R1-real; builtin from all five. No floor change needed. (Caveat: the floor counts *executed*, not *non-crashed* — which is why C-1 slips past it.)
- **The dispatch→provision seam IS exercised, not bypassed.** AD2-real drives `transitionTask(...,"accepted")` → real `drainQueue` → real `provisionSession` (registry-wired at `:61`); `vi.waitFor` for the session row would time out if the wiring were reverted. No `state:"in_progress"` seed inside the AC2 assertion. The `onBeforeTeardown` production touch (`task-dispatcher.ts:104-115,386`) is additive-optional and threaded correctly; teardown still deletes the sandbox (observe-not-disable).
- **Builtin lanes are strict** — AD2-real `:247`, R1-real `:220`, and all three assistant-turn-real files assert non-empty real replies / `[completed,not_returned]` with **no** `crashed`. The builtin proofs are genuine real-work proofs.
- **Demotions preserved their assertions.** AK4 registry unit carries AC3a/AC4/AC4-loop with real handler logic. AD2 service remainder keeps all 13 queue/cost/concurrency/sweep tests (the `in_progress` seeds there are legitimate queue fixtures, correctly out of `EXPLICIT_HARNESS_INTEGRATION`). Per-agent-seam test-2 ("message persisted") migrated to AH3-real H1.
- **Security:** N/A confirmed — tests only; the one production touch is an optional test-callback dep. No new route/input/secret surface.

---

## AC completeness

| AC | Status | Evidence |
|---|---|---|
| AC1 — real model turn, no vi.mock/echo remains; pure-logic demoted to units | **PARTIAL** | No vi.mock/fake adapter in any selected `-real` file (grep clean). AH3-real H1/H3 + AK4-real AC1 + AH6-real assert real non-empty `ast-*` replies via real OpenRouter model. Demotions honest. **Gap:** R1-real builtin claims `cost>0` but never asserts it (W-1); AH6 verdict is a test-local tautology (W-2). Substantively met for the builtin assistant-turn surface; weakened proofs noted. |
| AC2 — dispatch→provision seam with a real agent (not seeded in_progress) | **NOT MET** | Seam genuinely exercised via real trigger + real `provisionSession` (builtin lane is a sound proof). **But** the 3 CLI lanes accept `crashed` (C-1) → a startup crash with zero real agent work mints green. The keystone AC2 proof is exactly the seam-stubbed-in-disguise the track exists to kill, for 3 of 4 harnesses. |
| AC3 — lane-gate on broken/real turn vs real harness output | **NOT MET** | Valid-lane leg runs over real builtin output (real reply persisted) — has value. But the gate predicate is a test-local tautology with no production counterpart (W-2); the broken-lane "verdict unit" proves nothing about the system. AC3's "lane gate" claim is not honestly proven. |
| AC4 — all converted tests hard-fail on missing harness; none skip | **MET** | `requireHarness` throws (never skips); no `skipIf` in the AR4 set; guard skipIf-check clean. |
| Matrix / per-harness floor / coverage-debt | **MET (mechanically)** | AD2-real + R1-real declare all four lanes; AH3/AK4/AH6-real declare builtin via the carve-out; floor satisfied; no coverage-debt entries (atomic). Caveat: floor counts executed-not-crashed, so C-1's crashed-acceptance is invisible to it. |

---

## Verdict: NOT DONE

Blocking: **C-1** (CRITICAL). AC2 and AC3 are not honestly proven; AC1 carries two weakened proofs (W-1, W-2).

**Required before re-review:**
1. **C-1:** remove `"crashed"` from the state + outcome assertions on all six CLI lanes (AD2-real + R1-real, claude/codex/opencode). Restore the AR2 floor: wait for `"done"`, assert `outcome ∈ {completed, not_returned}`, FAIL on crashed. Delete the lore that argues for accepting crashed (N-5).
2. **W-1:** assert real cost > 0 on the R1-real builtin lane (or, at minimum, correct the title — but asserting is the right fix and the cheapest unconditional real-work proof).
3. **W-2:** make AH6 AC3 honest — either assert a real production lane-gate predicate, or drop the `s1DistinctReplyPredicate` ceremony and state plainly that the real leg proves "a real builtin turn persists a distinct non-empty reply." The current verdict unit is a tautology.
4. **W-3 / NITs:** relabel the AH3 H3 transcript-assembly remnant; clean the slop (dead sentinel, empty hooks, `void laneParams`, redundant `if (astReply)`).
