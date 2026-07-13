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
	type Message,
	messages,
	type NewMessage,
	type NewThread,
	type Thread,
	threads,
} from "@hyperidle/db";
import { and, asc, desc, eq, gte, inArray, isNull, ne, type SQL, sql } from "drizzle-orm";

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
// ===========================================================================
// READS (AU12 rework) — every read of `threads`/`messages` routes through here.
// Full-row getters (`Thread`/`Message`) serve internal/logic callers and any
// route whose current response IS the full row. Projected getters return
// EXACTLY the column set their call site's current response includes — no more,
// no less (§8b#1) — so a shared full-row getter can never silently widen a
// response.
// ===========================================================================

// --- threads: single-row + host/key lookups ---

/** Full thread row by id, or `undefined`. */
export async function getThreadById(exec: HyperIdleDb, id: string): Promise<Thread | undefined> {
	const [row] = await exec.select().from(threads).where(eq(threads.id, id)).limit(1);
	return row;
}

/** Full thread row by unique direct-message key, or `undefined`. */
export async function getThreadByDirectKey(
	exec: HyperIdleDb,
	directKey: string,
): Promise<Thread | undefined> {
	const [row] = await exec.select().from(threads).where(eq(threads.directKey, directKey)).limit(1);
	return row;
}

/** First thread hosted by `(hostKind, hostId)`, or `undefined` (no ordering — matches caller). */
export async function getFirstThreadByHost(
	exec: HyperIdleDb,
	hostKind: string,
	hostId: string,
): Promise<Thread | undefined> {
	const [row] = await exec
		.select()
		.from(threads)
		.where(and(eq(threads.hostKind, hostKind), eq(threads.hostId, hostId)))
		.limit(1);
	return row;
}

/** First PINNED thread hosted by `(hostKind, hostId)`, or `undefined`. */
export async function getFirstPinnedThreadByHost(
	exec: HyperIdleDb,
	hostKind: string,
	hostId: string,
): Promise<Thread | undefined> {
	const [row] = await exec
		.select()
		.from(threads)
		.where(
			and(eq(threads.hostKind, hostKind), eq(threads.hostId, hostId), eq(threads.pinned, true)),
		)
		.limit(1);
	return row;
}

/** Ids of all threads hosted by `(hostKind, hostId)` (decompose helper — Work code joins on these). */
export async function getThreadIdsByHost(
	exec: HyperIdleDb,
	hostKind: string,
	hostId: string,
): Promise<string[]> {
	const rows = await exec
		.select({ id: threads.id })
		.from(threads)
		.where(and(eq(threads.hostKind, hostKind), eq(threads.hostId, hostId)));
	return rows.map((r) => r.id);
}

// --- threads: ordered lists (order/limit preserved exactly — §8b#2) ---

/** Threads for `(hostKind, hostId)`, newest-active first (id desc tiebreak), capped at `limit`. */
export async function listThreadsByHost(
	exec: HyperIdleDb,
	hostKind: string,
	hostId: string,
	limit: number,
): Promise<Thread[]> {
	return exec
		.select()
		.from(threads)
		.where(and(eq(threads.hostKind, hostKind), eq(threads.hostId, hostId)))
		.orderBy(desc(threads.lastActiveAt), desc(threads.id))
		.limit(limit);
}

/** Threads for a `hostKind`, newest-active first (id desc tiebreak), capped at `limit`. */
export async function listThreadsByHostKind(
	exec: HyperIdleDb,
	hostKind: string,
	limit: number,
): Promise<Thread[]> {
	return exec
		.select()
		.from(threads)
		.where(eq(threads.hostKind, hostKind))
		.orderBy(desc(threads.lastActiveAt), desc(threads.id))
		.limit(limit);
}

/**
 * Threads whose `participants` JSON matches the caller-built LIKE `probe`,
 * newest-active first (id desc tiebreak), capped at `limit`. Owns the
 * `${threads.participants} LIKE …` fragment; caller keeps its JS membership
 * re-verify against the returned rows.
 */
export async function listThreadsByParticipant(
	exec: HyperIdleDb,
	probe: string,
	limit: number,
): Promise<Thread[]> {
	return exec
		.select()
		.from(threads)
		.where(sql`${threads.participants} LIKE ${probe} ESCAPE '\\'`)
		.orderBy(desc(threads.lastActiveAt), desc(threads.id))
		.limit(limit);
}

