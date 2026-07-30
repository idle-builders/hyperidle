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
 * `packages/core-api/src/routines.ts` remains the curated cross-package seam
 * consumed by `packages/eval`. It exposes the bound `DispatchOps` object;
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
 *   - `avgRoutineRunCost` + `sumRoutineRunCostSince`
 *     + `sumRoutineRunCostForRoutinesSince` → `sumRunCost({routineIds,since?,kind})`
 *   - `InsertRoutineOpts` (named export dropped — opts are inline on `insertRoutine`)
 */

// -- agent-delegation (AU21 §6 Decision F1 fold — routine_delegate's own
// skill-based delegate scan, relocated from the retired `agent-selection`
// Service) --
export type { AgentDelegationDeps } from "./agent-delegation.js";
export { selectRoutineDelegate } from "./agent-delegation.js";
export type { RoutineSchedulerPorts } from "./ports.js";
// -- routine scheduler (AU21 §9 Increment 4: relocated from
// `@hyperidle/dispatch`'s `service.ts` — scheduler + `routineRuns` lifecycle
// move core-side per architecture.md §6 Decision B′/B″ ruling #4; see
// `routine-scheduler.ts`'s own top-of-file note) --
export type {
	BuiltinRoutineId,
	FireResult,
	PostBetRetroArgs,
	RoutineScheduler,
	RoutineSchedulerConfig,
	RunBuiltinResult,
} from "./routine-scheduler.js";
export {
	extractBuiltinKind,
	fireBuiltinRoutine,
	fireGenericRoutine,
	isBuiltinRoutineId,
	registerBuiltinRoutineHandlers,
	startRoutineScheduler,
} from "./routine-scheduler.js";
// -- routine-service (AU13: routines + routineRuns CRUD + reads) --
export type {
	BakedRoutineRunRequest,
	Routine,
	RoutinePatch,
	RoutineRun,
	RoutineRunPatch,
	RoutineRunResolverDeps,
} from "./routine-service.js";
export {
	getRoutine,
	getRoutineRun,
	incrementRoutineCost,
	insertRoutine,
	insertRoutineRun,
	listRoutineRuns,
	listRoutines,
	RoutineRunSourceUnavailableError,
	resolveRoutineRunRequest,
	sumRunCost,
	updateRoutine,
	updateRoutineRun,
} from "./routine-service.js";
// -- schedule-label (AU19 Increment 5: relocated from packages/server per §6 disposition — humanizeSchedule is routine's own display concern) --
export { humanizeSchedule } from "./schedule-label.js";
