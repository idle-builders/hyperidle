# Architecture Critique: AF6

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:6 LI:9 AC:6 DM:8 N:8 MD:7 FMC:7 S:7 V:6

Verdict: **APPROVED (7/10)** — but conditional on the CRITICAL findings below being folded into the plan before `/write-tests`. The plan's structural reasoning is strong and its load-bearing scope call is sound; it has two AC-traceability holes (run-row writes for builtins; AC4 unprovable on the shipped path) that must be closed or the green tests will lie.

---

## Scope-(iii) ratification: **RATIFY** (with one correction to the plan's framing)

Scope (iii) — *AF6 ships built-in auto-fire only; generic-routine auto-fire deferred to AF7* — is **sound and correct**. Reasoning, tied to ACs and verified against code:

- **The 6 closed Z-bugs are all built-in routines.** Z8-003/006/101/102 (digest, scheduler never boots), Z8-029/032 (calendar builtins can't fire on the generic path). Verified: `BUILTIN_SPECS` (builtin-routines.ts L95-143) are the practice-meeting / post-bet-retro / portfolio-retro / knowledge-decay set; daily-digest is the one seeded *generic* routine. None of the closed bugs require the generic session path.
- **R-A is VERIFIED TRUE.** `server-factory.ts` L167-181 calls `bootstrapFabric` with only `{...ctx, readAlertPreferences}`; `ctx` is `{ db, eventBus }` (app.ts L77, L511). `dispatcherDeps` is **not** passed, so `registerTaskDispatcher` (bootstrap.ts L77-85) never registers in production. A generic scheduler fire calls `createRoutineSession` (routine-scheduler.ts L241-271), which emits `session_started` and inserts an `active` session that **nobody finalizes** → `shouldCoalesce` (L347-354) stays true forever → the routine bricks itself after one auto-fire. Confirmed: a generic auto-fire bricks by construction, not by edge case. Shipping generic auto-fire in AF6 would manufacture the exact zombie AC3 forbids.
- **AC2 does NOT force the generic path open.** AC2 = "event routines react to current state." Verified already satisfied: `registerEventTriggers` (L494-509) re-reads the routine row inside the handler and checks `current.active`; `registerBuiltinRoutineHandlers` (builtin-routines.ts L271-285) also re-reads. AC2 is a *prove-with-a-regression-test* obligation, not a re-architecture. Scope (iii) covers it.
- **AC3 does NOT force the generic path open** — it argues *for* (iii). AC3 = "manual trigger never bricks." The reaper (§4) self-heals the zombie class for the manual path. Built-ins create no session at all, so they cannot brick. Wiring generic auto-fire (option i) would *enlarge* the AC3 surface, not satisfy it.

**One correction the designer must make to the framing:** option (i) is described as pulling "AD2 provisioning into AF6's blast radius and may overlap AF7." That is the right call to *defer*, but the plan should state plainly that option (i) is a **one-line wiring change already fully in scope** at server-factory.ts L182-184 (`adapterPool`, `workspaceAdapter`, `workspaceBasePath` are constructed and in scope) — the deferral is a *risk* decision (AF7 owns end-to-end task dispatch + provisioning correctness), not a "we can't reach it" decision. Naming it honestly prevents a future reader assuming the wiring is hard. Do not wire it in AF6; do annotate why.

---

## CRITICAL

- **[plan §3, §7 AC5 row] Built-in dispatch writes NO `routine_runs` row — AC5 and AC1's "run history" are unprovable as planned.** Verified: `runBuiltinRoutine` (builtin-routines.ts L204-249) only sets `routines.lastRunAt` on fire; it inserts no `routine_runs` row. The route-trigger builtin branch (routines-routes.ts L543-563) also writes no run row. `GET /api/routines/:id` builds `runs[]` from `routineRuns` (routines-routes.ts L311-317). Therefore, under scope (iii), after a built-in auto-fire: `lastRunAt` advances but `runs[]` stays **empty**. The plan's AC5 verification ("`GET /api/routines/:id` returns `runs[]` populated") **will fail**, and AC1's "last-run reflects real execution" is only half-true (timestamp yes, run record no). The §3 fork as written advances `nextRunAt` but inserts nothing.
  → **Fix:** the §3 builtin fork (and ideally `runBuiltinRoutine` itself, so the manual builtin trigger benefits too) must insert a terminal `routine_runs` row (`outcome: result.fired ? "success" : "skipped"`, `startedAt`, `endedAt`, `costMinor: null`) per fire. Decide one owner (prefer inside `runBuiltinRoutine` for a single source of truth across manual + scheduled paths; the scheduler fork only advances `nextRunAt`). Add an explicit AC5 assertion: after auto-fire, `runs.length >= 1` with a terminal outcome. Without this, AC1/AC5 ship green-but-wrong.

- **[plan §5, §7 AC4 row] AC4 is never proven on the AF6-shipped (auto-fire) path.** Verified: built-ins carry NO cost caps — `BUILTIN_SPECS` and the seed set neither `costCapPerRunMinor` nor `costCapMonthlyMinor`. Built-ins run no session and accrue no cost. Under scope (iii) the *only* auto-fire targets are built-ins, so there is **nothing for AC4 to gate on any routine AF6 actually auto-fires**. The plan routes AC4 to: per-run → AA3 `provisionSession` boundary tests (not an AF6 path), monthly → *manual* generic trigger (not auto-fire). So every AC4 verification lands on a path AF6 does not newly enable. AC4 reads "routine execution is bounded by its per-run and monthly budgets" — on the shipped surface, AF6 enables no budgeted execution.
  → **Fix:** make the AC4↔scope tension explicit and pick one: (a) state in §5 that AC4 is satisfied *by inheritance* (the booted scheduler's generic `checkAndFireRoutine` path reaches the monthly gate at L401-417, even though generic auto-fire is gated off in (iii)) — and back it with an integration test that fires the monthly gate through the booted scheduler on a generic routine *with a cap and a dispatcher-less stub*, asserting `monthly_budget_exhausted` is written and no session is created (this is reachable: the monthly check at L401-417 runs before `createRoutineSession` at L442); or (b) explicitly scope AC4-on-auto-fire to AF7 and record it as a deferred-AC in the workpackage register, not a silently-passed AC. Option (a) is preferred — it proves budget-gates-execution on the *booted* path, which is the AC's intent, without enabling the zombie. Do not let AC4 pass on AA3-era tests alone; that proves the old boundary, not AF6's boot.

## WARNING

- **[plan §3] The builtin `nextRunAt` advance is fire-and-forget and racy against the next poll tick.** The fork does `void runBuiltinRoutine(...).then(advance nextRunAt)`. `runBuiltinRoutine` is async (knowledge-decay sweep, portfolio JOINs). With a 30s prod interval this is fine, but the plan's own AC1 test uses a 50ms interval (see `AD5-routine-scheduler-boot.integration.test.ts` L28) — between dispatch and the `.then()` resolving, the next poll can re-select the same routine (its `nextRunAt` is still in the past) and double-fire. The route trigger is one-shot so never hit this; the scheduler will.
  → **Fix:** advance `nextRunAt` (or set a sentinel) *synchronously before* dispatch, then run the builtin — mirror how `checkAndFireRoutine` computes `nextRunAt` and updates the row as part of the fire, not after. Or add a coalescing guard for builtins. Add a test asserting exactly one run row per due-window at a fast poll interval.

- **[plan §4] Reaper periodic cadence left "optional" — but AC3-under-restart depends on it, and the boot one-shot alone has a gap.** §4 proposes a boot one-shot plus an "optional" periodic sweep (task 7 also marked optional). The boot one-shot clears zombies from a *previous* process, but a session that hangs *during* the current long-lived process (adapter hang, no restart) is never reaped until the next boot. The plan acknowledges the route try/catch covers crash-completes, leaving only process-death — but an in-process adapter hang is neither a crash-complete nor a process death.
  → **Fix:** make the periodic reaper non-optional (the ~5-min guarded cadence the plan already sketches), OR justify in §4 that an in-process hang cannot leave an `active` session without an eventual `endSession`/`crashSession` (cite the harness timeout that guarantees it). Don't ship AC3 resting on "optional."

- **[plan §7] AC2 verification is thin — "likely already passing" risks a tautological test.** The plan flags AC2 as probably already met and adds "the explicit regression test." A regression test that flips `active`/`triggerConfig` after registration must assert the handler reads the *new* row, not that the routine fires at all. The genuine snapshot risk the test must kill: a handler that closed over the registration-time `routine` object. Verified the current code re-reads (L497-501), so the test must be written to *fail* against a hypothetical snapshot implementation (e.g. flip `active:false` after registration, emit event, assert NO fire; then flip back, assert fire) — not merely "emit event, assert fire."
  → **Fix:** specify the AC2 test as a two-phase flip (disable-after-register → no fire; re-enable → fire) so it actually discriminates fresh-read from snapshot. As written ("flip active/triggerConfig, assert behavior matches new state") it's close but state the negative assertion explicitly.

- **[plan §6 / R-B] Existing-DB daily-digest stays dark and the plan ships it that way without a register entry.** §2(b)/R-B correctly refuse to auto-flip `active:false` (operator intent). But the founder-facing AC1 promise ("built-in cron routines fire automatically") will be *false for daily-digest on every existing install* — and daily-digest is the headline routine. The plan flags this for critique but proposes no resolution path beyond "manual PATCH/re-seed."
  → **Fix (decision):** daily-digest is a *generic* routine (`taskId: seed-task-daily-digest`), so under scope (iii) it would NOT auto-fire even if `active:true` — it needs the dispatcher (AF7). State this plainly: daily-digest auto-fire is **AF7**, not AF6, regardless of the `active` flag. AF6's §2 seed change to flip daily-digest `active:true` (task 6) is therefore premature and possibly misleading — it would make a generic routine "active" that the (iii)-scoped scheduler deliberately won't fire (or, worse, would fire into the zombie path if the generic skip-guard isn't airtight). Reconcile §2(a) (flip daily-digest active) against §3 (skip generic routines without a dispatcher): either don't flip it in AF6, or ensure the generic-skip guard (`canProvision`) provably prevents the daily-digest zombie. This is the sharpest internal contradiction in the plan.

## SUGGESTION

- **[plan §3] Confirm the `canProvision` guard is actually in the plan's task list.** §3 names a `canProvision` guard as "the recommended posture" to skip generic routines, but §8's ordered tasks (1-9) never explicitly create it — task 3 is "builtin dispatch fork." Given the daily-digest contradiction above, the guard is load-bearing, not optional. Promote it to an explicit task.
- **[plan §1, R-E] Option-A disposer race test is cheap and worth making non-optional.** The plan already proposes it (build app, dispose immediately, assert no leaked interval). Keep it in the red set, not "cheap to add."
- **[plan §6] Builtins emit no `routine_fired` event.** Verified: only `checkAndFireRoutine` (L465-471) emits `routine_fired`; `runBuiltinRoutine` does not. The notification dispatcher subscribes to `routine_fired` for daily-digest only (dispatcher.ts L771), so this is benign for the 4 built-ins today — but if observability (Hard rule 1) is meant to surface *every* fire via the event stream, built-in fires are invisible to event consumers. Note it: built-in observability rests on the `routine_runs` row (per CRITICAL #1) + `lastRunAt`, not the event. Acceptable, but state it so a future consumer doesn't assume `routine_fired` covers built-ins.
- **[plan §7] `AD5-routine-scheduler-boot.integration.test.ts` is mislabeled** — it calls `startRoutineScheduler` directly (L101), it does NOT exercise boot wiring via `bootstrapFabric`. The plan's separate "Boot wiring is real" row correctly adds a true boot test; just don't let the existing file's name imply boot coverage already exists.

## What's Working Well

- **The R-A root-cause analysis is excellent and verified true end-to-end.** Tracing dispatcher-not-registered → `session_started` consumed by nobody → permanent `active` session → `shouldCoalesce` brick is exactly right, and the scope decision that falls out of it (ship built-ins, defer generic) is the correct, minimal, AC-honest call. This is the hard part of AF6 and the plan nailed it.
- **Disciplined "wire, don't rebuild" posture.** Option A over B for boot (lowest blast radius, matches existing disposer pattern), no schema migration (verified: all columns and the closed `RoutineRunOutcome` set already exist), no BullMQ (honors Z8-165), and abstract cost interface (compare `sum(costMinor) >= cap`, no hardcoded magnitudes) coordinating cleanly with AF10. The rejection list and design-it-twice (Option A/B) are genuine, not theatre.

---

## Re-critique (Revision 1)

RE-CRITIQUE-SCORE: 8/10  (was 7/10)  Verdict: **APPROVED for builder** — both CRITICALs RESOLVED, all 4 WARNINGs RESOLVED, score ≥7.

Method: each fix verified against real code, not the plan's prose. Both CRITICALs genuinely closed (not hand-waved); fix code matches actual schema/type definitions.

### CRITICAL 1 — run-row for built-in fires — **RESOLVED**
- §3a inserts a terminal `routine_runs` row inside `runBuiltinRoutine`. Single source of truth (manual + scheduled parity); §3 scheduler fork only advances `nextRunAt`, writes no row — no double-insert. Correct ownership.
- Row fields valid against real code:
  - `outcome: result.fired ? "success" : "skipped"` — both in the closed set (`packages/shared/src/routine.ts` L34-41). No type change. ✔
  - `routineRuns` schema (`packages/db/src/schema.ts` L344-370): required cols are `id`, `routineId`, `startedAt`, `outcome` — all supplied. `endedAt`/`costMinor` nullable; plan supplies both. `costMinor: 0` is a valid `integer`. ✔
- Disabled short-circuit (L214-216 returns before the switch, before any row) preserves AC2's negative assertion. ✔
- AC5 `runs[]` now populates: `GET /api/routines/:id` builds `runs[]` from `routineRuns`; with the inserted row, `runs.length >= 1`. The §7 AC5 case asserts exactly this. ✔
- Minor (non-blocking): plan sets `lastRunAt` only on `result.fired`, matching existing L241-246; but inserts the run row on both `fired` and `skipped`. Consistent and intentional (observability of no-op fires) — not a contradiction.

### CRITICAL 2 — AC4 monthly gate on the booted path — **RESOLVED**
- Verified against `routine-scheduler.ts` `checkAndFireRoutine`: the monthly-cap gate is at **L401-417** (`costCapMonthlyMinor != null` → `getRoutineMonthlySpend` → on exceed inserts a `monthly_budget_exhausted` `routine_runs` row, advances `nextRunAt`, **returns at L415**). `createRoutineSession` is at **L442**. The gate returns *before* any session insert. **No zombie session on the gated path — confirmed in code.** ✔
  - (The plan cites "L399-415 < L441"; actual lines are L401-417 < L442. Off-by-one in the citation, behavior identical — not a defect.)
- The AC4 test (§7) boots via `bootstrapFabric` with `canProvision:true` + dispatcher-less harness, asserts a `monthly_budget_exhausted` row AND **no `sessions` row**. This is the correct discriminator: it proves the gate fires before the session boundary on the *booted* path, not on AA3-era boundary tests. ✔
- Per-run-cap deferral to AF7 is **honest given scope (iii)**: built-ins carry no per-run session cost (`costMinor:0`, no provisioned session), so per-run cap is a structural no-op for every routine AF6 auto-fires. There is no budgeted auto-fire execution to gate until AF7/AD2 wires the dispatcher. Recorded as an explicit DEFERRED-AC fragment, not silently passed. Correct. ✔
- R-A re-verified: `server-factory.ts` L167-181 calls `bootstrapFabric({...ctx, readAlertPreferences})` only — `dispatcherDeps` not passed (the `adapterPool`/`workspaceAdapter`/`workspaceBasePath` are siblings passed to `createApp`, not into bootstrap). Generic auto-fire would brick. Scope (iii) + `canProvision:false` default stands. ✔

### WARNING 1 — synchronous nextRunAt advance — **RESOLVED**
§3 advances `nextRunAt` via `await db.update(...)` **before** `void runBuiltinRoutine(...)`. The row is no longer `nextRunAt <= now` before the next poll tick can re-select it. Mirrors the in-fire advance pattern `checkAndFireRoutine` already uses. §7 AC1 adds the single-fire-at-fast-poll assertion. Race closed. ✔

### WARNING 2 — periodic reaper non-optional — **RESOLVED**
§4 makes the periodic sweep **required**, with the correct justification: an in-process adapter hang is neither a crash-complete (route try/catch) nor a process death (boot one-shot) — only the periodic sweep catches it. Implemented as a poll-loop sweep guarded by a last-reaped timestamp (~5-min cadence, no second interval). Promoted to explicit task 6. §7 AC3(b) adds the in-process-hang periodic-sweep test. `timeout` outcome confirmed in the closed set. Reaper query (`state='active' AND routineId IS NOT NULL AND startedAt < cutoff`) is valid and indexed (`sessions_state_idx`, `sessions_routine_id_idx` both exist, schema.ts L242-243). ✔

### WARNING 3 — AC2 two-phase flip — **RESOLVED**
§7 AC2 now: phase 1 disable-after-register → assert NO fire and no run row; phase 2 re-enable → assert fire. The negative assertion discriminates fresh-read from snapshot-at-registration. Code already re-reads (L497-502: re-selects `current`, checks `current.active`), so the test passes — but it is now written to fail against a hypothetical snapshot impl, which is the point. ✔

### WARNING 4 — daily-digest contradiction — **RESOLVED**
The sharpest prior contradiction is gone. Daily-digest is generic (`taskId`); §2 no longer flips `active:true`; auto-fire documented as AF7-deferred (DEFERRED-AC fragment in R-B). The `canProvision` generic-skip guard is promoted to an explicit, load-bearing task (§3 + task 4) — without it daily-digest would fire into the zombie path. §2/§3/R-B now consistent. ✔

### SUGGESTIONS — all addressed
`canProvision` guard now an explicit task (task 4); Option-A disposer-race test in the red set (task 1 / R-E); built-ins-emit-no-`routine_fired` documented (§3a observability note); `AD5-...test.ts` mislabel called out (§9 note). ✔

### Score rationale: 7 → 8
SA:7 LI:9 AC:8 DM:8 N:8 MD:7 FMC:8 S:7 V:8. AC-traceability (the two holes that capped the prior score) is closed and code-verified; verifiability up (every fix has a named failing-test target tied to a real line). Not 9: per-run-cap-on-auto-fire and daily-digest auto-fire are honestly deferred but still leave AC4/AC1 partially proven on the AF6 surface (correctly scoped, but the workpackage register must carry the two DEFERRED-AC fragments or a future reader will read AC4/AC1 as fully shipped).

**Builder gate: APPROVED.** Both CRITICALs resolved, all WARNINGs resolved, score 8/10 ≥ 7. Nothing NOT-RESOLVED. One non-blocking carry-forward for the builder: register the two DEFERRED-AC fragments (per-run-cap-on-auto-fire → AF7; daily-digest auto-fire → AF7) in the workpackage register so they are not mistaken for shipped ACs.
