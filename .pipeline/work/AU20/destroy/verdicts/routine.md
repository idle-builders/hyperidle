# routine — destroyer verdict

## Should this service exist?

**KEEP AS: routine definition store + the generic scheduler.** Routines are one of the five process primitives, with real doors on all three fronts: UI (`/api/routines/*` CRUD + trigger, WorkRoutine page, RoutineDetailPane, team routine cards), agent tools (`create_routine`, `update_routine`), and the scheduler timer (`TICK every config.pollIntervalMs`, wired at `layers/core-api/src/service-bootstrap.ts:586`). "Recurring work fires an agent session on a clock or an event" is core HyperIdle.

**But half the package is a parallel second product that must die: the builtin-routine subsystem.** `fireBuiltinRoutine` is a second execution path that bypasses the entire agent-run architecture — no session, no intent queue, no skill. The four builtins run hardcoded TypeScript templates. The founder has already flagged this ("post-bet-retro bypasses the intent queue"). Three structural facts convict it:

1. **The per-team seeding is broken by construction.** `runKnowledgePromotion`, `runKnowledgeDecay`, and `runPortfolioRetro` take no teamId — the sweeps are global (`ports.ts:52-86`, wired to global `sweep(db, eventBus, ...)` in `routine-scheduler-bindings.ts`). Yet `provisionTeamRoutines` seeds each per team (`builtin:knowledge-decay:<teamId>`), so N teams fire the same global sweep N times daily and portfolio-retro writes N duplicate monthly items, all hosted at `factory/portfolio`.
2. **The "retros" are form letters, not retros.** `runPostBetRetro` writes `Hypothesis: X / Reality: completed at <date>` — field interpolation, no agent, no analysis. Each builtin spec carries a `skillId` (`bet_retro`, `portfolio_retro`, …) that nothing ever executes. The generic path (`triggerType:"event"` + skill + agent run) is the first way to do exactly this; the builtin path is the second way.
3. **The maintenance sweeps don't need routine rows.** Knowledge decay/promotion are clocks calling knowledge-service functions. They need a `setInterval` at the composition root, not per-team DB rows, id-string parsing (`builtin:kind:teamId`), a switch dispatch, and run records.

Survivors of the kill route nowhere — the generic machinery in this same package already covers the product need.

## If written today, from scratch

Ten exports:

- `insertRoutine`, `updateRoutine`, `getRoutine`, `listRoutines` — definition CRUD (UI + agent tools)
- `insertRoutineRun`, `updateRoutineRun`, `getRoutineRun`, `listRoutineRuns` — run records (coalescing guard, session-end closure, run history in the UI)
- `fireGenericRoutine` — the one firing path: resolve + bake + enqueue intent (resolver folded in)
- `startRoutineScheduler` — the tick loop + event-trigger registration
- plus `humanizeSchedule` as presentation sugar with a real UI door

Nothing named `builtin:*` exists.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 5 |
| MERGE | 1 |
| SIMPLIFY | 5 |
| KEEP | 6 |

Surface: 17 methods → 11 exported methods (35% of methods gone outright, 5 of the rest shrunk). Of ~860 lines in `routine-scheduler.ts`, roughly 470 (the builtin subsystem: lines 72–536 minus the generic pieces) are deleted.

## Feature-level kills

