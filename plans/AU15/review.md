# AU15 — Code Review (`/pipeline:review`)

Reviewer: fresh evaluator. Code in `backend/AU15-routine-intent-queue` @ `29d801a0` (green) checked
against `plans/AU15/architecture.md` + `dod.md`. 3 positive lenses + 3 negative lenses + AC audit.
Verify claims re-run on the current tree (not trusted from the report).

## Verdict: DONE

Implementation matches the approved plan faithfully. All four ACs are covered by real tests/guards,
the founder read+write ownership directive holds in the actual diff, and the builder's one flagged
deviation is a legitimate scope-preserving call that does not under-deliver any AC. No findings
requiring builder fixes. Three minor non-blocking observations recorded at the end.

## Verify re-confirmed on the current tree (not trusted from report)
- `npm run check` — PASS (all 10 packages, zero type errors).
- `npm run lint` — PASS: biome clean (495 warnings / 146 infos are the pre-existing baseline, none
  new in the diff), eslint clean, and every guard green: **au6, au9, au11, au13, au14** + au3/au7/au10.
- `npm run knip:production` — clean (confirms the `shouldCoalesce` deletion left no dangling export).
- `au6 --fixtures` self-test — PASS. `au13` guard live — PASS. `au11` guard live — PASS.
- AU15 integration tests — `agent-work-intent-worker.routine-selection` (5) + `routine-scheduler.au15`
  (5) + `builtin-routines` (26) all green (10 new + 26).

## Founder directive — read+write ownership (verified in the actual diff, not asserted)
- **routines / routineRuns:** direct grep of all five changed production files
  (`routine-scheduler.ts`, `agent-work-intent-worker.ts`, `routines-routes.ts`,
  `routine-session-reaper.ts`, `server-factory.ts`) for `.from/.insert/.update/.delete(routines|routineRuns)`
  → NONE. Every access routes through `routineService`: the new coalesce read
  (`findRunningRoutineRun`), the manual-route repoint, the drain-resolver reads, and the new
  `failOrRelease` finalize (`updateRoutineRunIfRunning`). The zero-allowlist `au13` guard is green
  with `routine-scheduler.ts`/`agent-work-intent-worker.ts` NOT allowlisted — a regression would fail it.
- **agent_work_intents:** grep of `routine-scheduler.ts` for `agentWorkIntents` → NONE (writes go
  through `recordAgentWorkIntent`). The two new `au6` rules are **genuinely file-scoped** to
  `routine-scheduler.ts` (keyed `file === ROUTINE_SCHEDULER_FILE`, exact-path). Proven three ways:
  (1) the `--fixtures` self-test asserts a *different* file (`agent-work-intent-worker.ts`,
  `agent-defaults/resolvers.ts`) importing `agent-selection` is NOT flagged; (2) the **live** `au6 --check`
  passes on the real tree where `agent-work-intent-worker.ts` now legitimately imports `agent-selection`
  — i.e. file-scoping works in reality, not just in fixtures; (3) I confirmed the positive case fires
  (fixtures write the import into `routine-scheduler.ts` and assert a finding). Full single-owner guard
  is registered in AU8's section of `TRACK-AU.md` (W1, round 2).

## Builder deviation (delegation.ts) — legitimate, does NOT under-deliver AC-2
The plan §4f suggested repointing `packages/eval/src/scenarios/delegation.ts` to prove delegate
selection by driving `checkAndFireRoutine` + drain. The builder found that would need a 4th export on
`packages/server/src/routines.ts`, which `au11-runtime-ownership-guard.ts` zero-allowlists to exactly 3
with an explicit "do not add exports" warning. Correct instinct: do NOT loosen another track's locked
guard to satisfy this WP. Confirmed the deviation held — `au11` guard is green (no 4th export), and
`delegation.ts` imports only the existing `checkAndFireRoutine` export.
**The delegate-selection proof did not vanish — it moved to where it is exercised for real:**
`agent-work-intent-worker.routine-selection.integration.test.ts` seeds owner + delegate sharing a real
`userSkills` skill, puts the owner at WIP (active session), drives the **real** `drainAgentWorkIntents`
→ `resolveAuthoritativeInput` → `selectAgentByAppDefaults` (the actual `routine_delegate` query), and
asserts the handed-off `agentSessionRequests.agentId === delegateAgentId`. This is genuine end-to-end
delegate selection against real seed data, not a structural stand-in. AC-2's WIP/owner-role effective
outcome is proven by this test (delegate case + defer-to-owner case + delegation-off case), and evals
are ungated per the DoD anyway. Deviation approved.

