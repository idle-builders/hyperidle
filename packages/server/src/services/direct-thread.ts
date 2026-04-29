/**
 * L1 step5 (W14): the direct-message thread reuse pattern was duplicated
 * between `routes/agents.ts` and `skill-tools/send-message.ts`. Both
 * looked up `host_kind='agent', host_id=recipient`, JSON-parsed the
 * `participants` column, and matched the 2-person thread containing both
 * ids. This helper is the single source of truth.
 */

import { type HyperIdleDb, threads } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";

/**
 * Find an existing direct thread between `senderId` and `recipientId`, or
 * create one if none exists. Direct threads are projected as
 * `host_kind='agent', host_id=recipientId` (plan §5.3) with exactly two
 * participants. Returns the thread id.
 */
export function findOrCreateDirectThread(
	db: HyperIdleDb,
	senderId: string,
	recipientId: string,
	now: string,
): string {
	const directThreads = db
		.select()
		.from(threads)
		.where(and(eq(threads.hostKind, "agent"), eq(threads.hostId, recipientId)))
		.all();
	for (const thread of directThreads) {
		const parsed = JSON.parse(thread.participants);
		if (!Array.isArray(parsed)) continue;
		const parts = parsed.filter((p): p is string => typeof p === "string");
		if (parts.length === 2 && parts.includes(senderId) && parts.includes(recipientId)) {
			return thread.id;
		}
	}
	const threadId = crypto.randomUUID();
	db.insert(threads)
		.values({
			id: threadId,
			hostKind: "agent",
			hostId: recipientId,
			initiatorId: senderId,
			participants: JSON.stringify([senderId, recipientId]),
			lastActiveAt: now,
			createdAt: now,
		})
		.run();
	return threadId;
}