/** All threads, newest-created first, page-limited (conversations recency list). */
export async function listThreadsByRecency(
	exec: HyperIdleDb,
	limit: number,
	offset: number,
): Promise<Thread[]> {
	return exec.select().from(threads).orderBy(desc(threads.createdAt)).limit(limit).offset(offset);
}

/** Projected thread metadata for an id set, newest-active first (id asc tiebreak — search over-fetch order). */
export async function listThreadMetaByIds(
	exec: HyperIdleDb,
	ids: string[],
): Promise<Array<{ id: string; hostKind: string; lastActiveAt: string }>> {
	return exec
		.select({ id: threads.id, hostKind: threads.hostKind, lastActiveAt: threads.lastActiveAt })
		.from(threads)
		.where(inArray(threads.id, ids))
		.orderBy(desc(threads.lastActiveAt), threads.id);
}

/** Total thread count. */
export async function countThreads(exec: HyperIdleDb): Promise<number> {
	const [row] = await exec.select({ count: sql<number>`COUNT(*)` }).from(threads).limit(1);
	return row?.count ?? 0;
}

// --- messages: single-row + thread-scoped lists ---

/** Full message row by id, or `undefined`. */
export async function getMessageById(exec: HyperIdleDb, id: string): Promise<Message | undefined> {
	const [row] = await exec.select().from(messages).where(eq(messages.id, id)).limit(1);
	return row;
}

/** Message matching the idempotency triple `(threadId, senderId, clientKey)`, or `undefined`. */
export async function getMessageByClientKey(
	exec: HyperIdleDb,
	threadId: string,
	senderId: string,
	clientKey: string,
): Promise<Message | undefined> {
	const [row] = await exec
		.select()
		.from(messages)
		.where(
			and(
				eq(messages.threadId, threadId),
				eq(messages.senderId, senderId),
				eq(messages.clientKey, clientKey),
			),
		)
		.limit(1);
	return row;
}

/** Options for {@link listMessagesByThread}. Order is applied only when `order` is set. */
export interface MessageListOpts {
	readonly type?: string;
	readonly blockId?: string;
	readonly order?: "createdAt";
	readonly dir?: "asc" | "desc";
	/** Secondary `id` sort in the same direction as `dir` (thread-detail determinism). */
	readonly tiebreakId?: boolean;
	readonly limit?: number;
}

/** Messages in one thread, with optional type/blockId filter, ordering, and limit (all preserved exactly). */
export async function listMessagesByThread(
	exec: HyperIdleDb,
	threadId: string,
	opts: MessageListOpts = {},
): Promise<Message[]> {
	const conds: SQL[] = [eq(messages.threadId, threadId)];
	if (opts.type !== undefined) conds.push(eq(messages.type, opts.type));
	if (opts.blockId !== undefined) conds.push(eq(messages.blockId, opts.blockId));
	let q = exec
		.select()
		.from(messages)
		.where(conds.length === 1 ? conds[0] : and(...conds))
		.$dynamic();
	if (opts.order === "createdAt") {
		const dir = opts.dir ?? "asc";
		const primary = dir === "desc" ? desc(messages.createdAt) : asc(messages.createdAt);
		if (opts.tiebreakId) {
			const secondary = dir === "desc" ? desc(messages.id) : asc(messages.id);
			q = q.orderBy(primary, secondary);
		} else {
			q = q.orderBy(primary);
		}
	}
	if (opts.limit !== undefined) q = q.limit(opts.limit);
	return q;
}

/** Messages across a thread-id set. `includeDeleted: false` owns the `deletedAt IS NULL` fragment. */
export async function getMessagesByThreadIds(
	exec: HyperIdleDb,
	threadIds: string[],
	opts: { includeDeleted?: boolean; order?: "createdAt" } = {},
): Promise<Message[]> {
	const conds: SQL[] = [inArray(messages.threadId, threadIds)];
	if (opts.includeDeleted === false) conds.push(sql`${messages.deletedAt} IS NULL`);
	let q = exec
		.select()
		.from(messages)
		.where(conds.length === 1 ? conds[0] : and(...conds))
		.$dynamic();
	if (opts.order === "createdAt") q = q.orderBy(asc(messages.createdAt));
	return q;
}

