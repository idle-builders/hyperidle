import type { TaskState } from "./types.js";

export class MissingCredentialError extends Error {
	constructor(public readonly credential: string) {
		super(`Missing credential: '${credential}'`);
		this.name = "MissingCredentialError";
	}
}

/**
 * AH3: Wall-clock timeout for one assistant turn. After this many milliseconds
 * with no completion/error event from the harness, the turn aborts and persists
 * a `provider_error` notice. Exported from @hyperidle/domain-model so both server
 * (timeout enforcement) and client (crash-recovery indicator, §1.7b) use the
 * same boundary value.
 *
 * @lore AH3: 120_000ms = 2 minutes. Long enough for a slow but real response;
 * short enough that a hung provider surfaces within a visible session rather
 * than stranding the UI in "thinking…" forever.
 */
export const ASSISTANT_TURN_TIMEOUT_MS = 120_000;

/**
 * POLISH-060 B2: Thrown by the LLM HTTP client on a non-2xx response.
 * `dispatch`'s `mapErrorToNotice` maps 401/403 → auth notice, 400 →
 * model/config notice, other codes → generic (transient) provider_error.
 *
 * @lore AU19 Increment 3h: reclassified from `packages/server/src/harness/
 * llm-client.ts` to `@hyperidle/domain-model` — `dispatch`'s error-mapping needs
 * `instanceof HttpError` across the agent-orchestration → agent-execution
 * seam, and Mechanism C forbids a Service importing another Service's class
 * (even for `instanceof`). Same treatment as `MissingCredentialError` — a cross-cutting
 * error taxonomy lives in `shared`, not in the Service that happens to throw
 * it first.
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
 * @lore AU44: moved to @hyperidle/domain-model so both the work service and
 * the policy service share one class reference. Two classes with the same name
 * are still two different classes — `instanceof` returns false across the
 * boundary unless both sides use the same declaration. The error-handler's
 * name-matching fallback (`err.name === "InvalidTransitionError"`) was luck of
 * style; this makes it construction.
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
 * BB1: thrown when a write would make the task tree cyclic — a task set as its
 * own parent, or reparented under one of its own descendants.
 *
 * A cycle is not merely invalid data: a recursive read that meets one does not
 * error, it spins. So this is rejected at write time, and the recursive CTEs
 * additionally carry a depth cap as a backstop.
 *
 * @lore BA6: reused for the dependency graph rather than inventing a second
 * cycle error and code — a cycle is a cycle regardless of which edge closed
 * it. `relation` only changes the message, which must name dependencies
 * rather than the parent tree when that is the edge that closed the loop
 * (the founder ruling this package was built against).
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
 * BA6: thrown when a `dependencies` write names a task id that does not
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
 * BA6 (fix round): thrown when a `dependencies` write names a task that is
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
 * BA6 (fix round): thrown by `transitionTask` when a genuine pick-up
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
 * BB1: thrown when a team is already at its WIP limit — `teams.capacity`
 * tasks are `in_progress`. Was raised on bet activation; now raised when a task
 * starts, at any depth.
 *
 * @lore AU44: co-located with InvalidTransitionError in @hyperidle/domain-model
 * so the error-handler's instanceof check covers errors thrown by either service.
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
 * Extends InvalidTransitionError so `instanceof InvalidTransitionError` holds
 * for both bet and task transition errors. The error-handler and any caller
 * that catches InvalidTransitionError will naturally catch this too.
 *
 * @lore AU44: moved to @hyperidle/domain-model alongside InvalidTransitionError
 * so the inheritance chain is unbroken across the work / policy service boundary.
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
 * BA6: thrown by the `CoreApiPort` seam client on a non-2xx response, carrying
 * the response's machine-readable `code` (when the body is `{ error, code }`
 * JSON) alongside the status and a formatted message.
 *
 * @lore BA6: the seam previously collapsed every non-2xx into a generic
 * `Error`, so a caller like `edit_task` had no way to distinguish a cycle
 * rejection from any other failure without string-matching the message. A
 * tool handler that needs to turn a structured route rejection (e.g. 409
 * `{ code: "TASK_CYCLE" }`) into a structured `err(code, message)` catches
 * this by `instanceof` and reads `.code`, rather than parsing the thrown
 * message text.
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