## Positive lenses
- **Architecture:** Boundaries hold. `routine-scheduler.ts` (Core) no longer imports `agent-selection`;
  selection now lives in `agent-work-intent-worker.ts` (agent-owned, `AU9_AGENT_FILES`) — agent→agent,
  no boundary crossing, `au6`+`au11` green. `FireResult.delegatedTo` removed (no consumer). Every task
  in the plan's §6 file-list is delivered, nothing extra. Matches the plan field-by-field.
- **Design:** N/A — backend/infra, no UI surface (per spec).
- **Security (STRIDE + agent-layer):** No new untrusted-input sink. The drain branch reads internal
  routine fields (`skillId`, `ownerAgentId`) into `selectAgentByAppDefaults` — no injection surface, all
  Drizzle, no raw SQL/shell/URL. The manual-trigger route's auth (`X-API-Key`) is unchanged; only the
  coalescing predicate changed. `failOrRelease` writes an internal `outcome:"error"`. No secrets, no new
  outbound fetch, no prompt-injection path. Clean.

## Negative lenses
- **Adversarial:** No weakened tests — every assertion targets a concrete value (delegate id, `error`
  outcome, `handed_off` status, run counts); no `skipIf`, no `toBeDefined`-only, no `not.toThrow`-only.
  The `failOrRelease` finalize is race-safe: `updateRoutineRunIfRunning` is `WHERE outcome='running'`
  (idempotent no-op if already terminal), and post-hand-off intents are `handed_off` so they never
  re-enter `failOrRelease` — no double-finalize against `projectRoutine`. PR claims match the diff
  (verify re-run green). New-hire readable: every change carries an `AU15 §`-referenced WHY comment.
- **Simplification:** Net simpler — dead `shouldCoalesce` + its stale AA2 lore deleted, the two fire
  paths unified onto one signal, the `sessions`/`and` imports dropped from the scheduler. No single-use
  wrappers, no premature generics.
- **AI slop:** None. Comments explain intent and cite plan sections; no filler, no "TODO"/"for now"/
  "in production", no defensive over-engineering (`if (agentId) selectedAgentId = agentId` is minimal).

## AC completeness
- **AC-1** (no fire-time `agent-selection`; resolved via drain): static `au6` file-scoped rule (green +
  fixtures) + runtime R1 drain-selection tests. ✓
- **AC-2** (same effective outcome per built-in): built-ins structurally unaffected — proven by the new
  owner-at-WIP-doesn't-block test + the pre-existing G4 suite running all 5 built-ins with owner
  attribution; generic-path WIP/owner outcome proven by R1 (delegate/defer/delegation-off). ✓
- **AC-3** (race ruled out): §8 analysis + unified-coalescing tests (poll R3a + manual-route-no-session
  R3b) + terminal-finalization tests (pre-hand-off R4a/AC-3d, post-hand-off R4b/AC-3c). ✓
- **AC-4** (no AU8 allowlist carve-out): the `au6` rule proves the residual Core→Agent edge is gone, so a
  future AU8 graph guard needs no exception; `server-factory.ts` lore retargeted to `@lore AU15`. ✓

## Minor observations (non-blocking — no fix required)
1. `au6 --fixtures` self-test is not wired into `npm run lint` (only `--check` is) — identical to the
   `au13` precedent where fixtures are a dev-run self-test and the live `--check` is the real gate. The
   file-scoped rules ARE enforced live. Acceptable.
2. `knowledge-promotion` has no dedicated `runBuiltinRoutine` execution + owner-attribution assertion
   (the other 4 built-ins do). It is registered/covered structurally and does not touch the changed code
   path, so AC-2 (unchanged behavior) holds; a dedicated run-assertion would be a belt-and-suspenders add.
3. The fire-time coalescing read-then-insert (`findRunningRoutineRun` → later `insertRoutineRun`) is not
   atomic — two overlapping same-routine fires could both pass. This is pre-existing in character (the old
   WIP gate was equally non-atomic), low-probability under the single-`setInterval` poll, and the real
   double-execution guards are drain-side (`claimAgentWorkIntent` CAS-lease + idempotency key). §9 already
   accepts this residual. Not introduced by AU15.