/** Thread ids that still have an unresolved `review`/`questionnaire` message, within `threadIds`. */
export async function listUnresolvedReviewThreadIds(
	exec: HyperIdleDb,
	threadIds: string[],
): Promise<string[]> {
	const rows = await exec
		.select({ threadId: messages.threadId })
		.from(messages)
		.where(
			and(
				inArray(messages.threadId, threadIds),
				inArray(messages.type, ["review", "questionnaire"]),
				sql`${messages.resolvedAt} IS NULL`,
			),
		);
	return rows.map((r) => r.threadId);
}

/** `legacyItemId`s of `verdict` messages within a candidate item-id set (daily-digest fan-in). */
export async function listVerdictItemIds(exec: HyperIdleDb, itemIds: string[]): Promise<string[]> {
	const rows = await exec
		.select({ legacyItemId: messages.legacyItemId })
		.from(messages)
		.where(and(eq(messages.type, "verdict"), inArray(messages.legacyItemId, itemIds)));
	return rows.map((r) => r.legacyItemId).filter((id): id is string => id !== null);
}

// --- inbox + search joins (both tables conversation-owned — no cross-owner coupling) ---

/** One inbox row: the full message plus its thread's `participants` JSON for JS membership filtering. */
export interface InboxRow {
	readonly message: Message;
	readonly participants: string;
}

/** Inbox over-fetch: messages the agent did NOT send, newest first, capped. Caller JS-filters by participants. */
export async function listInboxBySenderExclusion(
	exec: HyperIdleDb,
	excludeSenderId: string,
	limit: number,
): Promise<InboxRow[]> {
	const rows = await exec
		.select()
		.from(messages)
		.innerJoin(threads, eq(messages.threadId, threads.id))
		.where(ne(messages.senderId, excludeSenderId))
		.orderBy(desc(messages.createdAt))
		.limit(limit);
	return rows.map((r) => ({ message: r.messages, participants: r.threads.participants }));
}

/** Inbox over-fetch by participant LIKE `probe`, newest first, page-limited. Caller JS-verifies membership. */
export async function listInboxByParticipantProbe(
	exec: HyperIdleDb,
	probe: string,
	limit: number,
	offset: number,
): Promise<InboxRow[]> {
	const rows = await exec
		.select()
		.from(messages)
		.innerJoin(threads, eq(messages.threadId, threads.id))
		.where(sql`${threads.participants} LIKE ${probe} ESCAPE '\\'`)
		.orderBy(desc(messages.createdAt))
		.limit(limit)
		.offset(offset);
	return rows.map((r) => ({ message: r.messages, participants: r.threads.participants }));
}

/** Projected search row (§8b#1: exactly the columns search.ts JS-filters + responds with). */
export interface ThreadSearchRow {
	readonly id: string;
	readonly hostKind: string;
	readonly lastActiveAt: string;
	readonly participants: string;
}

/**
 * Conversation search: threads whose `participants` match `participantPattern`
 * AND that have a non-deleted message matching `messagePattern`, over-fetched
 * newest-active first (id asc tiebreak) up to `limit`. Owns the whole
 * threads⋈messages join incl. every owned-column fragment.
 */
export async function searchConversations(
	exec: HyperIdleDb,
	participantPattern: string,
	messagePattern: string,
	limit: number,
): Promise<ThreadSearchRow[]> {
	return exec
		.select({
			id: threads.id,
			hostKind: threads.hostKind,
			lastActiveAt: threads.lastActiveAt,
			participants: threads.participants,
		})
		.from(threads)
		.innerJoin(messages, eq(messages.threadId, threads.id))
		.where(
			and(
				sql`${threads.participants} LIKE ${participantPattern} ESCAPE '\\'`,
				sql`${messages.payload} ILIKE ${messagePattern} ESCAPE '\\'`,
				sql`${messages.deletedAt} IS NULL`,
			),
		)
		.orderBy(desc(threads.lastActiveAt), threads.id)
		.limit(limit);
}

/** Projected verdict-message row (approval-rate paths). */
export interface VerdictMessageRow {
	readonly id: string;
	readonly payload: string;
	readonly threadId: string;
	readonly createdAt: string;
}

/** Verdict messages attributed via `threads.initiatorId`, no `legacyItemId`, within the window. */
export async function listInitiatedVerdictMessages(
	exec: HyperIdleDb,
	initiatorId: string,
	windowStart: string,
): Promise<VerdictMessageRow[]> {
	return exec
		.select({
			id: messages.id,
			payload: messages.payload,
			threadId: messages.threadId,
			createdAt: messages.createdAt,
		})
		.from(messages)
		.innerJoin(threads, eq(messages.threadId, threads.id))
		.where(
			and(
				eq(messages.type, "verdict"),
				eq(threads.initiatorId, initiatorId),
				gte(messages.createdAt, windowStart),
				isNull(messages.legacyItemId),
			),
		);
}

