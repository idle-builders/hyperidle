import { z } from "zod";
import { TASK_OUTCOME_VERDICTS, TASK_STATES, type TaskState } from "../types.js";
import type { ActionDeclaration, Problem } from "./action.js";

/**
 * the task action list: search, open, edit. the architecture doc
 * §3. This is what replaces `api-contract`'s hand-mirrored task types, the
 * three UI hooks and `core-ui/src/types/task.ts`.
 */

// ---------------------------------------------------------------------------
// Task lifecycle grammar — folded in from the deleted `task-transition.ts`.
// ---------------------------------------------------------------------------

/**
 * Canonical task lifecycle grammar shared by policy and the task module.
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

// ---------------------------------------------------------------------------
// The row shape — replaces `core-ui/src/types/task.ts`.
// ---------------------------------------------------------------------------

export const TaskSchema = z.object({
	id: z.string(),
	parentTaskId: z.string().nullable(),
	teamId: z.string(),
	ownerAgentId: z.string().nullable(),
	title: z.string(),
	description: z.string().nullable(),
	doneCondition: z.string().nullable(),
	state: z.enum(TASK_STATES),
	dependencies: z.string().nullable(),
	threadId: z.string().nullable(),
	notes: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	outcomeVerdict: z.enum(TASK_OUTCOME_VERDICTS).nullable(),
	outcomeSummary: z.string().nullable(),
	outcomeRecordedAt: z.string().nullable(),
	outcomeRecordedBy: z.string().nullable(),
	tokensActualJson: z.string().nullable(),
	sourceKnowledgeItemId: z.string().nullable(),
	completedAt: z.string().nullable(),
	position: z.number().int(),
	needsReview: z.boolean(),
});

export type Task = z.infer<typeof TaskSchema>;

/** A task in the nested subtree returned by `open_task`, its own children alongside it. */
export interface TaskNode extends Task {
	readonly children: readonly TaskNode[];
}

const TaskNodeSchema: z.ZodType<TaskNode> = z.lazy(() =>
	TaskSchema.extend({ children: z.array(TaskNodeSchema) }),
);

// ---------------------------------------------------------------------------
// search_tasks
// ---------------------------------------------------------------------------

export const SearchTasksInputSchema = z
	.object({
		ids: z.array(z.string()).optional(),
		excludeIds: z.array(z.string()).optional(),
		parentTaskId: z.string().nullable().optional(),
		ownerAgentId: z.string().optional(),
		state: z.enum(TASK_STATES).optional(),
		teamId: z.string().optional(),
		text: z.string().optional(),
		excludeKilled: z.boolean().optional(),
		limit: z.number().int().positive().optional(),
	})
	.strict();

export type SearchTasksInput = z.infer<typeof SearchTasksInputSchema>;
export type TaskListItem = Task;

export const searchTasks: ActionDeclaration<SearchTasksInput, TaskListItem[]> = {
	name: "search_tasks",
	sentence: "Search tasks. No parameter lists them; filter by parent, owner, state, team or text.",
	input: SearchTasksInputSchema,
	output: z.array(TaskSchema),
};

// ---------------------------------------------------------------------------
// open_task
// ---------------------------------------------------------------------------

const OpenTaskInputSchema = z.object({ id: z.string() }).strict();

/**
 * What `open_task` returns, and therefore what `edit_task` returns too.
 *
 * `sessions` is deliberately NOT here — founder ruling 2026-09-13, upholding
 * AU26 J4: the browser keeps combining orchestration data itself
 * (`useTaskSessions`, untouched by this item). See architecture.md §5.
 */
export const TaskViewSchema = z.object({
	task: TaskSchema,
	/** Root-first, for the breadcrumb. */
	ancestors: z.array(TaskSchema),
	/** The whole nested subtree, not only direct children. */
	children: z.array(TaskNodeSchema),
	tokensActualRollup: z.number().nullable(),
	threadId: z.string().nullable(),
	/** Knowledge-item ids parented to this task. */
	attachments: z.array(z.string()),
});

