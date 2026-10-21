import { z } from "zod";
import { TASK_OUTCOME_VERDICTS, TASK_STATES, type TaskState } from "../types.js";
import type { ActionDeclaration, Problem } from "./action.js";

/**
 * `review` and `done` are legal from every non-terminal state — required for the parent auto-completion cascade; a container task never worked must reach both.
 * `proposed -> hold`: entrance to the dependency-wait chain; no direct `hold -> in_progress` edge — the existing watcher chain is reused.
 * `hold -> proposed`: exit when a dependency is killed (premise gone, return for re-planning); distinct from `hold -> accepted` (wait ended because work finished).
 * Do not remove these edges as "over-permissive" — used only via controlled lifecycle propagation paths.
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

/** One completion criterion. `by:"check"` closes itself; `by:"review"` needs a person. */
export const DoneWhenLineSchema = z.object({
	id: z.string(),
	what: z.string().min(1),
	by: z.enum(["check", "review"]),
	state: z.enum(["open", "met", "failed"]),
	/** How it is or was checked, or who reviews it. */
	how: z.string().nullable(),
});

export type DoneWhenLine = z.infer<typeof DoneWhenLineSchema>;

/** Valid states for a decision reason. */
export const DECISION_STATES = ["made", "waiting"] as const;
/** Valid states for an assumption reason. */
export const ASSUMPTION_STATES = ["held", "open", "broke"] as const;

/** A decision or assumption recorded alongside the work. */
export const ReasonSchema = z.discriminatedUnion("kind", [
	z.object({
		id: z.string(),
		kind: z.literal("decision"),
		what: z.string().min(1),
		state: z.enum(DECISION_STATES),
		why: z.string().nullable(),
	}),
	z.object({
		id: z.string(),
		kind: z.literal("assumption"),
		what: z.string().min(1),
		state: z.enum(ASSUMPTION_STATES),
		why: z.string().nullable(),
	}),
]);

export type Reason = z.infer<typeof ReasonSchema>;

export const TaskSchema = z.object({
	id: z.string(),
	parentTaskId: z.string().nullable(),
	teamId: z.string(),
	ownerAgentId: z.string().nullable(),
	title: z.string(),
	description: z.string().nullable(),
	/** Parsed done-when lines (stored as JSON text in the DB). */
	doneWhen: z.array(DoneWhenLineSchema),
	state: z.enum(TASK_STATES),
	dependencies: z.string().nullable(),
	threadId: z.string(),
	notes: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	outcomeVerdict: z.enum(TASK_OUTCOME_VERDICTS).nullable(),
	outcomeSummary: z.string().nullable(),
	outcomeRecordedAt: z.string().nullable(),
	outcomeRecordedBy: z.string().nullable(),
	tokensActualJson: z.string().nullable(),
	sourceDocumentId: z.string().nullable(),
	completedAt: z.string().nullable(),
	position: z.number().int(),
	/** Parsed reasons (decisions and assumptions, stored as JSON text in the DB). */
	reasons: z.array(ReasonSchema),
	/** Derived UI status — computed from state, thread messages and reasons; never stored. Defaults to null so DB rows parse without it. */
	need: z.enum(["stuck", "input", "review"]).nullable().default(null),
});

export type Task = z.infer<typeof TaskSchema>;

/** A task in the nested subtree returned by `open_task`, its own children alongside it. */
export interface TaskNode extends Task {
	readonly children: readonly TaskNode[];
	/** Counts of descendants (not the node itself) whose need is input or review. */
	readonly openBelow: { readonly input: number; readonly review: number };
}

const TaskNodeSchema: z.ZodType<TaskNode> = z.lazy(() =>
	TaskSchema.extend({
		children: z.array(TaskNodeSchema),
		openBelow: z.object({
			input: z.number().int().nonnegative(),
			review: z.number().int().nonnegative(),
		}),
	}),
);

export const SearchTasksInputSchema = z
	.object({
		ids: z.array(z.string()).optional(),
		excludeIds: z.array(z.string()).optional(),
		parentTaskId: z.string().nullable().optional(),
		ownerAgentId: z.string().optional(),
		state: z.enum(TASK_STATES).optional(),
		teamId: z.string().optional(),
		threadId: z.string().optional(),
		text: z.string().optional(),
		excludeKilled: z.boolean().optional(),
		limit: z.number().int().positive().optional(),
	})
	.strict();

export type SearchTasksInput = z.infer<typeof SearchTasksInputSchema>;
export type TaskListItem = Task;

