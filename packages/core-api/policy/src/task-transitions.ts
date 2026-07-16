/**
 * Local mirror of `@hyperidle/work`'s `task-state-machine.ts`
 * `VALID_TRANSITIONS` + `InvalidTransitionError` (Mechanism C — a Service
 * never imports another Service's values, even a transition table).
 *
 * @lore AU19 Increment 2a: `handoff-protocol.ts` imported these two VALUES
 * (not just types) directly from `@hyperidle/work` pre-migration — a real
 * cross-Service edge that must convert. `lifecycle-propagation.ts` already
 * carried its OWN pre-existing inlined copy (`VALID_TASK_TRANSITIONS`, @lore
 * O3/AF12, predating this WP — a `fabric`-can't-import-`kernel` constraint
 * from before AU19 existed) — consolidated to this single in-package copy so
 * `policy` doesn't carry three divergent transition tables. Must be kept in
 * sync with `@hyperidle/work`'s `task-state-machine.ts` if that table
 * changes (mirrors AF12's existing "any change... must be mirrored here"
 * obligation, now scoped to this one file instead of two).
 */
import type { TaskState } from "@hyperidle/shared";

export const VALID_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
	proposed: ["accepted", "killed"],
	accepted: ["in_progress", "hold", "killed"],
	hold: ["accepted", "killed"],
	in_progress: ["review", "blocked", "killed"],
	blocked: ["in_progress", "killed"],
	review: ["done", "in_progress", "killed"],
	done: ["killed"],
	killed: [],
} as const;

export class InvalidTransitionError extends Error {
	public readonly fromState: TaskState;
	public readonly toState: TaskState;
	public readonly taskId: string;

	constructor(taskId: string, fromState: TaskState, toState: TaskState) {
		super(`Invalid transition for task ${taskId}: ${fromState} -> ${toState}`);
		this.name = "InvalidTransitionError";
		this.taskId = taskId;
		this.fromState = fromState;
		this.toState = toState;
	}
}
