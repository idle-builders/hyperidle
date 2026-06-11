# AF6 — Concept Probe: Routine Scheduler Boot

## Conclusion: WIRED, not reshaped

No primitive is introduced or reshaped. `Routine`, `RoutineRun`, the scheduler, the five seeded
routines, budget caps (per-run + monthly), coalescing, and the session-lifecycle hook **already
exist and are type-green** (AA1/AA2/AA3/AD5/AD8c). AF6 connects parts that were built but never
joined and fixes four correctness gaps. The routine *execution/trigger model* is unchanged — the
contracts below are restated, not redefined. **No BLOCKER raised** for upstream `/concept`.

There is no `docs/concept/` dir; this is inline probing, per task brief.

## Required reading (downstream `/architecture` + builder)

- `packages/fabric/src/services/routine-scheduler.ts` — poll loop, `checkAndFireRoutine`, `registerEventTriggers`, `computeNextRunAt`, `shouldCoalesce`, monthly-cap helper.
- `packages/fabric/src/services/builtin-routines.ts` — `BUILTIN_ROUTINE_IDS`, `isBuiltinRoutineId`, `runBuiltinRoutine`, `registerBuiltinRoutineHandlers`.
- `packages/fabric/src/bootstrap.ts` — `bootstrapFabric` disposer assembly (where the scheduler must boot).
- `packages/server/src/app.ts` (≈380–399, 505–548) — route wiring + disposer list; `strategyBootstrap` signature.
- `packages/server/src/routes/routines-routes.ts` — create-routine (`nextRunAt`/`taskId` config), `POST /:id/trigger` (builtin branch, coalescing, monthly cap, provision path).
- `packages/server/src/services/session-lifecycle.ts` (≈50–116, `endSession`/`crashSession`) — `updateRoutineRunOnSessionEnd`, the running→final transition.
- `packages/server/src/services/session-provisioning.ts` (≈519–605, 686–739) — per-run cap enforcement + outcome plumbing.
- `packages/db/src/schema.ts` — `routines`, `routineRuns` columns.
- `packages/db/src/seed.ts` (≈360–430) + `packages/db/src/seed-fixtures.ts` (`BUILTIN_ROUTINE_SEEDS`) — production seed; the "Daily digest" + 4 builtins.
- `packages/shared/src/routine.ts` — `RoutineRunOutcome` closed set (incl. `budget_exhausted`, `monthly_budget_exhausted`), `ROUTINE_STATES`.
- Tests to honor/avoid duplicating: `AD5-routine-scheduler-boot.integration.test.ts`, `routine-scheduler.integration.test.ts`, `AA3-routine-cost.integration.test.ts`, `routines.routes.integration.test.ts`.

## Nouns

| Noun | Classification | Note |
|---|---|---|
| **Routine** | Stable | A schedule/trigger definition owned by an agent. Input, unchanged. |
| **RoutineRun** | Stable | One append-only execution record. Input, unchanged. |
| **Scheduler** | Stable (process) | In-process poll loop + event subscriptions. Wired, not reshaped. |
| **Trigger** | Stable | `calendar`/`heartbeat`/`continuous`/`event`. No new variants. |

## Probes (only the unsettled ones)

### P1 — Scheduler identity: what dispatch does a fire perform?
A Routine fire is **not** uniformly "create a session." Two execution shapes already coexist and AF6
must respect both:
- **Operator/generic routines** (have `taskId` in trigger config) → create a session via `checkAndFireRoutine` → agent works → `routine_run` finalized by session lifecycle.
- **Built-in routines** (`builtin:` prefix, no `taskId`) → `runBuiltinRoutine` writes review items / sweeps directly, **no session**, sets `lastRunAt` itself.

**Read:** the scheduler poll loop today only knows the session shape. The fix is a dispatch fork on
`isBuiltinRoutineId`, mirroring what `POST /:id/trigger` already does (routes-routes.ts L543). This is
the load-bearing gap behind Z8-101/102/029/032 — calendar builtins have no `taskId`, so the generic
path returns `{fired:false, reason:"no taskId"}` and they never fire even with a booted scheduler.

### P2 — "Fresh state read" contract — already satisfied?
Spec AC2 asks event-driven routines react to CURRENT state, not a registration snapshot.
**Read:** `registerEventTriggers` (L494–509) already re-reads the routine row inside the handler and
checks `current.active`. The poll loop (L531) already `SELECT`s fresh each tick. So AC2 is largely
*already met for the generic path*. The genuine snapshot risk is `registerBuiltinRoutineHandlers`
(builtin-routines.ts L271–285), which also re-reads — also fine. AF6's job is to **prove** AC2 with a
test (flip `active` after registration, assert behavior), not to re-architect. If a hidden snapshot is
found, fix in place; do not introduce a new event model.

