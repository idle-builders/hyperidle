/**
 * L15 — task request verbs.
 *
 * Source of truth for the verbs humans can post against a task's thread to
 * request a state change. The verbs are NOT a parallel state machine; agents
 * decide whether to honor a request. Verbs render as canonical text on a
 * `plain` message whose `payload.request` carries the structured form.
 *
 * @lore L15 §2.1: `request` is an optional payload extension on `plain`,
 * NOT a new MessageKind. Concept §4.5.8 hard rule 5 forecloses adding new
 * message types without a doc update first.
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

/**
 * Verb-to-state legality matrix. Exhaustive over TaskState — adding a new
 * state forces a decision here.
 *
 * @lore L15 § 2.4: agents move state machines; humans request. The matrix
 * encodes which requests are LEGAL to send for a state, not what the agent
 * MUST honor. The agent decides.
 */
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

/**
 * Canonical text rendering for each verb (used as the `text` field on the
 * thread message, surfaced to humans reading the thread).
 */
export const REQUEST_VERB_TEXT: Record<RequestVerb, string> = {
	request_stop: "Request stop",
	request_hold: "Request hold",
	request_unblock: "Request unblock",
	request_mark_done: "Request mark done",
	request_changes: "Request changes",
	hand_back: "Hand back to me",
	cancel_request: "Cancel pending request",
};

/**
 * Pure renderer: given a verb + optional reason, produce the canonical text
 * for the message body. Reason is appended as `: <reason>` when present.
 */
export function renderRequestText(verb: RequestVerb, reason?: string): string {
	const head = REQUEST_VERB_TEXT[verb];
	return reason ? `${head}: ${reason}` : head;
}
