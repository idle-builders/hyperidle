/**
 * Work-service-owned error classes.
 *
 * @lore AU44-b8: moved from framework/domain-model/src/errors.ts and
 * framework/domain-model/src/task-transition.ts.
 * All three classes are thrown and caught within the core-api track (work, policy, core-api).
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
