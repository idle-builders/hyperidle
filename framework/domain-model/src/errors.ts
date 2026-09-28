import type { TaskState } from "./types.js";

export class MissingCredentialError extends Error {
	constructor(public readonly credential: string) {
		super(`Missing credential: '${credential}'`);
		this.name = "MissingCredentialError";
	}
}

/**
 * Wall-clock timeout for one assistant turn. After this many milliseconds
 * with no completion/error event from the harness, the turn aborts and persists
 * a `provider_error` notice. Exported from @hyperidle/domain-model so both server
 * (timeout enforcement) and client (crash-recovery indicator) use the same boundary value.
 *
 * @lore: ASSISTANT_TURN_TIMEOUT_MS — 2 min: enough for a slow provider; short enough that a hung provider surfaces in the session rather than stranding the UI
 */
export const ASSISTANT_TURN_TIMEOUT_MS = 120_000;

/**
 * Thrown by the LLM HTTP client on a non-2xx response.
 * `dispatch`'s `mapErrorToNotice` maps 401/403 → auth notice, 400 →
 * model/config notice, other codes → generic (transient) provider_error.
 *
 * @lore: HttpError — instanceof crosses agent-orchestration → agent-execution; Service→Service class import forbidden; cross-cutting errors live in domain-model
 */
export class HttpError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "HttpError";
	}
}

/**
 * Thrown when a state-machine transition is not permitted by the grammar.
 *
 * @lore: InvalidTransitionError — one declaration shared by work-service and policy-service; two same-named classes still fail instanceof across the seam
 */
export class InvalidTransitionError extends Error {
	constructor(
		public readonly from: string,
		public readonly to: string,
	) {
		super(`Invalid transition from '${from}' to '${to}'`);
		this.name = "InvalidTransitionError";
	}
}

/**
 * Thrown when a write would make the task tree cyclic — a task set as its
 * own parent, or reparented under one of its own descendants.
 *
 * A cycle is not merely invalid data: a recursive read that meets one does not
 * error, it spins. So this is rejected at write time, and the recursive CTEs
 * additionally carry a depth cap as a backstop.
 *
 * @lore: TaskCycleError — reused for the dependency graph; a cycle is a cycle regardless of which edge closed it; `relation` only changes the message
 */
export class TaskCycleError extends Error {
	constructor(
		public readonly taskId: string,
		public readonly parentTaskId: string,
		relation: "parent" | "dependency" = "parent",
	) {
		super(
			relation === "dependency"
				? `Task ${taskId} cannot depend on ${parentTaskId}: that would form a cycle`
				: `Task ${taskId} cannot be a child of ${parentTaskId}: that would form a cycle`,
		);
		this.name = "TaskCycleError";
	}
}

/**
 * Thrown when a `dependencies` write names a task id that does not
 * exist. Distinct from `TaskCycleError` (409) — a dangling id is refused
 * outright with 404, matching the existing precedent for a missing
 * `parentTaskId` on `POST /tasks`.
 */
export class TaskDependencyNotFoundError extends Error {
	constructor(public readonly dependencyId: string) {
		super(`Dependency task not found: ${dependencyId}`);
		this.name = "TaskDependencyNotFoundError";
	}
}

/**
 * Thrown when a `dependencies` write names a task that is
 * `killed` — it can never reach `done`, so depending on it would park the
 * dependent forever with no watcher left to free it (the kill-time cleanup
 * only fires for dependents that existed AT kill time). Distinct from
 * `TaskDependencyNotFoundError`: the task exists, it just can never finish.
 * Depending on an already-`done` task stays legal.
 */
export class TaskDependencyKilledError extends Error {
	constructor(public readonly dependencyId: string) {
		super(`Dependency task ${dependencyId} is killed and can never finish`);
		this.name = "TaskDependencyKilledError";
	}
}

/**
 * Thrown by `transitionTask` when a genuine pick-up
 * transition (`-> accepted`, or `accepted -> in_progress`) is refused
 * because the task still carries an unfinished dependency. Distinct from
 * `TaskInvalidTransitionError` — the edge itself IS legal grammar in
 * `TASK_STATE_TRANSITIONS`; the wait is what refuses it, and the message
 * must say so rather than reading as a generic illegal edge. Never thrown
 * for a resume/rework move (`blocked -> in_progress`, `review ->
 * in_progress`) — a task already picked up is not re-gated by a later
 * dependency.
 */
export class TaskDependencyBlockedError extends Error {
	constructor(
		public readonly taskId: string,
		public readonly fromState: TaskState,
		public readonly toState: TaskState,
	) {
		super(
			`Task ${taskId} cannot move from '${fromState}' to '${toState}': it has an unfinished dependency`,
		);
		this.name = "TaskDependencyBlockedError";
	}
}

/**
 * Thrown when a team is already at its WIP limit — `teams.capacity` tasks are `in_progress`.
 *
 * @lore: CapacityExceededError — co-located with InvalidTransitionError in domain-model; the error-handler's instanceof covers errors thrown by either service
 */
export class CapacityExceededError extends Error {
	constructor(
		public readonly teamId: string,
		public readonly capacity: number,
	) {
		super(`Team '${teamId}' is at capacity (${capacity})`);
		this.name = "CapacityExceededError";
	}
}

/**
 * Extends InvalidTransitionError so `instanceof InvalidTransitionError` holds for both bet and
 * task transition errors. The error-handler and any caller that catches InvalidTransitionError
 * will naturally catch this too.
 */
export class TaskInvalidTransitionError extends InvalidTransitionError {
	constructor(
		public readonly taskId: string,
		public readonly fromState: TaskState,
		public readonly toState: TaskState,
	) {
		super(fromState, toState);
		this.message = `Invalid transition for task ${taskId}: ${fromState} -> ${toState}`;
		this.name = "InvalidTransitionError";
	}
}

/**
 * Thrown by the `CoreApiPort` seam client on a non-2xx response, carrying
 * the response's machine-readable `code` (when the body is `{ error, code }`
 * JSON) alongside the status and a formatted message.
 *
 * @lore: SeamRequestError — carries `.code` so callers distinguish structured route rejections (e.g. 409 TASK_CYCLE) without string-matching the message text
 */
export class SeamRequestError extends Error {
	constructor(
		public readonly status: number,
		/** The response body's `code` field, when present and a string. */
		public readonly code: string | undefined,
		message: string,
	) {
		super(message);
		this.name = "SeamRequestError";
	}
}