1. **Builtin routines — the whole subsystem.** Dies: `BUILTIN_ROUTINE_IDS`, `BUILTIN_SPECS`, `isBuiltinRoutineId`, `extractBuiltinKind`, `provisionTeamRoutines`, `fireBuiltinRoutine`, `registerBuiltinRoutineHandlers`, `runPostBetRetro`/`runPortfolioRetro`/`runKnowledgeDecay`/`runKnowledgePromotion`, the builtin branch of the scheduler tick, and the ports blocks that exist only for them (`work`, `conversation`, `knowledge`). Callers to kill with it: the builtin branch of `POST /api/routines/:id/trigger` (`routines-routes.ts:353`), `POST /api/org/team-routines` (`org.ts:331`), the `provisionTeamRoutines` call in `POST /api/teams` (`teams-routes.ts:216`), the seeding step in the `create_team` tool, `registerBuiltinRoutineReactions` + the builtin dispatch in `fireRoutine` (`routine-scheduler-bindings.ts`), and `tools/eval/src/scenarios/builtin-routines.ts`. What breaks and why it's acceptable — see Holes.
2. **Portfolio retro — dead forever.** A monthly review item that dumps a list of recent L3/L4 knowledge-item titles. A report nobody asked for, duplicated per team. No replacement.
3. **The reaper piggyback in the scheduler tick.** `config.reap`/`reaperCadenceMs`/`ROUTINE_REAPER_CADENCE_MS` — **never wired in production** (`service-bootstrap.ts:586` passes `reaperCadenceMs` but no `reap`; no production caller anywhere passes `reap:`). Dead branch shipped as config surface. Delete both fields; bootstrap stops threading `reaperCadenceMs`.
4. **Routine soft-delete.** `deletedAt` + `includeDeleted` + `DELETE /api/routines/:id` is a second off-switch next to retire (`active:false`), which the scheduler, manual trigger, and resolver all already honor. One off-switch. Hard-delete or drop the route; `includeDeleted`'s only production caller (`settings/src/plugin-configuration.ts:711` backfilling config defaults *for deleted routines*) then just reads all rows.
5. **Skipped-run audit rows on manual trigger.** `recordSkippedRun` writes a `skipped` run row whose only purpose is recording that nothing happened; the HTTP response already tells the caller `"coalesced"`. Audit trail nobody reads.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `isBuiltinRoutineId` | UI:POST /api/routines/:id/trigger, SCHED:TICK pollIntervalMs | DELETE | Exists only to recognize builtin id strings; dies with the builtin subsystem, kill both callers' builtin branches. |
| 2 | `extractBuiltinKind` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:bet_state_changed | DELETE | Id-string parsing (`builtin:kind:teamId`) for the subsystem being deleted. |
| 3 | `provisionTeamRoutines` | UI:POST /api/teams/, UI:POST /api/org/team-routines, AGENT:create_team | DELETE | Seeds per-team rows for global sweeps — N teams fire the same global sweep N times. Nothing to seed once builtins die; kill all three doors' seeding steps. |
| 4 | `fireBuiltinRoutine` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:bet_state_changed | DELETE | Second execution path bypassing the agent-run architecture; runs hardcoded templates, never the `skillId` its own specs declare. The generic path is the first way. |
| 5 | `registerBuiltinRoutineHandlers` | BOOTSTRAP (`routine-scheduler-bindings.ts:156` → `service-bootstrap.ts`) | DELETE | Subscribes bet_state_changed to write a form letter (`Hypothesis: X / Reality: <date>`) with no agent involved. Dies with the subsystem; hole named below. |
| 6 | `fireGenericRoutine` | UI:POST /api/routines/:id/trigger, SCHED:TICK, EVENT:<db-configured eventType> via registerEventTriggers | SIMPLIFY | The core firing path — keep. Drop `recordSkippedRun` (audit row duplicating the HTTP response) and absorb the resolver (row 16); return type shrinks to `{fired, reason?, runId?}`. |
| 7 | `startRoutineScheduler` | BOOTSTRAP (`service-bootstrap.ts:586`) — IS the SCHED:TICK door | SIMPLIFY | The timer door — keep. Delete the builtin branch of the tick and the never-production-wired `reap`/`reaperCadenceMs` machinery. |
| 8 | `insertRoutine` | UI:POST /api/routines/, AGENT:create_routine, UI:POST /api/teams/ | SIMPLIFY | Keep the write. Drop `opts.onConflictDoNothing` — its only caller is `provisionTeamRoutines` (row 3, deleted). |
| 9 | `updateRoutine` | UI:PATCH /api/routines/:id, UI:POST /api/routines/:id/retire, AGENT:update_routine, SCHED:TICK, EVENT:session_ended | KEEP | Core value: retire toggle + the scheduler's `nextRunAt`/`lastRunAt` advance. Doors: PATCH route, update_routine tool, tick. |
| 10 | `getRoutine` | UI:GET /api/routines/:id (+5 more routes), AGENT:update_routine, SCHED:TICK | KEEP | Core value: every route and the scheduler load the definition through it. Door: GET /api/routines/:id. |
| 11 | `listRoutines` | UI:GET /api/routines/, UI:GET /api/teams/:teamId, SCHED:TICK, BOOTSTRAP (settings backfill via boot.ts) | SIMPLIFY | Keep the list. Drop `includeDeleted` with the soft-delete kill (sole production caller backfills config defaults for deleted routines — pointless work); other filters are all live. |
| 12 | `insertRoutineRun` | UI:POST /api/routines/:id/trigger, SCHED:TICK | KEEP | Core value: the run row is load-bearing — the coalescing guard and the resolver validate against it. Door: SCHED:TICK. |
| 13 | `updateRoutineRun` | SCHED:TICK, EVENT:session_ended, EVENT:agent_run_lifecycle_changed, EVENT:agent_run_admission_failed | KEEP | Core value: closes runs on session end / admission failure; `onlyIfRunning` race guard has three live production callers. Door: SCHED:TICK via the reactions. |
| 14 | `getRoutineRun` | SCHED:TICK (via resolver), EVENT:session_ended | KEEP | Core value: resolver validation + session-end closure both read the run row. Door: SCHED:TICK. |
| 15 | `listRoutineRuns` | UI:GET /api/routines/:id, UI:GET /api/teams/:teamId, SCHED:TICK | SIMPLIFY | Keep — run history in the UI and the coalescing guard. Drop `order`: no production caller ever passes `"asc"`; hardcode desc. |
| 16 | `resolveRoutineRunRequest` | INTERNAL (sole caller: `fireGenericRoutine`) | MERGE | One caller, one transaction, plus a `RoutineRunResolverDeps` interface mirroring fields `RoutineSchedulerPorts` already carries. Fold into `fireGenericRoutine`, unexport. |
| 17 | `humanizeSchedule` | UI:GET /api/routines/:id, UI:GET /api/teams/:teamId | KEEP | Core value: readable schedules ("Every Monday at 10:00 AM") on the routine cards and detail pane — the primitive's main surface, real UI door, pure, zero deps. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `RoutineRunSourceUnavailableError` (class) | SIMPLIFY | Unexport. After row 16's merge its only job — distinguishing expected rejection from infra failure — lives inside one file. |
| `RoutineSchedulerPorts` | SIMPLIFY | Drop `work`/`conversation`/`knowledge` blocks — every member serves only deleted builtin bodies. Survives as `{settings, workIntents, requireRunnableAgent, getTeamById, assembleSessionKnowledge}`, absorbing `RoutineRunResolverDeps`. |
| `BuiltinRoutineId` | DELETE | Dies with the builtin subsystem. |
| `RunBuiltinResult` | DELETE | Return type of a deleted function. |
| `PostBetRetroArgs` | DELETE | One-field args type for a deleted function. |
| `FireResult` | SIMPLIFY | `sessionId`/`emitted`/`extra` are never set by `fireGenericRoutine` — they exist for the builtin merge in the bindings. Shrink to `{fired, reason?, runId?}`; the bindings' duplicate `FireRoutineResult` copy dies too. |
| `RoutineSchedulerConfig` | SIMPLIFY | Drop `reap` + `reaperCadenceMs` (never production-wired). Survives as `{pollIntervalMs, canProvision?}`. |
| `RoutineScheduler` | KEEP | The stop handle the bootstrap disposer holds. Named door: BOOTSTRAP (`service-bootstrap.ts` disposer). |
| `Routine` | KEEP | The row type; used by routes, reactions, bindings, tools. |
| `RoutineRun` | KEEP | The row type for run records. |
| `RoutinePatch` | SIMPLIFY | Drop the `\| SQL` widening — its own @lore admits it is "not tied to any specific caller need anymore". `Partial<NewRoutine>`. |
| `RoutineRunPatch` | SIMPLIFY | Same: drop `\| SQL`, no production caller passes a fragment. |
| `BakedRoutineRunRequest` | KEEP | The emit-time contract the work-intent seam and agent-orchestration drain consume. Named door: SCHED:TICK → `enqueueWorkIntent`. |
| `RoutineRunResolverDeps` | MERGE | Dies as a declaration when row 16 merges — its four fields are already on `RoutineSchedulerPorts`. |

