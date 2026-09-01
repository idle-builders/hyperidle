import type { TaskState } from "./types.js";

/**
 * Canonical task lifecycle grammar shared by policy and work.
 *
 * @lore BB1: Both `review` AND `done` are legal targets from EVERY non-terminal
 * state (`proposed`, `accepted`, `hold`, `in_progress`, `blocked`).
 *
 * Why `review` from every state: any live task can be put up for review. Without
 * these edges, a container task that was never itself worked — the normal case —
 * had no legal path from `proposed` or `accepted` to `review`, so the parent
 * auto-completion cascade always threw `InvalidTransitionError` and silently died.
 *
 * Why `done` from every state: the parent auto-completion cascade (BB1, founder
 * call 2026-08-31) uses `task.needsReview` to decide whether to send a parent to
 * `review` (checkpoint) or straight to `done` (continue the cascade). Without
 * `done` edges from states like `accepted`, a container task that was never
 * worked had no legal path to `done`, so the cascade died with an
 * `InvalidTransitionError` for the majority case where `needsReview` is false.
 *
 * Do not remove these edges as "over-permissive" — they are required for the
 * parent auto-completion rule and are used only via controlled code paths (the
 * lifecycle propagation handler), never exposed as raw user actions.
 */
export const TASK_STATE_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
	proposed: ["accepted", "review", "done", "killed"],
	accepted: ["in_progress", "hold", "review", "done", "killed"],
	hold: ["accepted", "review", "done", "killed"],
	in_progress: ["review", "blocked", "done", "killed"],
	blocked: ["in_progress", "review", "done", "killed"],
	review: ["done", "in_progress", "killed"],
	done: ["killed"],
	killed: [],
} as const;

export function canTransitionTaskState(from: TaskState, to: TaskState): boolean {
	return TASK_STATE_TRANSITIONS[from].includes(to);
}
