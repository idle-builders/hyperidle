/**
 * Task — wire type matching GET /api/tasks/:id and the task row in tree responses.
 *
 * @lore BB1: bets are gone; tasks are now the one work primitive. A root task
 * (parentTaskId === null) is what a bet used to be.
 */

export type TaskState =
	| "proposed"
	| "accepted"
	| "hold"
	| "in_progress"
	| "blocked"
	| "review"
	| "done"
	| "killed";

export type TaskOutcomeVerdict = "met" | "met_with_rework" | "partially_met" | "not_met";

export interface Task {
	id: string;
	parentTaskId: string | null;
	teamId: string;
	ownerAgentId: string | null;
	title: string;
	description: string | null;
	doneCondition: string | null;
	state: TaskState;
	/** Display order within the sibling group. Assigned on create (append), settable via PATCH. */
	position: number;
	/** When true, finishing this task sends it to `review` rather than `done`. */
	needsReview: boolean;
	dependencies: string | null;
	artifacts: string | null;
	threadId: string | null;
	notes: string | null;
	auditTrail: string | null;
	outcomeVerdict: TaskOutcomeVerdict | null;
	outcomeSummary: string | null;
	outcomeRecordedAt: string | null;
	outcomeRecordedBy: string | null;
	tokensActualJson: string | null;
	sourceKnowledgeItemId: string | null;
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
}

export interface TaskNode {
	task: Task;
	children: TaskNode[];
}

export interface TaskTreeResponse {
	task: Task;
	/** Root-first ordered list of ancestor tasks (for breadcrumb). */
	ancestors: Task[];
	children: TaskNode[];
	tokensActualRollup: number | null;
}

export interface TaskPatchBody {
	title?: string;
	description?: string | null;
	doneCondition?: string | null;
	ownerAgentId?: string | null;
	dependencies?: string | null;
	parentTaskId?: string | null;
	state?: TaskState;
	/** Moves the task within its sibling list; siblings are renumbered 0..n-1. */
	position?: number;
	/** Flip whether finishing this task routes to `review` (true) or `done` (false). */
	needsReview?: boolean;
}