/**
 * Verdict messages whose `legacyItemId` is in `itemIds`, within the window.
 * Decomposes the former `messages ⋈ items` join — the caller resolves `itemIds`
 * from its own (Work-owned) `items` read, so conversation-store never touches a
 * Work table.
 */
export async function listVerdictMessagesByItemIds(
	exec: HyperIdleDb,
	itemIds: string[],
	windowStart: string,
): Promise<VerdictMessageRow[]> {
	return exec
		.select({
			id: messages.id,
			payload: messages.payload,
			threadId: messages.threadId,
			createdAt: messages.createdAt,
		})
		.from(messages)
		.where(
			and(
				eq(messages.type, "verdict"),
				inArray(messages.legacyItemId, itemIds),
				gte(messages.createdAt, windowStart),
			),
		);
}

/** Per-artifact conversation summary (bets.ts decompose — reads ONLY threads+messages). */
export interface ArtifactThreadSummaryRow {
	readonly artifactId: string;
	readonly threadId: string;
	readonly messageCount: number;
	readonly lastMessageAt: string | null;
	readonly lastMessagePayload: string | null;
	readonly hasUnresolvedReview: number;
}

/**
 * Conversation summaries for artifact-hosted threads, keyed by plain-string
 * `artifactIds` (`threads.hostKind='artifact' AND threads.hostId IN artifactIds`).
 * Reproduces bets.ts's four message aggregates exactly: `messageCount` counts
 * ALL messages (incl. deleted, matching the former `COUNT(*)`); `lastMessageAt`
 * is the newest NON-deleted message; `lastMessagePayload` is the newest
 * non-deleted `plain` message; `hasUnresolvedReview` is any `review` message
 * with `resolvedAt IS NULL`.
 *
 * Reads ONLY threads + messages — the caller keeps its `artifacts`/`tasks` reads
 * and merges by `artifactId` in JS. Artifacts without a thread do not appear.
 *
 * @lore AU12: aggregation is done in JS over two owned-table reads rather than a
 * correlated `sql` subquery. Drizzle drops table qualification for a
 * single-table (`.from(threads)`, no join) select, so `${messages.threadId} =
 * ${threads.id}` would render as the unqualified `"thread_id" = "id"` — both
 * binding to the subquery's own `messages` table (count = 0). bets.ts's original
 * only qualified because its artifacts⋈tasks⋈threads joins forced it. JS
 * aggregation is behavior-identical and keeps the read inside this store.
 */
export async function getArtifactThreadSummaries(
	exec: HyperIdleDb,
	artifactIds: string[],
): Promise<ArtifactThreadSummaryRow[]> {
	const threadRows = await exec
		.select({ artifactId: threads.hostId, threadId: threads.id })
		.from(threads)
		.where(and(eq(threads.hostKind, "artifact"), inArray(threads.hostId, artifactIds)));
	if (threadRows.length === 0) return [];
	const threadIds = threadRows.map((r) => r.threadId);
	const msgs = await exec
		.select({
			threadId: messages.threadId,
			type: messages.type,
			payload: messages.payload,
			createdAt: messages.createdAt,
			deletedAt: messages.deletedAt,
			resolvedAt: messages.resolvedAt,
		})
		.from(messages)
		.where(inArray(messages.threadId, threadIds));
	const byThread = new Map<string, typeof msgs>();
	for (const m of msgs) {
		const list = byThread.get(m.threadId);
		if (list) list.push(m);
		else byThread.set(m.threadId, [m]);
	}
	return threadRows.map(({ artifactId, threadId }) => {
		const tmsgs = byThread.get(threadId) ?? [];
		// Newest-first among non-deleted (createdAt DESC, matching the SQL LIMIT 1).
		const nonDeleted = tmsgs
			.filter((m) => m.deletedAt == null)
			.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
		const lastPlain = nonDeleted.find((m) => m.type === "plain");
		return {
			artifactId,
			threadId,
			messageCount: tmsgs.length,
			lastMessageAt: nonDeleted[0]?.createdAt ?? null,
			lastMessagePayload: lastPlain?.payload ?? null,
			hasUnresolvedReview: tmsgs.some((m) => m.type === "review" && m.resolvedAt == null) ? 1 : 0,
		};
	});
}
