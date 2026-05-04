/**
 * L15 § 3.1 — task request verbs.
 *
 * Locked verb identifiers + state-conditional legality matrix + canonical
 * text rendering. Imported by the server endpoint (`POST /api/tasks/:id/request`)
 * and the `TaskActionsMenu` UI.
 *
 * @lore L15 § 2.4: agents move state machines; humans request. The matrix
 * encodes which requests are LEGAL to send for a state, not what the agent
 * MUST honor. The agent decides.
 */

import type { TaskState } from "./types.js";

export const REQUEST_VERBS = [
	"request_stop",
	"request_hold",
	"request_unblock",
	"request_mark_done",
	"request_changes",
	"hand_back",
	"cancel_request",
] as const;

export type RequestVerb = (typeof REQUEST_VERBS)[number];

export const REQUEST_VERB_TEXT: Record<RequestVerb, string> = {
	request_stop: "Request stop",
	request_hold: "Request hold",
	request_unblock: "Request unblock",
	request_mark_done: "Request mark done",
	request_changes: "Request changes",
	hand_back: "Hand back to me",
	cancel_request: "Cancel pending request",
};

export const TASK_VERBS_BY_STATE: Record<TaskState, ReadonlyArray<RequestVerb>> = {
	proposed: [],
	accepted: ["hand_back"],
	hold: [],
	in_progress: ["request_stop", "request_hold", "request_mark_done", "hand_back"],
	blocked: ["request_unblock", "request_stop", "hand_back"],
	review: ["request_mark_done", "request_changes"],
	done: [],
	killed: [],
};

export function isVerbLegalForState(verb: RequestVerb, state: TaskState): boolean {
	return TASK_VERBS_BY_STATE[state].includes(verb);
}

export function renderRequestText(verb: RequestVerb, reason?: string): string {
	const head = REQUEST_VERB_TEXT[verb];
	return reason ? `${head}: ${reason}` : head;
}
