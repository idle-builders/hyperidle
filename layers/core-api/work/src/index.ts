/**
 * Barrel for @hyperidle/work (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `bets`/`tasks`/
 * `items` pgTable objects — that would let a consumer obtain a table
 * transitively and defeat Table ACL (Mechanism A). Consumers get typed
 * functions; the tables stay private to this Service.
 *
 * @lore AU19 Increment 1b: this is the real cut-over — `work-service.ts` +
 * `bet-decomposition(-subscriber)`/`bet-kill-cascade`/`bet-state-machine`/
 * `task-state-machine`/`task-audit`/`item-router` moved here from
 * `packages/server/src/` unchanged (behavior-preserving move). Four outbound
 * edges (`session-requests`, `agent-selection`, `cost`, `users` — none of
 * which have migrated yet) became injected DI ports (Mechanism C, `ports.ts`)
 * instead of relative imports out of the Service; three of the four
 * (`session-requests`/`agent-selection`/`cost`) are §10.3 against-grain edges
 * wired as an interim DI port this increment — Increment 3 rewires them to an
 * EventBus subscription. The concrete implementations still live in
 * `packages/server` (`agent-work-intents.ts`, `select-agent.ts` +
 * `agent-defaults/resolvers.ts`, `cost-cap.ts`, `user-store.ts`) and are wired
 * at each real call site (`server-factory.ts`, `routes/tasks.ts`,
 * `routes/bets.ts`, `session-provisioning.ts`, `dependency-watcher.ts`).
 *
 * @lore AU19 Increment 1c: a fifth outbound edge, `org` (`TeamCapacityReader`),
 * closes W2's `teamMembers` ownership gap — `org` is a REAL migrated package
 * this increment (not an interim stub), so the concrete implementation is
 * `@hyperidle/org`'s `getTeamMembersByTeamId`/`setTeamMembersActiveBets`, wired
 * at the same call sites (`server-factory.ts`, `routes/bets.ts`) plus every
 * test that constructs a `transitionBet`/`BetDecompositionDeps` call.
 */

// -- artifact-store (AU19 Increment 4 — `artifacts` TABLE_OWNER closure;
// AU20 Ag5b — read functions collapsed into get/list;
// AU20 Ag5c — createArtifact/setArtifactPreviewIfAbsent folded into generic
//             create()/transition() primitives below; only row types remain.) --
// -- dependency-watcher (AU20 Ag2: relocated from @hyperidle/filesystems) --
export { checkAndUnblockDependents } from "./dependency-watcher.js";
export {
	CapacityExceededError,
	InvalidTransitionError,
	TaskCycleError,
	TaskInvalidTransitionError,
} from "./errors.js";
// -- task kill cascade (AF12; BB1 made it recursive over the subtree) --
export { cascadeTaskKill, type TaskKillCascadeDeps } from "./task-kill-cascade.js";
// -- unified emit-time resolver (AU21 §6 Decision B; AU44 B3 merge) --
// resolveSessionStartRequest (session_start) merged into resolveTaskRunRequest
// as the `{ kind: "session_start" }` discriminated path. SessionStartResolverDeps
// folded into TaskRunResolverDeps; BakedSessionStartRequest folded into
// BakedTaskRunRequest (strict subset, same fields minus contextBundle).
export type {
	BakedTaskRunRequest,
	ResolveInput,
	TaskRunResolverDeps,
} from "./task-run-resolver.js";
export { bakeTaskContextBundle, resolveTaskRunRequest } from "./task-run-resolver.js";
// -- task state machine --
export type { TaskStateMachineDeps } from "./task-state-machine.js";
export { assertNoCycle, transitionTask, VALID_TRANSITIONS } from "./task-state-machine.js";
// -- work-service (bets/tasks/items repository — the sole table path) --
// AU20 Ag5b: old read exports collapsed into get()/list() general primitives.
// AU20 Ag5c: old write exports (createBet/createTask/createItem/appendTaskNote/
//   updateBetById/updateTaskById/updateItemById/
//   transitionBetStatus/transitionTaskState/claimBetDecomposition/
//   resolveOrphanedBetDecompositions/updateBetDecompositionStatusIfRunning)
//   collapsed into create()/update()/transition() general primitives.
//   Old named functions remain in work-service.ts for intra-package callers
//   (bet-state-machine.ts, bet-decomposition.ts, task-state-machine.ts).
export type {
	AppendNoteOp,
	Item,
	ItemUpdatePatch,
	Task,
	TaskPatch,
	TaskUpdatePatch,
	TransitionGuard,
	TransitionSpec,
	WorkEntity,
	WorkFilter,
} from "./work-service.js";
export {
	countTeamTasksInProgress,
	create,
	get,
	list,
	listAncestorIds,
	listSubtreeIds,
	MAX_TASK_DEPTH,
	maxSiblingPosition,
	taskDispatchAttemptStore,
	transition,
	update,
} from "./work-service.js";
