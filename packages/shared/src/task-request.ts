/**
 * L15 — Task request verb matrix + wire copy.
 *
 * Single source of truth for the per-state ordered verb list (approved.md
 * §4.1) and the verbatim message text per verb (approved.md §4.2). Pure /
 * no I/O — importable from web (kebab render), server tests (wire copy
 * verification), and any future server-side validation.
 */

import type { TaskState } from "./types.js";

export const TASK_REQUEST_VERBS = [
	"pause",
	"mark_blocked",
	"resume",
	"push_to_review",
	"mark_done",
	"reopen",
	"kill",
] as const;
export type TaskRequestVerb = (typeof TASK_REQUEST_VERBS)[number];

/**
 * Render row for the kebab menu — one entry per verb at a given state.
 * `disabled: true` rows are NOT requestable but still rendered (greyed) to
 * keep the verb set visible.
 *
 * `danger: true` marks rows that the renderer must visually separate (under
 * a divider) and tint with `--danger` (approved.md §4.1, only `kill`).
 */
export interface RequestableVerbRow {
	readonly verb: TaskRequestVerb;
	readonly label: string;
	readonly targetState: TaskState;
	readonly disabled: boolean;
	readonly disabledHint?: string;
	readonly danger?: boolean;
}

const VERB_LABEL: Record<TaskRequestVerb, string> = {
	pause: "Pause",
	mark_blocked: "Mark blocked",
	resume: "Resume",
	push_to_review: "Push to review",
	mark_done: "Mark done",
	reopen: "Reopen",
	kill: "Kill task",
};

const VERB_TARGET: Record<TaskRequestVerb, TaskState> = {
	pause: "hold",
	mark_blocked: "blocked",
	resume: "in_progress",
	push_to_review: "review",
	mark_done: "done",
	reopen: "accepted",
	kill: "killed",
};

const REQUEST_TEXT: Record<TaskRequestVerb, string> = {
	pause: "Requesting: pause this task.",
	mark_blocked: "Requesting: mark this task as blocked.",
	resume: "Requesting: resume this task.",
	push_to_review: "Requesting: push this task to review.",
	mark_done: "Requesting: mark this task as done.",
	reopen: "Requesting: reopen this task.",
	kill: "Requesting: kill this task.",
};

/**
 * Per-state ordered verb sets per approved.md §4.1. The `kill` verb is
 * always present at the end of every state's list, marked `danger: true`
 * so the renderer can place it under the divider with danger tint. This
 * keeps the matrix as the single source of truth — no hand-rolled kill
 * row in the renderer.
 */
const ORDER_BY_STATE: Record<TaskState, ReadonlyArray<TaskRequestVerb>> = {
	proposed: ["pause", "mark_blocked", "resume", "push_to_review", "mark_done", "kill"],
	accepted: ["pause", "mark_blocked", "resume", "push_to_review", "mark_done", "kill"],
	hold: ["resume", "mark_blocked", "push_to_review", "mark_done", "pause", "kill"],
	in_progress: ["pause", "mark_blocked", "push_to_review", "mark_done", "resume", "kill"],
	review: ["mark_done", "pause", "mark_blocked", "push_to_review", "resume", "kill"],
	blocked: ["resume", "push_to_review", "mark_done", "pause", "mark_blocked", "kill"],
	done: ["reopen", "pause", "mark_blocked", "push_to_review", "mark_done", "kill"],
	killed: ["reopen"],
};

/**
 * Per-state set of verbs that are not applicable (rendered greyed but
 * still visible — approved.md §4.1: "the full set is always visible").
 */
const DISABLED_BY_STATE: Record<TaskState, ReadonlySet<TaskRequestVerb>> = {
	proposed: new Set(["resume"]),
	accepted: new Set(["resume"]),
	hold: new Set(["pause"]),
	in_progress: new Set(["resume"]),
	review: new Set(["push_to_review"]),
	blocked: new Set(["pause", "mark_blocked"]),
	done: new Set(["pause", "mark_blocked", "push_to_review", "mark_done"]),
	killed: new Set(),
};

const DISABLED_HINT_BY_STATE: Record<TaskState, string> = {
	proposed: "Already paused-equivalent",
	accepted: "Already moving",
	hold: "Already paused",
	in_progress: "Already in progress",
	review: "Already in review",
	blocked: "Already blocked",
	done: "Already done",
	killed: "Already killed",
};

export function getRequestableVerbRows(state: TaskState): ReadonlyArray<RequestableVerbRow> {
	const order = ORDER_BY_STATE[state];
	const disabledSet = DISABLED_BY_STATE[state];
	const hint = DISABLED_HINT_BY_STATE[state];
	return order.map((verb) => {
		const disabled = disabledSet.has(verb);
		return {
			verb,
			label: VERB_LABEL[verb],
			targetState: VERB_TARGET[verb],
			disabled,
			...(disabled ? { disabledHint: hint } : {}),
			...(verb === "kill" ? { danger: true } : {}),
		};
	});
}

export function requestMessageText(verb: TaskRequestVerb): string {
	return REQUEST_TEXT[verb];
}