export const searchTasks: ActionDeclaration<SearchTasksInput, TaskListItem[]> = {
	name: "search_tasks",
	sentence:
		"Search tasks. No parameter lists them; filter by parent, owner, state, team, thread or text.",
	input: SearchTasksInputSchema,
	output: z.array(TaskSchema),
};

const OpenTaskInputSchema = z.object({ id: z.string() }).strict();

// sessions deliberately NOT here — browser combines orchestration data itself via useTaskSessions
export const TaskViewSchema = z.object({
	task: TaskSchema,
	/** Root-first, for the breadcrumb. */
	ancestors: z.array(TaskSchema),
	/** The whole nested subtree, not only direct children. */
	children: z.array(TaskNodeSchema),
	/** Open questions and reviews anywhere below the task, for its "Parts" tally. */
	openBelow: z.object({
		input: z.number().int().nonnegative(),
		review: z.number().int().nonnegative(),
	}),
	tokensActualRollup: z.number().nullable(),
	threadId: z.string(),
	/** Document ids parented to this task. */
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

// `notes` is not writable here — `appendNote` keeps its own atomic-append semantics
export const EditTaskInputSchema = z
	.object({
		id: z.string().optional(),
		parentTaskId: z.string().nullable().optional(),
		/** Required when `parentTaskId` is omitted on create; inherited otherwise. */
		teamId: z.string().optional(),
		/** Setting this to an agent is a handoff. */
		ownerAgentId: z.string().nullable().optional(),
		title: z.string().min(1).optional(),
		description: z.string().nullable().optional(),
		/** Whole-list upsert — replaces the existing list. */
		doneWhen: z.array(DoneWhenLineSchema).optional(),
		state: z.enum(TASK_STATES).optional(),
		position: z.number().int().nonnegative().optional(),
		/** Whole-list upsert — replaces the existing list. */
		reasons: z.array(ReasonSchema).optional(),
		dependencies: z.array(z.string()).nullable().optional(),
		outcome: z
			.object({
				verdict: z.enum(TASK_OUTCOME_VERDICTS),
				summary: z.string().optional(),
			})
			.optional(),
		sourceDocumentId: z.string().optional(),
		/** Atomic note append — not a partial field on `notes`. */
		appendNote: z.string().optional(),
		/**
		 * The session-end token writeback. The
		 * caller (`work-session-end-reactions.ts`) has already merged the
		 * session's per-tier counts into the task's existing rollup and passes
		 * the whole resulting JSON string here — `edit_task` is the only write
		 * to `tasks`, so this is how that merge lands with a `changes` row
		 * instead of a bare `update()` outside the module.
		 */
		tokensActualJson: z.string().nullable().optional(),
		/** Optimistic-locking token, compared against `prev.updatedAt`. */
		version: z.string().optional(),
		/** Absent on create ⇒ edit_task creates one via adjustThread hosted on the task's own team. */
		threadId: z.string().optional(),
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

export const TASK_ACTIONS = {
	search_tasks: searchTasks,
	open_task: openTask,
	edit_task: editTask,
} as const;

// Server-only invariants (cycle, team capacity, owner exists, unmet deps at accept) are NOT here — DB-dependent, run inside edit_task.run.

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

	// done-when: ids unique, what non-empty (enforced by schema min(1) but checked defensively)
	const doneWhenIds = new Set<string>();
	for (const line of next.doneWhen) {
		if (doneWhenIds.has(line.id)) {
			problems.push({
				code: "done_when_duplicate_id",
				message: `Duplicate id "${line.id}" in doneWhen.`,
				path: "doneWhen",
			});
		}
		doneWhenIds.add(line.id);
	}

	// reasons: ids unique; state must match kind
	const reasonIds = new Set<string>();
	for (const reason of next.reasons) {
		if (reasonIds.has(reason.id)) {
			problems.push({
				code: "reasons_duplicate_id",
				message: `Duplicate id "${reason.id}" in reasons.`,
				path: "reasons",
			});
		}
		reasonIds.add(reason.id);

		if (reason.kind === "decision") {
			const validDecisionStates: readonly string[] = DECISION_STATES;
			if (!validDecisionStates.includes(reason.state)) {
				problems.push({
					code: "reason_state_mismatch",
					message: `Decision reason "${reason.id}" has invalid state "${reason.state}".`,
					path: "reasons",
				});
			}
		} else {
			const validAssumptionStates: readonly string[] = ASSUMPTION_STATES;
			if (!validAssumptionStates.includes(reason.state)) {
				problems.push({
					code: "reason_state_mismatch",
					message: `Assumption reason "${reason.id}" has invalid state "${reason.state}".`,
					path: "reasons",
				});
			}
		}
	}

	return problems;
}