### P3 — Zombie session contract (AC3): what makes a routine "bricked"?
`shouldCoalesce` returns true while **any** session with `state='active'` exists for the routine, and
the generic trigger inserts `routine_run` outcome=`running`. If the harness session neither ends nor
crashes (process restart mid-run, adapter hang), the session stays `active` and the run stays
`running` forever → every future fire coalesces away. **A routine can be permanently disabled by one
stuck run.** AC3 demands the Trigger path can never leave this state. The contract: *coalescing must
key on liveness that self-heals, or stale `running`/`active` routine sessions must be reaped on boot.*
This is the one place AF6 adds new behavior (a reaper), not just wiring.

### P4 — Budget enforcement (AC4): build or wire?
Per-run cap (`session-provisioning.ts` L599–602 → `budget_exhausted`) and monthly cap
(`getRoutineMonthlySpend` + `monthly_budget_exhausted` in both scheduler and trigger route) already
exist and gate execution. **Read:** AF6 does NOT build budget enforcement — it (a) ensures the booted
scheduler path actually reaches these checks, (b) keeps the cost source abstract so AF10 can supply real
figures. The only AF6 obligation: do not hardcode cost numbers; cost flows from `cost_update` harness
deltas (already the case). The interface to AF10 is the existing `routineRuns.costMinor` column + the
`recordCostAndCheck` path — AF6 touches neither's semantics.

## Rejection list (what AF6 is NOT)

- **Not a new scheduler primitive.** No BullMQ/Redis/external cron. The in-process `setInterval` poll + EventBus subscriptions are the model. Reason: single-process laptop/VPS deployment; an external queue adds an operational dependency the constraint explicitly forbids (Z8-165: the BullMQ claim in CLAUDE.md is false).
- **Not a rebuild of budget caps.** AA3 shipped them. Reason: re-implementing risks contradicting AF10's cost numbers; AF6 only ensures the booted path reaches existing gates.
- **Not a session-lifecycle redesign.** `updateRoutineRunOnSessionEnd` (match on routineId + outcome=`running`) stays. Reason: the running→final transition is correct; AF6 only adds a reaper for sessions that never reach it.
- **Not a UI change.** AC5 ("founder observes auto-runs") is satisfied by `routine_runs` populating + `lastRunAt`/`nextRunAt` advancing through *existing* `GET /api/routines/:id` surfaces. No new endpoint, no new component.
- **Not a cron-semantics change.** First-Monday AND-semantics (`0 10 1-7 * MON`) is pinned by tests; do not touch `parseCron`/`fieldMatches`.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Routine** | Owned schedule/trigger definition (row in `routines`). | job, cron, task, schedule |
| **RoutineRun** | One execution record (row in `routine_runs`). | run-log, history-entry, execution |
| **Scheduler** | In-process poll loop + event subscriptions started at boot. | cron daemon, queue, worker |
| **Fire** | One scheduler-initiated execution attempt of a routine. | run (verb), tick, invoke |
| **Builtin routine** | System-seeded routine with `builtin:` id; executes via `runBuiltinRoutine`, no session. | seeded job, system cron |
| **Reaper** | Boot-time + periodic sweep that finalizes stale `running` routine sessions. | cleaner, gc, janitor |

## Contracts

- **Cardinality.** One Routine → 0..n RoutineRuns. At most one RoutineRun with outcome=`running` per routine at a time (coalescing invariant — the reaper must preserve it).
- **Closure.** `RoutineRunOutcome` is a **closed** set (`running | success | error | skipped | timeout | budget_exhausted | monthly_budget_exhausted`). Adding a variant requires updating `packages/shared/src/routine.ts` first. AF6 adds none.
- **Mutability.** A RoutineRun is append-once then finalized once (`running` → terminal). After a terminal outcome it is immutable. `lastRunAt`/`nextRunAt` on the routine are mutable by the scheduler only.
- **Identity.** Routine = stable id (`builtin:*` for seeds, UUID otherwise). RoutineRun = opaque UUID.
- **Hard rule 1 (observability).** A booted scheduler and every fire MUST be observable in logs/state — not silent. The scheduler logs start; each fire emits `routine_fired` and/or writes a `routine_run`.
- **Hard rule 2 (no brick).** No Trigger or fire may leave a routine permanently ineligible for future runs. A stuck session must be reapable; coalescing must self-heal.
- **Hard rule 3 (budget gates execution).** Exceeding per-run or monthly budget records a budget outcome (`budget_exhausted` / `monthly_budget_exhausted`) — never a silent overrun.
- **Hard rule 4 (no external scheduler).** Scheduling stays in-process.

## Rationale

The founder reframe: built-in routines are the product's *autonomous heartbeat* — the daily digest,
knowledge decay, retros are what make HyperIdle "an OS that runs itself," yet today none fire because
`startRoutineScheduler` has no boot caller and the seeded rows are mis-configured for the path that
would run them (no `nextRunAt`, no `taskId`, daily-digest `active:false`, builtins needing the
`runBuiltinRoutine` fork the scheduler lacks). This is the gap between "the machinery exists" and "the
machine is plugged in." The zombie-session risk (P3) is the subtle one: a feature that *fires* but can
*permanently brick itself* on one stuck run is worse than one that never fires, because it fails
silently after working once. AF6's value is correctness of an existing model under boot, not new model.
