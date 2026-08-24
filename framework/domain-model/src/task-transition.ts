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
