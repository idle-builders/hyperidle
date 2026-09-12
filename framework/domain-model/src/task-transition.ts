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
 *
 * @lore BA6: `proposed -> hold` is the entrance to the dependency-wait chain.
 * A task is born `proposed`; without this edge nothing created or edited with
 * an unfinished dependency could ever reach `hold`, and the existing
 * `hold -> accepted` watcher would have no chain to carry onward. There is
 * deliberately no direct `hold -> in_progress` or `proposed -> in_progress`
 * edge — the existing chain (watcher `hold -> accepted`, dispatch,
 * `session_started -> in_progress`) is reused as-is.
 *
 * @lore BA6: `hold -> proposed` is the OTHER exit from the wait — a killed
 * dependency means the premise a held task was planned under is gone, so it
 * returns to `proposed` for re-planning rather than being freed to start
 * (the interview ruling this package was built against, 2026-09-09). Distinct
 * from `hold -> accepted`: that edge means the wait ended because the work
 * finished; this one means the wait ended because it never will.
 */
export const TASK_STATE_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
	proposed: ["accepted", "hold", "review", "done", "killed"],
	accepted: ["in_progress", "hold", "review", "done", "killed"],
	hold: ["accepted", "proposed", "review", "done", "killed"],
	in_progress: ["review", "blocked", "done", "killed"],
	blocked: ["in_progress", "review", "done", "killed"],
	review: ["done", "in_progress", "killed"],
	done: ["killed"],
	killed: [],
} as const;

export function canTransitionTaskState(from: TaskState, to: TaskState): boolean {
	return TASK_STATE_TRANSITIONS[from].includes(to);
}
