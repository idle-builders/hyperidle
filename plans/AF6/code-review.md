# AF6 — Phase 4 Code Review

**Verdict: DONE** — all 5 ACs pass with code-verified evidence; zero CRITICAL findings. Tests 40/40 green, `npm run check` PASS (11 pkgs), `npm run lint` exit 0, knip clean.

Reviewed `git diff origin/main...HEAD`. Scope (iii) — built-in auto-fire only; generic auto-fire + per-run-cap-on-auto-fire + daily-digest auto-fire deferred to AF7 — implemented exactly as the approved Revision-1 plan + re-critique (8/10) specified.

---

## AC table

| AC | Verdict | Evidence |
|---|---|---|
| **AC1** built-in cron routines auto-fire; run row recorded + nextRunAt advances; single-fire | **PASS** | `routine-scheduler.ts` L618-636 builtin fork: synchronous `nextRunAt` advance (`await db.update`) BEFORE `void runBuiltinRoutine`. `builtin-routines.ts` L271-281 inserts terminal `routine_runs` row. Test `AD5...test.ts` "auto-fires a due built-in" asserts ≥1 terminal row + lastRunAt + nextRunAt>now + no session. Double-fire guard test "fires exactly once per due-window" at 50ms poll × 8 asserts `toHaveLength(1)`. Both green. |
| **AC2** fresh state read, two-phase flip | **PASS** | `registerEventTriggers` re-reads `current.active` per event (not snapshot). Test `routine-scheduler.integration.test.ts` "disable-after-register suppresses fire; re-enable restores it": phase 1 disable→assert 0 sessions + 0 run rows (genuine negative), phase 2 re-enable→assert 1 session. Discriminates fresh-read from snapshot. Green. |
| **AC3** manual trigger never bricks; reaper finalizes + periodic sweep wired | **PASS** | `routine-session-reaper.ts` finalizes stale `active` routine session→`crashed`, `running` run→`timeout`. Periodic sweep is NON-optional: `bootstrap.ts` L124-130 always injects `reap` into scheduler; `routine-scheduler.ts` L605-611 invokes it guarded by `lastReapedAt`. Tests: direct call asserts `shouldCoalesce` true→false self-heal; "does NOT reap fresh session" (staleness boundary); "booted scheduler periodic sweep reaps in-process stale session" (no restart). Green. |
| **AC4** monthly gate proven through BOOTED scheduler; no zombie session | **PASS** | `checkAndFireRoutine` monthly gate (`routine-scheduler.ts` region L426-440) inserts `monthly_budget_exhausted`, advances nextRunAt, **returns BEFORE** `createRoutineSession`. Test "capped generic routine over monthly budget" boots via `bootstrapFabric({canProvision:true})`, asserts `monthly_budget_exhausted` row written AND `sessions` rows `toHaveLength(0)`. Per-run-cap honestly deferred→AF7 (built-ins carry no session/cost). Green. |
| **AC5** GET /:id runs[] populates from routine_runs after auto-fire | **PASS** | `routines-routes.ts` L311-317 builds `runs[]` from `routineRuns` `orderBy(desc(startedAt))` (runs[0] = latest). Test `routines.routes.integration.test.ts` "after a built-in fire, runs[] has a terminal run": asserts `runs.length>=1`, terminal outcome, lastRunAt set. Negative-parity test "disabled built-in writes no run row" asserts `runs` empty. Green. |

---

## Lens findings

### Architecture — PASS
- **No layer violation.** Reaper is pure-DB (`db + eventBus` only), lives in fabric, injected into scheduler via `ReapStaleSessions` callback — fabric never imports server. Server `routine-session-reaper.ts` is a thin re-export. Correct.
- **Circular-import hazard handled.** `routine-scheduler.ts` now imports `builtin-routines.ts` and vice-versa. Builder broke the cycle correctly: `builtin-routines.ts` imports `runStaleSweep` from `../promotion-pipeline.js` (source, not `@hyperidle/fabric` index) and `parseCron`/`nextCronMatch` from the scheduler sibling. Both modules call each other only at call-time, not top-level — init-safe. Documented with `@lore`.
- **Data model unchanged.** No migration. `routine_runs` row uses existing nullable `endedAt`/`costMinor`/`errorMessage`; `outcome` values (`success`/`skipped`/`timeout`/`monthly_budget_exhausted`) all in the closed set. Verified against `schema.ts` L344-370.
- **Disposer count contract** updated 8→9 (`O3-service-move-bootstrap` test), matching the new deferred scheduler disposer.

