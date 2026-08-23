/**
 * @lore AU44-b8: promotedRichMessageId moved here from framework/domain-model/src/thread.ts.
 * Only ThreadShell and RichMessageCard use it; this is a pure render rule.
 * Audit row 35: MERGE → design-system (=core-ui).
 */

import type { Message, MessageId } from "@hyperidle/domain-model";

export function promotedRichMessageId(messages: ReadonlyArray<Message>): MessageId | null {
	let bestId: MessageId | null = null;
	let bestCreatedAt: string | null = null;
	for (const m of messages) {
		if (m.type !== "review" && m.type !== "questionnaire") continue;
		if (m.resolvedAt !== null) continue;
		if (bestCreatedAt === null || m.createdAt < bestCreatedAt) {
			bestCreatedAt = m.createdAt;
			bestId = m.id;
		}
	}
	return bestId;
}
