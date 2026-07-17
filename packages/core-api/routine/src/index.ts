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
 * `packages/server/src/routines.ts` (the curated `@hyperidle/server/routines`
 * subpath export `packages/eval` consumes) is DELIBERATELY left untouched —
 * see this package's own top-level README-equivalent note in the AU19
 * ground rules / build report: that file re-exports `checkAndFireRoutine`/
 * `provisionTeamRoutines`/`runBuiltinRoutine`, all three owned by the
 * still-monolithic `dispatch` Service (`routine-scheduler.ts`/
 * `builtin-routine-handlers.ts`, architecture §4 line 95), not by `routine`
 * — moving it here would force this Service to import from `packages/server`
 * (violating the "Service deps = db+shared only" composition rule) before
 * `dispatch` exists as a package. It stays exactly where it is until
 * Increment 2 migrates `dispatch`.
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

// -- routine-service (AU13: routines + routineRuns CRUD + reads) --
export type {
	Routine,
	RoutinePatch,
	RoutineRun,
	RoutineRunPatch,
} from "./routine-service.js";
export {
	getRoutine,
	getRoutineRun,
	incrementRoutineCost,
	insertRoutine,
	insertRoutineRun,
	listRoutineRuns,
	listRoutines,
	sumRunCost,
	updateRoutine,
	updateRoutineRun,
} from "./routine-service.js";

// -- schedule-label (AU19 Increment 5: relocated from packages/server per §6 disposition — humanizeSchedule is routine's own display concern) --
export { humanizeSchedule } from "./schedule-label.js";
