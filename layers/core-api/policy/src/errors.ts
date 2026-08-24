/**
 * Policy-local error classes.
 *
 * @lore AU44-b8: InvalidTransitionError and TaskInvalidTransitionError are also
 * defined in @hyperidle/work (the work sub-service). policy cannot import from
 * work (service→service crossing forbidden by governance). These classes are
 * deliberately duplicated with the same `.name` so the composition root's
 * error-handler catches them by name ("InvalidTransitionError") when it cannot
 * catch them by instanceof (different class reference).
 */
import type { TaskState } from "@hyperidle/domain-model";

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
 * Extends InvalidTransitionError so the error-handler's instanceof check
 * catches both the bet and task transition errors uniformly.
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
