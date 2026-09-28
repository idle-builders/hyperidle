/**
 * Barrel for @hyperidle/task (core-api Layer, SQL-owning Service).
 * Typed functions only — must NOT re-export the raw `tasks` pgTable object (Table ACL, Mechanism A).
 * `edit_task` is the only write; nothing outside it appends a task `changes` row.
 */
export type { Action, ActionContext } from "./action-types.js";
export { checkAndUnblockDependents, handleDependencyKilled } from "./dependency-watcher.js";
export {
	CapacityExceededError,
	InvalidTransitionError,
	TaskCycleError,
	TaskDependencyBlockedError,
	TaskDependencyKilledError,
	TaskDependencyNotFoundError,
	TaskInvalidTransitionError,
} from "./errors.js";
export { createTaskActions, type TaskActionsDeps } from "./task-actions.js";
// -- unified emit-time resolver --
export type {
	BakedTaskRunRequest,
	ResolveInput,
	TaskRunResolverDeps,
} from "./task-run-resolver.js";
export { bakeTaskContextBundle, resolveTaskRunRequest } from "./task-run-resolver.js";
// -- task-service (tasks repository — the sole table path) --
export type {
	AppendNoteOp,
	Task,
	TaskPatch,
	TaskUpdatePatch,
	TransitionGuard,
	TransitionSpec,
	WorkEntity,
	WorkFilter,
} from "./task-service.js";
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
} from "./task-service.js";
