/**
 * Barrel for @hyperidle/routine (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw
 * `routines`/`routineRuns` pgTable objects — that would let a consumer obtain
 * a table transitively and defeat Table ACL (Mechanism A). Consumers get
 * typed functions; the tables stay private to this Service.
 *
 * @lore AU19 Increment 1i: this is the real cut-over — `routine-service.ts`
 * moved here from `packages/server/src/` unchanged (behavior-preserving
 * move). Per architecture §10.2's composition census, `routine` has ZERO
 * real outbound edges (it is a pure leaf Service — a target-only row in
 * every consumer's edge list, never itself a source), so there is no
 * `ports.ts` here, unlike `work`/`org`/`settings`/etc. Every real consumer
 * (`settings`'s `plugin-configuration.ts` via its `RoutineReader` port,
 * `context-assembly`/`dispatch`/`lifecycle-projection`/`session-lifecycle`/
 * `session-requests`/`tools` — all still-monolithic `packages/server/src/`
 * files awaiting their own Increment-2/3 migration) now imports
 * `@hyperidle/routine` directly instead of `../routine-service.js`.
 *
 * `layers/core-api/src/routines.ts` remains the curated cross-package seam
 * consumed by `tools/eval`. It exposes the bound `DispatchOps` object;
 * routine storage stays isolated in this SQL-owning Service.
 *
 * @lore AU20 Am2: surface collapsed 24 → 15 exports (11 functions + 4 types).
 * Key collapses:
 *   - `getRoutineById` → `getRoutine`
 *   - `updateRoutineById` → `updateRoutine`
 *   - `listRoutines` (old opts) + `listRoutinesByTeam` + `listActiveRoutines`
 *     + `listScheduledRoutinesMissingNextRunAt` + `countRoutinesByTeam`
 *     → `listRoutines(filter)` (count via `.length`)
 *   - `getRoutineRunById` → `getRoutineRun`
 *   - `updateRoutineRunById` + `updateRoutineRunIfRunning`
 *     → `updateRoutineRun(exec, id, patch, opts?)`
 *   - `listRoutineRunsByRoutine` + `findRunningRoutineRun`
 *     → `listRoutineRuns(filter)` (`{running:true,limit:1}[0]`)
 *   - `avgRoutineRunCost` + `sumRoutineRunCostSince` + `sumRoutineRunCostForRoutinesSince`
 *     were collapsed to `sumRunCost({routineIds,since?,kind})` at AU20 —
 *     since deleted entirely (AU21 Increment 14a, cost feature HARD-DELETED,
 *     no replacement)
 *   - `InsertRoutineOpts` (named export dropped — opts are inline on `insertRoutine`)
 */

export type { RoutineSchedulerPorts } from "./ports.js";
// -- routine scheduler (AU21 §9 Increment 4: relocated from
// `@hyperidle/dispatch`'s `service.ts` — scheduler + `routineRuns` lifecycle
// move core-side per architecture.md §6 Decision B′/B″ ruling #4; see
// `routine-scheduler.ts`'s own top-of-file note) --
// @lore BA9d: BuiltinRoutineId, PostBetRetroArgs, RunBuiltinResult, extractBuiltinKind,
// fireBuiltinRoutine, provisionTeamRoutines, registerBuiltinRoutineHandlers are deleted —
// the built-in routine mechanism is gone. All routines are now generic (plugin-provided
// or user-created).
export type {
	FireResult,
	RoutineScheduler,
	RoutineSchedulerConfig,
} from "./routine-scheduler.js";
export {
	fireGenericRoutine,
	startRoutineScheduler,
} from "./routine-scheduler.js";
// -- routine-service (AU13: routines + routineRuns CRUD + reads) --
// resolveRoutineRunRequest/RoutineRunResolverDeps/BakedRoutineRunRequest/
// RoutineRunSourceUnavailableError are private to the package (AU44 B3 fold).
export type {
	Routine,
	RoutinePatch,
	RoutineRun,
	RoutineRunPatch,
} from "./routine-service.js";
export {
	computeRoutineNextRunAt,
	getRoutine,
	getRoutineRun,
	insertRoutine,
	insertRoutineRun,
	listRoutineRuns,
	listRoutines,
	parseTransitionTo,
	updateRoutine,
	updateRoutineRun,
} from "./routine-service.js";
// -- schedule-label (AU19 Increment 5: relocated from packages/server per §6 disposition — humanizeSchedule is routine's own display concern) --
export { humanizeSchedule } from "./schedule-label.js";