## Holes this leaves

1. **No automatic post-bet retro.** Completing a bet no longer produces the hypothesis-vs-reality item. What's lost is a form letter, not analysis. The honest replacement is a generic event routine (`triggerType:"event"`, `eventType:"bet_state_changed"`, `skillId:"bet_retro"`) firing a real agent run — but two capability gaps stand in the way today: `registerEventTriggers` ignores the event payload (the agent would not know which bet), and there is no `toState==="completed"` filter (it would fire on every state change). Ship broken-and-simple now; the founder already has "post-bet-retro bypasses the intent queue" parked as its own story — that story becomes "rebuild it as a generic event routine with event payload".
2. **No knowledge decay/promotion until re-wired.** Two `setInterval`s at the composition root calling `sweep(db, eventBus, "stale")` / `sweep(db, eventBus, "autoPromotion")` + `recomputeAttentionForCandidates` — about ten lines in `service-bootstrap.ts`, and the sweeps run once per day instead of once per team per day. Until written, stale knowledge doesn't decay and provisional items don't auto-promote.
3. **Portfolio retro is gone with no replacement.** Deliberate.
4. **New teams get an empty routine list.** No seeded rows. That is the correct default — routines are something the user or their agents create, not ceremony pre-installed four-deep per team.
5. **Manually triggering a coalesced routine leaves no `skipped` row.** The HTTP response still says `"coalesced"`; the history just doesn't record non-events.
6. **Deleted-routine history semantics change.** With hard delete, a routine's run rows go with it (FK) — acceptable; retire (`active:false`) remains the way to stop a routine while keeping its history.