export type TaskView = z.infer<typeof TaskViewSchema>;

export const openTask: ActionDeclaration<{ id: string }, TaskView> = {
	name: "open_task",
	sentence:
		"Open a task: content, state, assignment, subtasks, attachments and thread — everything about it.",
	input: OpenTaskInputSchema,
	output: TaskViewSchema,
};

// ---------------------------------------------------------------------------
// edit_task
// ---------------------------------------------------------------------------

/**
 * The union of what the deleted eight task routes accepted. Without `id` this
 * creates a task; with `id` it edits one. `notes` is deliberately not a
 * writable partial field — `appendNote` keeps its own atomic-append semantics
 * (architecture.md §3).
 */
export const EditTaskInputSchema = z
	.object({
		id: z.string().optional(),
		parentTaskId: z.string().nullable().optional(),
		/** Required when `parentTaskId` is omitted on create; inherited otherwise. */
		teamId: z.string().optional(),
		/** Setting this to an agent is a handoff — see architecture.md §8 B4. */
		ownerAgentId: z.string().nullable().optional(),
		title: z.string().min(1).optional(),
		description: z.string().nullable().optional(),
		doneCondition: z.string().nullable().optional(),
		state: z.enum(TASK_STATES).optional(),
		position: z.number().int().nonnegative().optional(),
		needsReview: z.boolean().optional(),
		dependencies: z.array(z.string()).nullable().optional(),
		outcome: z
			.object({
				verdict: z.enum(TASK_OUTCOME_VERDICTS),
				summary: z.string().optional(),
			})
			.optional(),
		sourceKnowledgeItemId: z.string().optional(),
		/** Atomic note append — not a partial field on `notes`. */
		appendNote: z.string().optional(),
		/**
		 * The session-end token writeback (architecture doc §6 row, B3). The
		 * caller (`work-session-end-reactions.ts`) has already merged the
		 * session's per-tier counts into the task's existing rollup and passes
		 * the whole resulting JSON string here — `edit_task` is the only write
		 * to `tasks`, so this is how that merge lands with a `changes` row
		 * instead of a bare `update()` outside the module.
		 */
		tokensActualJson: z.string().nullable().optional(),
		/** Optimistic-locking token, compared against `prev.updatedAt`. */
		version: z.string().optional(),
	})
	.strict();

export type EditTaskInput = z.infer<typeof EditTaskInputSchema>;

export const editTask: ActionDeclaration<EditTaskInput, TaskView> = {
	name: "edit_task",
	sentence:
		"Edit a task, new or existing: title, content, state, attachments, assignment (handoff), outcome, notes.",
	input: EditTaskInputSchema,
	output: TaskViewSchema,
};

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export const TASK_ACTIONS = {
	search_tasks: searchTasks,
	open_task: openTask,
	edit_task: editTask,
} as const;

// ---------------------------------------------------------------------------
// taskInvariants — pure. Runs in the browser to enable/grey a control, and
// again on the server as the first pass over the resulting task. The
// server-only invariants (cycle via ancestors, team capacity at accept, owner
// exists, unmet dependencies at accept) are NOT here — they need the
// database and run inside `edit_task.run` (architecture.md §3, §5).
// ---------------------------------------------------------------------------

export function taskInvariants(next: Task, prev: Task | null): Problem[] {
	const problems: Problem[] = [];

	if (next.title.trim().length === 0) {
		problems.push({ code: "title_required", message: "A task needs a title.", path: "title" });
	}
	if (prev === null && !next.teamId) {
		problems.push({
			code: "team_required",
			message: "A new task needs a team, or a parent to inherit one from.",
			path: "teamId",
		});
	}
	if (
		prev !== null &&
		next.state !== prev.state &&
		!canTransitionTaskState(prev.state, next.state)
	) {
		problems.push({
			code: "invalid_transition",
			message: `A task cannot move from "${prev.state}" to "${next.state}".`,
			path: "state",
		});
	}

	return problems;
}
