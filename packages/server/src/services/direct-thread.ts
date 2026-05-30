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
 * `host_kind=recipientKind, host_id=recipientId` with exactly two
 * participants. Returns the thread id.
 *
 * @param recipientKind - Determines the `hostKind` on the created thread.
 *   Defaults to `"agent"` for backward compatibility (Q1 §3.1).
 */
export async function findOrCreateDirectThread(
	db: HyperIdleDb,
	senderId: string,
	recipientId: string,
	now: string,
	recipientKind: "agent" | "user" = "agent",
): Promise<string> {
	const directThreads = await db
		.select()
		.from(threads)
		.where(and(eq(threads.hostKind, recipientKind), eq(threads.hostId, recipientId)));
	for (const thread of directThreads) {
		const parsed = JSON.parse(thread.participants);
		if (!Array.isArray(parsed)) continue;
		const parts = parsed.filter((p): p is string => typeof p === "string");
		if (parts.length === 2 && parts.includes(senderId) && parts.includes(recipientId)) {
			return thread.id;
		}
	}
	const threadId = crypto.randomUUID();
	await db.insert(threads).values({
		id: threadId,
		hostKind: recipientKind,
		hostId: recipientId,
		initiatorId: senderId,
		participants: JSON.stringify([senderId, recipientId]),
		lastActiveAt: now,
		createdAt: now,
	});
	return threadId;
}
