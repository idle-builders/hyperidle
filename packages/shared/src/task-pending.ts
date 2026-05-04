/**
 * L15 § 3.3 — pending-request derivation.
 *
 * A thread is "pending" iff its most-recent `plain` message with a `request`
 * payload is NOT a `cancel_request`. Caller passes messages sorted by
 * (createdAt, id) ASCENDING (same convention as `headCollapsePredicate`).
 *
 * @lore L15 § 2.2: derivation is message-stream-only. No comparison against
 * `tasks.updated_at` — two clocks would let the pending flag flicker.
 */

import type { RequestVerb } from "./task-request-verbs.js";
import type { Message } from "./thread.js";

export interface PendingRequestSummary {
	readonly messageId: string;
	readonly verb: RequestVerb;
	readonly reason?: string;
	readonly createdAt: string;
}

export function derivePendingRequest(
	messages: ReadonlyArray<Message>,
): PendingRequestSummary | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (!m) continue;
		if (m.type !== "plain") continue;
		const payload = m.payload;
		if ("redacted" in payload) continue;
		const request = payload.request;
		if (!request) continue;
		if (request.verb === "cancel_request") return null;
		return {
			messageId: m.id,
			verb: request.verb,
			reason: request.reason,
			createdAt: m.createdAt,
		};
	}
	return null;
}
