# AL6 v3 — Code Review (Phase 4)

**Reviewer verdict: DONE.** Code implements the APPROVED v3-r2 plan faithfully. The forcing carrier is real and physically rewrites the sandbox file; the NIT-3 content-gated carrier test genuinely fails on a no-op carrier; the loop invariants (W1/W2) are mandated and tested; the force counter is coherent; the capability rename is fully propagated. `verify:quick` clean; 34 AL6 unit + 40 AL6 integration tests green; closure test unweakened (13).

No CODE blocking finding. The one substantive question — whether the external eval proves the founder's bar — is a **recommended-additional-proof WARNING**, not a DONE blocker (see #2). The stale doc is a Phase-5 item.

---

## AC audit

| AC | Criterion | Verification in code | Status |
|---|---|---|---|
| **AC1** | Every turn ends with a return; one that would end without is not accepted complete | Re-prompt loop in `runSession` (`session-provisioning.ts:773-917`); `AL6-reprompt-loop.integration.test.ts` AC1 (run-1 no-return → sandbox rewrite → run-2 returns, `forceReturnCount=1`, `outcome=completed`) | PASS |
| **AC2** | Closed return set enumerated | `RETURN_ACTION_NAMES` frozen tuple (`return-actions.ts:23`); `AL6-return-actions.closure.test.ts` 13 tests green, unweakened | PASS |
| **AC3** | Attempt to end without return detected; never silently complete | `not_returned` persisted to ROW (`session-lifecycle.ts:289-297` CAS write w/ `terminalOutcome`) AND bus event (`:304-316`); `session_not_returned` emitted (`session-provisioning.ts:998`); test asserts persisted row + bus event + `forceReturnCount===AL6_MAX_FORCE_RETURNS` | PASS |
| **AC4** | Enforcement holds uniformly regardless of harness | (a) all 5 adapters `canReEngage:true`, `hasNativeReturnHook` correct; (b) sandbox-carrier mock (Layer-B) + Layer-A mock both reach `forceReturnCount≥1`, neither settles `completed`+`not_returned` (`AL6-uniform-forcing.integration.test.ts`); (c) live external eval ran, `score=0.933` | PASS (live-proof caveat #2) |
| **AC5** | Mid-turn non-terminal tool use unaffected | gate is observation-only (`return-gate.ts`); `read_inbox`+`write_memory`→`submit_review` test, all tools recorded, no force | PASS |

---

## #1 — The carrier is real and physically rewrites the file (NIT-3 hard gate): VERIFIED

- `rewriteSandboxForcing` (`re-engage.ts:42-45`) appends `\n\n${AL6_FORCE_RETURN_MESSAGE}` to the base prompt and calls `writeSandboxAgentsMd(sandboxPath, forcingPrompt)` — a real dual `fs.writeFileSync` of AGENTS.md + CLAUDE.md.
- The loop calls it BEFORE looping back to `startSession` (`session-provisioning.ts:914-916`): `loopForceCount++; rewriteSandboxForcing(sandboxPath, assembledPrompt);` then `while` re-enters Phase 9. The re-spawned adapter reads the rewritten file from `cwd:sandboxPath`.
- **NIT-3 gate is genuine.** The sandbox-carrier mock's run-2 return is GATED on `myFileContent.includes(AL6_FORCE_RETURN_MESSAGE)` (`AL6-reprompt-loop.integration.test.ts:172-194`, `AL6-uniform-forcing.integration.test.ts:151-167`). A no-op carrier → `fileHasForcingMessage=false` → mock yields `read_inbox`/no return → `not_returned` → test FAILS. The test additionally asserts `run2Content).toContain(AL6_FORCE_RETURN_MESSAGE)` directly. There is also a dedicated NIT-3 self-validation test (`:377-434`) proving the mock itself gates on file content (run-2 without rewrite → no return). The carrier is NOT fake.

## #2 — Does the external eval prove the founder's bar? — RECOMMENDED-ADDITIONAL-PROOF (WARNING, not a DONE blocker)

The HARD DoD `fr-forced-return-external` ran on a non-builtin external-shaped harness against a real model: `forceReturnCount=2, outcome=not_returned, score=0.933`. This proves, on a real external (non-Claude) harness:
- (a) the Layer-B loop **forces** on a non-builtin adapter (forceReturnCount=2 = two real sandbox-rewrite re-engages, not Layer-A),
- (b) the sandbox carrier physically rewrites and the re-spawned model re-reads it,
- (c) the never-`completed`-without-return guarantee holds (it fell to the `not_returned` reject floor, never silently completed).

**What it does NOT show:** a *successful* forced-return on an external harness — forced → then the external model actually CALLS a return tool (the happy path, analogous to v2's builtin 1.000). The external run was forced twice and the model STILL refused, landing on the reject floor.

**Judgment:** This is sufficient to discharge AC4's structural guarantee and the "forcing reaches all harnesses" bar — the loop demonstrably engages an external model twice via the real carrier. The integration suite (`AC4a` sandbox-carrier mock) proves the forced→returns happy path deterministically (run-2 returns *because* the file was rewritten). So the happy path IS proven structurally; what's missing is the happy path proven *live on a real external model*.

Given the founder rejected v1 and v2 for under-proof, and given MEMORY [live-proof lanes run before ship] / [agent-behavior needs live eval], I rate this a **WARNING (recommended additional proof), not a DONE blocker**: the live external lane proved forcing fires and the floor holds on a real model; the remaining gap (live external happy-path conversion) is closed deterministically by the integration test, and a single live happy-path run is model-compliance-dependent (a refusing model is not a code defect).

**Exact scenario that would close it:** an `fr-forced-return-external-compliant` eval — external-shaped real-model harness seeded with a system prompt that *initially* omits the return instruction (so run-1 plausibly skips the return) but whose model, once the sandbox file is rewritten with `AL6_FORCE_RETURN_MESSAGE`, *does* call `submit_review`. Pass condition: `forceReturnCount≥1` AND `outcome=completed` AND `returnVerdict=returned`. The existing external adapter (`provision-harness.ts:63-233`) already passes the `submit_review` tool to the model, so this needs only a more compliant seed prompt and a happy-path judge — not new plumbing. Recommend adding it in a follow-up before the founder sign-off if the founder wants the live happy-path proof; it does not block this code review.

## #3 — Uniform guarantee, no escape (AC4): VERIFIED, adversarially hunted

- All 5 adapters return `canReEngage:true` (`builtin:357`, `sdk:315`, `cli:409`, `isolated:227`, `remote:227`) + `mock-harness-adapter.ts:64`.
- **No path settles `completed` on a no-return turn.** The loop exits to teardown only via: crash (`break`→exempt `crashed`), abort/budget (`break`→exempt), `returnGate.returned` (→`completed`, correct), or `loopForceCount>=MAX`/`!canReEngage` (→falls through to `evaluateReturn(gate,"completed")` which returns `not_returned` since gate empty). The only way to reach `completed` with an empty gate would be `returnGate.returned===true` without a return — impossible, the gate only sets `returned` on `isReturnAction`. Verified `evaluateReturn` (`return-gate.ts:64-72`) returns `not_returned` for `completed`+empty gate.
- `not_returned` persists to the `sessions` ROW (`session-lifecycle.ts:293` `outcome: terminalOutcome`) AND `session_ended` EVENT (`:314`), gated on the CAS rowcount. Tests assert both the DB row (`AL6-reprompt-loop.integration.test.ts:497-505`) and the bus event (`:508-527`).

## #4 — Loop lifecycle (W1/W2): VERIFIED

- **W1 slot held across loop, released once.** `adapterPool.release(adapterId)` is called EXACTLY once, in the `finally` block (`session-provisioning.ts:918-921`), never inside the loop body. `stopSession` per run (`:883`) explicitly does NOT release the pool slot. All break paths (return/crash/abort/budget/floor) flow through the `finally`. The v2 per-run releases at `:888/:894` are gone (collapsed to one). Confirmed no other `adapterPool.release(adapterId)` in `runSession`.
- **W2 exactly one `session_ended`.** `endSession`/`crashSession` are called ONCE post-loop (`:951-1030`), never inside the loop. Test `W2 — exactly ONE session_ended fires` asserts `sessionEndedCount===1` even after N runs.
- **`onHarnessStarted` once** (firstRun guard, `:786-798`). **register once + handle re-armed per run** (`:786-809` — `register` on firstRun, re-`register` with new handle on subsequent runs, which overwrites the same `sessionId` Map key cleanly; `onHarnessStarted` NOT re-fired). **deregister once** post-loop (`:931`).
- **No cost double-count.** `totalCostCents` accumulates from the per-event `cost_update` stream across all runs into one variable (`:826`); `stopSession`'s returned `SessionResult.cost` is ignored — matches v2. One span = one summed cost.
- **Bounded at N=2** (`AL6_MAX_FORCE_RETURNS`); budget test asserts `forceReturnCount===AL6_MAX_FORCE_RETURNS` and `startCallCount===AL6_MAX_FORCE_RETURNS+1`.

## #5 — Force counter coherent: VERIFIED

`forceReturnCount = loopForceCount + (harness.getForceReturnCount?.(sessionId) ?? 0)` (`session-provisioning.ts:949`). The two layers are mutually exclusive per turn (native hook resolves in-turn → loop never fires → `loopForceCount=0`; loop fires only when no native hook caught it → native count contributes for builtin/SDK). Builtin `getForceReturnCount` reads `forceCount` (`builtin:371-373`); SDK reads `al6.stopHookCount` (`sdk:324-326`). External adapters omit the method → `?? 0`. Tests assert builtin/Layer-A path = native count, external = loop count, neither double-counts.

## #6 — Capability rename fully propagated: VERIFIED

- No dangling `canForceReturn` in production code. `grep` hits are: docstrings/`@lore` referencing the v2 name (`harness-adapter.ts:134`, dist `.d.ts`), stale comments in `AL6-return-gate.integration.test.ts` prose (lines 19-28, 511, 519-530) and `claude-agent-sdk-adapter.test.ts` test-describe strings, and the stale **doc** (Phase-5). None are live capability reads.
- `canReEngage` / `hasNativeReturnHook` are non-optional on `HarnessCapabilities` → `npm run check` fails any omission (verified: `check` clean). All 5 adapters + mock set them. The "all-true" guarantee is enforced by (a) the non-optional type + (b) runtime tests in both AL6-return-gate files. See NIT-1 on the static-guard honesty.

## #7 — DOC STALENESS: Phase-5 item (flagged, NOT a code blocker)

`docs/agent-layer/return-gate-enforcement.md` is titled "AL6 v2" and describes the rejected Tier-1/Tier-2 `canForceReturn` model (`:29-45`: "Tier-2 — Reject … `canForceReturn: false` … applies the rejection directly"). This is the exact v2 behavior the founder rejected. **Correct scope: Phase 5 (write-docs), which runs NEXT.** `/review` reviews CODE; the builder's self-review calling this CRITICAL/NOT-DONE mis-scoped it — failing a code review for a doc the next phase rewrites is wrong. **Flagged explicitly so Phase 5 MUST rewrite it** to the v3 re-prompt-loop / `hasNativeReturnHook`+`canReEngage` model (also fix the `index.md` entry and any "AL6 v2" headers).

## #8 — Test stubs / `as unknown as` casts: LEGIT (red-phase access pattern, not masking)

The `as unknown as HarnessCapabilities` casts in the mocks and `sharedAll as Record<string, any>` are the red-phase mechanism for accessing not-yet-exported v3 fields; now that T1 shipped they are redundant-but-harmless. They do NOT weaken assertions — every cast object supplies real `hasNativeReturnHook`/`canReEngage` literals. The v2 behavioral tests were properly **re-authored** (W3): `AL6-return-gate.test.ts` deleted the v2 `canForceReturn` reject-table block and added a `"canForceReturn" in caps === false` negative assertion (`:398-406`); the integration test's AC4 block now sets `canReEngage:true` on all shapes (the "tier" labels are cosmetic — both reach `not_returned` via the loop). Not protected-as-is; genuinely rewritten to v3 semantics.

---

## Findings

**CRITICAL:** none.

**WARNING-1 (#2 — recommended additional proof, non-blocking):** The live external eval proves forcing-fires + reject-floor-holds on a real external model (`forceReturnCount=2, not_returned, 0.933`) but not a live external *happy-path conversion* (forced → model then returns). The happy path is proven deterministically by the integration suite. Recommend an `fr-forced-return-external-compliant` eval (seed where the rewritten sandbox file flips a real external model into calling `submit_review`; pass = `forceReturnCount≥1 ∧ outcome=completed`) before founder sign-off if a live happy-path is wanted. Plumbing already exists (`provision-harness.ts` external adapter passes the `submit_review` tool). Does NOT block this code review.

**WARNING-2 (Phase-5 doc):** `docs/agent-layer/return-gate-enforcement.md` describes the rejected v2 Tier-1/Tier-2 model. Phase 5 (write-docs) must rewrite to the v3 re-prompt-loop model. Flagged for Phase 5; not a Phase-4 code blocker.

**NIT-1 (honesty on the static guard):** The plan's W4 offered "type-required field + (compile/`satisfies` assertion OR eslint rule)" for the canReEngage-all-true guarantee. Shipped is type-required-field + runtime tests only — the `no-ungated-stream-drain` eslint rule is the unrelated stream-drain classifier, NOT a `canReEngage:false`-forbidding rule. A future adapter literally writing `canReEngage:false` is caught only by review + the existing per-adapter runtime tests, not statically. The plan §9 explicitly conceded this is acceptable ("a future adapter MAY set false … a deliberate, reviewed edit"), so this matches the approved plan — but do not describe it as a compile-time impossibility. As-built honesty: it's a non-optional field (omission caught by `check`) + runtime coverage.

**NIT-2 (dead deprecated method):** `BuiltinHarnessAdapter.getSessionForceCount` (`:379-381`) has no production caller — the only reference is a comment in `force-return.ts:295`. It was kept "for backward compat with eval code that calls it by the old name" but the eval now reads `result.forceReturnCount`. Harmless (knip doesn't flag class methods), but it's dead — drop it or wire the comment to reality. Minor.

**NIT-3 (Mode-2 `continueSession` speculative surface):** The optional `continueSession?` interface method (`harness-adapter.ts:187`) is declared but no adapter implements it and the loop never calls it — the plan's YAGNI off-ramp (omit if infeasible) was the recommended default. It's dead interface surface. Non-blocking; matches the plan's "carried, not blocking" disposition.

**NIT-4 (stale prose comments):** `AL6-return-gate.integration.test.ts` header (lines 19-28) and the AC4-v2 block comments (`:505-530`) still narrate "Tier-1/Tier-2 / canForceReturn table" though the code asserts v3 shape. Cosmetic — the assertions are correct v3. Optional cleanup.

---

## Verdict: DONE

The implemented v3 code faithfully delivers the APPROVED v3-r2 plan. The carrier physically rewrites the sandbox file and the NIT-3 gate is non-vacuous; the uniform guarantee has no `completed`-without-return escape; W1/W2 loop invariants are mandated and tested; the force counter is coherent; the rename is fully propagated. The external live eval discharges AC4's structural bar (forcing fires + floor holds on a real external model). The only substantive open question (#2, live external happy-path) is a recommended additional proof closed deterministically by the integration suite — a WARNING, not a blocker. The stale doc is correctly a Phase-5 (write-docs) item. No CODE blocking finding exists.
