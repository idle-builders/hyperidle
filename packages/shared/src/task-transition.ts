import type { TaskState } from "./types.js";

/** Canonical task lifecycle grammar shared by policy and work. */
export const TASK_STATE_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
	proposed: ["accepted", "killed"],
	accepted: ["in_progress", "hold", "killed"],
	hold: ["accepted", "killed"],
	in_progress: ["review", "blocked", "killed"],
	blocked: ["in_progress", "killed"],
	review: ["done", "in_progress", "killed"],
	done: ["killed"],
	killed: [],
} as const;

export function canTransitionTaskState(from: TaskState, to: TaskState): boolean {
	return TASK_STATE_TRANSITIONS[from].includes(to);
}

export class TaskInvalidTransitionError extends Error {
	constructor(
		public readonly taskId: string,
		public readonly fromState: TaskState,
		public readonly toState: TaskState,
	) {
		super(`Invalid transition for task ${taskId}: ${fromState} -> ${toState}`);
		this.name = "InvalidTransitionError";
	}
}
