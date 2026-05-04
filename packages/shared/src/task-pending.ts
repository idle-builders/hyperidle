/**
 * L15 — derive pending request from a thread's message stream.
 *
 * @lore L15 §2.2: pending is a read-model derivation, not a write-side
 * field. Single source of truth = the message stream. Mixing
 * `tasks.updated_at` with `messages.created_at` would let two clocks
 * disagree under concurrent writes.
 */

import type { Message } from "./thread.js";
import type { RequestVerb } from "./task-request-verbs.js";

export interface PendingRequestSummary {
	readonly messageId: string;
	readonly verb: RequestVerb;
	readonly reason?: string;
	readonly createdAt: string;
}

/**
 * Pure derivation: returns the most-recent pending request on a thread, or
 * null if there is no pending. A thread is "pending" iff its most-recent
 * plain-with-request message is NOT a cancel_request.
 *
 * Caller passes messages sorted by (createdAt, id) ASCENDING. Same ordering
 * convention as `headCollapsePredicate`.
 */
export function derivePendingRequest(
	messages: ReadonlyArray<Message>,
): PendingRequestSummary | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m.type !== "plain") continue;
		if ("redacted" in m.payload) continue;
		const request = m.payload.request;
		if (!request) continue;
		if (request.verb === "cancel_request") return null;
		return {
			messageId: m.id,
			verb: request.verb,
			...(request.reason !== undefined ? { reason: request.reason } : {}),
			createdAt: m.createdAt,
		};
	}
	return null;
}