### Security — PASS
- No new HTTP endpoints. Scheduler/reaper are internal background workers; no new trust boundary, no user input parsed. `canProvision:false` enforced in production via `server-factory.ts` (default flows through `bootstrap.ts` L121 `ctx.canProvision ?? false`). No path fires a generic routine into the zombie session path in prod. No secrets logged (start log emits `pollIntervalMs`/`canProvision`/`reaperEnabled` only). No injection/SSRF/path surface introduced.

### Adversarial — PASS (no exploitable findings)
- **Double-fire:** closed. Synchronous `nextRunAt` advance before async dispatch means the row is no longer due before the next 50ms tick; proven by the single-fire test (8 ticks → exactly 1 row).
- **Brick/zombie:** built-ins create no session (cannot brick). Generic routines are skipped in prod (`canProvision:false`). Reaper self-heals any pre-existing zombie (boot one-shot + periodic). No path leaks a session.
- **Saboteur:** no weakened tests — the AC2 negative assertion and AC4 no-session assertion are real discriminators, not tautologies. The AC4 test would fail if the gate moved after session creation.
- **Type safety:** zero net-new `as`/`any`/`!`/`@ts-ignore` in production code (grep of added lines hit only prose in comments). `check` PASS.

### Simplification / AI Slop — PASS (minor observations only)
- `@lore` comments are dense but each documents a real non-obvious decision (cycle break, synchronous-advance rationale, disabled short-circuit ordering) — load-bearing, not slop.
- No single-use premature helpers, no dead code, no commented-out code, no impossible error handling. `backfillMissingNextRunAt`/`computeNextRunAt`/`reapStaleRoutineSessions` are each consumed (knip clean).

---

## Observations (non-blocking, no fix required for AF6)

1. **OBSERVATION — stale schema comment (pre-existing, not AF6).** `schema.ts` L353 comments `routine_runs.outcome` as `/** 'success' | 'error' */` but the closed `RoutineRunOutcome` set already includes `skipped`/`timeout`/`budget_exhausted`/`monthly_budget_exhausted`. AF6 did not introduce this and adds no new outcome value, so it is out of AF6 scope — flag for a future cleanup, not a blocker.

2. **OBSERVATION — AC4 test cron `* * * * *` writes a monthly_budget_exhausted row every poll.** The booted scheduler re-selects the capped routine each tick (gate advances nextRunAt to next minute, still `<= now` within the 4-tick window is not the case — next minute is future, so typically one row). Assertion is `>= 1`, so non-fragile either way. No action.

3. **OBSERVATION — DEFERRED-AC fragments must land in the register.** Per the re-critique carry-forward: per-run-cap-on-auto-fire → AF7 and daily-digest auto-fire → AF7. These are honestly deferred in the plan; the workpackage register should carry them so a future reader does not read AC1/AC4 as fully shipped. Process item, not a code fix.

---

## Doc-check — skip is FAIR
Builder's claim verified. AF6 changed no API shape, no data model (no migration), no state-machine semantics — it wired an already-complete dormant scheduler to boot. `docs/process-layer/recurring-routines.md` already describes routines running autonomously (L31, autonomy levels L1-L4 with autonomous runs). No user-facing doc documents a shape that AF6 altered. No doc update required in this PR.

---

## Validation evidence
- `npm run test:integration -- routine-session-reaper routine-scheduler AD5-routine-scheduler-boot routines.routes` → **40 passed (40)**.
- `npm run check` → PASS, all 11 packages (web 211 quarantined is pre-existing AF5, unrelated).
- `npm run lint` → exit 0 (324 warnings/37 infos are repo-wide aggregates, none net-new errors).
- `npx knip` → no unused exports for new symbols.

**Builder: nothing to fix. AF6 is DONE.**
