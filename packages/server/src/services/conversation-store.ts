/**
 * Conversation store — the single owner of `threads` + `messages` row writes
 * (AU12). Every caller that creates or modifies a thread or message routes its
 * `insert`/`update` through one of these functions instead of writing the
 * Drizzle table directly. The store owns the ROW WRITE ONLY — no event
 * emission, no transaction orchestration, no participant/verdict business
 * logic: callers keep their own `eventBus.emit(...)`, `db.transaction`
 * wrappers, participant math, and sibling `agentWorkIntents`/`items` inserts.
 *
 * @lore Executor param is plain `HyperIdleDb` (no union, no derived generic).
 * The drizzle transaction handle is structurally compatible (same
 * `insert`/`update`/`select` methods), so a caller inside `db.transaction`
 * passes its `tx as HyperIdleDb` — the accepted transaction-composition cast
 * used repo-wide (see `agent-session-requests.ts:331`). This mirrors the
 * documented precedent at `practice-meeting.ts:448-454` and avoids depending
 * on drizzle's internal transaction type.
 */

import {
	type HyperIdleDb,
	messages,
	type NewMessage,
	type NewThread,
	threads,
} from "@hyperidle/db";
import { and, eq, isNull } from "drizzle-orm";

// --- threads ---

export async function insertThread(exec: HyperIdleDb, values: NewThread): Promise<void> {
	await exec.insert(threads).values(values);
}

export async function updateThread(
	exec: HyperIdleDb,
	id: string,
	patch: Partial<NewThread>,
): Promise<void> {
	await exec.update(threads).set(patch).where(eq(threads.id, id));
}

// --- messages ---

export async function insertMessage(exec: HyperIdleDb, values: NewMessage): Promise<void> {
	await exec.insert(messages).values(values);
}

export async function updateMessage(
	exec: HyperIdleDb,
	id: string,
	patch: Partial<NewMessage>,
): Promise<void> {
	await exec.update(messages).set(patch).where(eq(messages.id, id));
}

/**
 * Verdict-race resolve: set `resolvedAt` only if the message is still
 * unresolved, returning the affected row id(s). First-verdict-wins — the
 * caller checks `.length` (`0` ⇒ another verdict already resolved it).
 */
export async function resolveMessageIfUnresolved(
	exec: HyperIdleDb,
	id: string,
	resolvedAt: string,
): Promise<{ id: string }[]> {
	return exec
		.update(messages)
		.set({ resolvedAt })
		.where(and(eq(messages.id, id), isNull(messages.resolvedAt)))
		.returning({ id: messages.id });
}

// --- DM thread find-or-create (relocated from services/direct-thread.ts) ---

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
	exec: HyperIdleDb,
	senderId: string,
	recipientId: string,
	now: string,
	recipientKind: "agent" | "user" = "agent",
): Promise<string> {
	const directThreads = await exec
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
	await insertThread(exec, {
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
