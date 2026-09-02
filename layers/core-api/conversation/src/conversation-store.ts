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
 * used repo-wide (see `agent-session-requests.ts:331`) and avoids depending
 * on drizzle's internal transaction type.
 *
 * @lore AU20 Am5: redesigned from 29 bespoke functions toward 14 general ones.
 * The ~10 thread-list variants and 6 verdict/review projections collapsed into
 * `findThread`/`listThreads` + `findMessage`/`listMessages` parameterised by
 * `ThreadFilter`/`MessageFilter`. Two inbox variants → `listInbox(InboxFilter)`.
 * `VerdictMessageRow` and `MessageListOpts` dissolved — callers that need the
 * old projected shapes derive them from the full `Message` row. Each kept
 * function earns its place: CRUD writes (irreducible), `countThreads`
 * (aggregate), `resolveMessageIfUnresolved` (CAS), `findOrCreateDirectThread`
 * (DM composite), `searchConversations`/`getArtifactThreadSummaries` (distinct
 * joined/aggregate product surfaces).
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

// =============================================================================
// Filter types — the parameterisation layer (AU20 Am5)
// =============================================================================

/**
 * Predicate bag for `findThread` / `listThreads`. All fields are optional and
 * are ANDed together. `order` controls the ORDER BY clause; `limit`/`offset`
 * control pagination.
 */
export interface ThreadFilter {
	/** Exact thread id match. */
	readonly id?: string;
	/** Unique direct-message key. */
	readonly directKey?: string;
	/** (hostKind, hostId) host pair. */
	readonly host?: { readonly kind: string; readonly id: string };
	/** hostKind-only filter (no hostId). */
	readonly hostKind?: string;
	/** Only pinned (`pinned = true`) threads. */
	readonly pinned?: boolean;
	/** SQL LIKE probe against the `participants` JSON column (caller provides `%…%` pattern). */
	readonly participantProbe?: string;
	/** Filter by a set of thread ids (inArray). */
	readonly ids?: string[];
	/** `'lastActive'` → `desc(lastActiveAt), desc(id)`. */
	readonly order?: "lastActive";
	readonly limit?: number;
}

/**
 * Predicate bag for `findMessage` / `listMessages`. All fields are optional
 * and are ANDed together. Thread-join predicates (`threadInitiatorId`) are
 * resolved via a subquery — no cross-table result shape change.
 */
export interface MessageFilter {
	readonly id?: string;
	/** Idempotency key. Combine with `threadId` and `senderId` for the full triple. */
	readonly clientKey?: string;
	readonly senderId?: string;
	readonly threadId?: string;
	readonly threadIds?: string[];
	/** Filter by message type(s). Single item uses `eq`; multiple uses `inArray`. */
	readonly types?: string[];
	readonly blockId?: string;
	/** Only rows where `resolvedAt IS NULL`. */
	readonly unresolved?: boolean;
	/** `false` → add `deletedAt IS NULL`. Absent/`true` → include deleted rows. */
	readonly includeDeleted?: boolean;
	/**
	 * Filter messages whose thread's `initiatorId` equals this value.
	 * Resolved via subquery (`messages.threadId IN (SELECT id FROM threads WHERE …)`).
	 */
	readonly threadInitiatorId?: string;
	/** Filter by `legacyItemId IN (…)`. */
	readonly legacyItemIds?: string[];
	/** Only rows where `legacyItemId IS NULL`. */
	readonly noLegacyItem?: boolean;
	/** Only rows where `createdAt >= since`. */
	readonly since?: string;
	/** `'createdAt'` → order by createdAt. */
	readonly order?: "createdAt";
	readonly dir?: "asc" | "desc";
	/** Secondary `id` sort in the same direction as `dir`. */
	readonly tiebreakId?: boolean;
	readonly limit?: number;
}

/**
 * Predicate bag for `listInbox`. `excludeSenderId` selects the inbox variant.
 */
export interface InboxFilter {
	/** Exclude messages sent by this id (sender-exclusion inbox). */
	readonly excludeSenderId?: string;
	readonly limit?: number;
}

// =============================================================================
// CRUD writes — irreducible, unchanged (AU12)
// =============================================================================

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

export async function insertMessage(exec: HyperIdleDb, values: NewMessage): Promise<void> {
	await exec.insert(messages).values(values);
}

/**
 * Verdict-race resolve: set `resolvedAt` only if the message is still
 * unresolved, returning the affected row id(s). First-verdict-wins — the
 * caller checks `.length` (`0` ⇒ another verdict already resolved it).
 */
export function resolveMessageIfUnresolved(
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

// =============================================================================
// DM thread find-or-create — composite, kept (AU20 Am5)
// =============================================================================

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
	// @lore AU44 batch 4: directKey includes recipientKind so agent-kind and user-kind
	// threads for the same participant pair are separate (test Q1 §3.1 asserts this).
	// Still initiator-symmetric: A→B and B→A with the same kind sort to the same key.
	const directKey = `${[senderId, recipientId].sort().join(":")}:${recipientKind}`;
	const [existing] = await exec
		.select({ id: threads.id })
		.from(threads)
		.where(eq(threads.directKey, directKey))
		.limit(1);
	if (existing) return existing.id;
	const threadId = crypto.randomUUID();
	await insertThread(exec, {
		id: threadId,
		directKey,
		hostKind: recipientKind,
		hostId: recipientId,
		initiatorId: senderId,
		participants: JSON.stringify([senderId, recipientId]),
		lastActiveAt: now,
		createdAt: now,
	});
	return threadId;
}

// =============================================================================
// Thread reads — general filter interface (AU20 Am5)
// =============================================================================

/**
 * First thread matching `q`, or `undefined`. No ORDER BY — matches the
 * "first found" semantics callers need (no ordering guarantees).
 *
 * @lore AU20 Am5: replaces `getThreadById`, `getThreadByDirectKey`,
 * `getFirstThreadByHost`, `getFirstPinnedThreadByHost` (4 → 1).
 */
export async function findThread(exec: HyperIdleDb, q: ThreadFilter): Promise<Thread | undefined> {
	const conds: SQL[] = [];
	if (q.id !== undefined) conds.push(eq(threads.id, q.id));
	if (q.directKey !== undefined) conds.push(eq(threads.directKey, q.directKey));
	if (q.host !== undefined) {
		conds.push(eq(threads.hostKind, q.host.kind));
		conds.push(eq(threads.hostId, q.host.id));
	}
	if (q.hostKind !== undefined) conds.push(eq(threads.hostKind, q.hostKind));
	if (q.pinned !== undefined) conds.push(eq(threads.pinned, q.pinned));
	if (q.participantProbe !== undefined)
		conds.push(sql`${threads.participants} LIKE ${q.participantProbe} ESCAPE '\\'`);
	if (q.ids !== undefined && q.ids.length > 0) conds.push(inArray(threads.id, q.ids));

	const w = buildWhere(conds);
	let base = exec.select().from(threads).$dynamic();
	if (w !== undefined) base = base.where(w);
	const [row] = await base.limit(1);
	return row;
}

/**
 * All threads matching `f`, ordered and paginated per filter.
 *
 * @lore AU20 Am5: replaces `listThreadsByHost`, `listThreadsByHostKind`,
 * `listThreadsByParticipant`, `listThreadsByRecency`, `getThreadIdsByHost`
 * (caller `.map(t=>t.id)`), `listThreadMetaByIds` (caller projects) — 6 → 1.
 */
export function listThreads(exec: HyperIdleDb, f: ThreadFilter): Promise<Thread[]> {
	const conds: SQL[] = [];
	if (f.id !== undefined) conds.push(eq(threads.id, f.id));
	if (f.directKey !== undefined) conds.push(eq(threads.directKey, f.directKey));
	if (f.host !== undefined) {
		conds.push(eq(threads.hostKind, f.host.kind));
		conds.push(eq(threads.hostId, f.host.id));
	}
	if (f.hostKind !== undefined) conds.push(eq(threads.hostKind, f.hostKind));
	if (f.pinned !== undefined) conds.push(eq(threads.pinned, f.pinned));
	if (f.participantProbe !== undefined)
		conds.push(sql`${threads.participants} LIKE ${f.participantProbe} ESCAPE '\\'`);
	if (f.ids !== undefined && f.ids.length > 0) conds.push(inArray(threads.id, f.ids));

	const w = buildWhere(conds);
	let q = exec.select().from(threads).$dynamic();
	if (w !== undefined) q = q.where(w);
	if (f.order === "lastActive") q = q.orderBy(desc(threads.lastActiveAt), desc(threads.id));
	if (f.limit !== undefined) q = q.limit(f.limit);
	return q;
}

// =============================================================================
// Message reads — general filter interface (AU20 Am5)
// =============================================================================

/**
 * First message matching `q`, or `undefined`.
 *
 * @lore AU20 Am5: replaces `getMessageById`, `getMessageByClientKey` (2 → 1).
 * For the client-key triple, pass `{threadId, senderId, clientKey}`.
 */
export async function findMessage(
	exec: HyperIdleDb,
	q: MessageFilter,
): Promise<Message | undefined> {
	const conds: SQL[] = [];
	if (q.id !== undefined) conds.push(eq(messages.id, q.id));
	if (q.clientKey !== undefined) conds.push(eq(messages.clientKey, q.clientKey));
	if (q.senderId !== undefined) conds.push(eq(messages.senderId, q.senderId));
	if (q.threadId !== undefined) conds.push(eq(messages.threadId, q.threadId));
	if (q.blockId !== undefined) conds.push(eq(messages.blockId, q.blockId));

	const w = buildWhere(conds);
	let base = exec.select().from(messages).$dynamic();
	if (w !== undefined) base = base.where(w);
	const [row] = await base.limit(1);
	return row;
}

/**
 * Messages matching `f`, ordered and limited per filter.
 *
 * Thread-join predicates (`threadInitiatorId`) are resolved via a subquery
 * so the return type is always plain `Message[]`.
 *
 * @lore AU20 Am5: replaces `listMessagesByThread`, `getMessagesByThreadIds`,
 * `listUnresolvedReviewThreadIds`, `listVerdictItemIds`,
 * `listInitiatedVerdictMessages`, `listVerdictMessagesByItemIds` (6 → 1).
 * Verdict/review projections dissolve: callers receive full `Message` rows
 * and derive projected shapes themselves. `VerdictMessageRow` is gone.
 *
 * @lore `threadInitiatorId` uses a subquery (not a JOIN) so the SELECT stays
 * over `messages` only, returning `Message[]` without any shape widening.
 * The subquery renders as `messages.thread_id IN (SELECT id FROM threads
 * WHERE initiator_id = ?)` — semantically identical to the previous
 * `innerJoin` + projected select that returned `VerdictMessageRow`.
 */
export function listMessages(exec: HyperIdleDb, f: MessageFilter): Promise<Message[]> {
	const conds: SQL[] = [];
	if (f.id !== undefined) conds.push(eq(messages.id, f.id));
	if (f.clientKey !== undefined) conds.push(eq(messages.clientKey, f.clientKey));
	if (f.senderId !== undefined) conds.push(eq(messages.senderId, f.senderId));
	if (f.threadId !== undefined) conds.push(eq(messages.threadId, f.threadId));
	if (f.threadIds !== undefined && f.threadIds.length > 0)
		conds.push(inArray(messages.threadId, f.threadIds));
	if (f.types !== undefined && f.types.length > 0) conds.push(inArray(messages.type, f.types));
	if (f.blockId !== undefined) conds.push(eq(messages.blockId, f.blockId));
	if (f.unresolved === true) conds.push(sql`${messages.resolvedAt} IS NULL`);
	if (f.includeDeleted === false) conds.push(sql`${messages.deletedAt} IS NULL`);
	if (f.legacyItemIds !== undefined && f.legacyItemIds.length > 0)
		conds.push(inArray(messages.legacyItemId, f.legacyItemIds));
	if (f.noLegacyItem === true) conds.push(isNull(messages.legacyItemId));
	if (f.since !== undefined) conds.push(gte(messages.createdAt, f.since));
	// @lore AU20 Am5: threadInitiatorId uses a subquery to avoid changing the
	// return shape. The subquery is built from `exec` so it participates in the
	// same transaction as the outer query.
	if (f.threadInitiatorId !== undefined) {
		const sub = exec
			.select({ id: threads.id })
			.from(threads)
			.where(eq(threads.initiatorId, f.threadInitiatorId));
		conds.push(inArray(messages.threadId, sub));
	}

	const w = buildWhere(conds);
	let q = exec.select().from(messages).$dynamic();
	if (w !== undefined) q = q.where(w);
	if (f.order === "createdAt") {
		const dir = f.dir ?? "asc";
		const primary = dir === "desc" ? desc(messages.createdAt) : asc(messages.createdAt);
		if (f.tiebreakId) {
			const secondary = dir === "desc" ? desc(messages.id) : asc(messages.id);
			q = q.orderBy(primary, secondary);
		} else {
			q = q.orderBy(primary);
		}
	}
	if (f.limit !== undefined) q = q.limit(f.limit);
	return q;
}

// =============================================================================
// Inbox join surface — two variants → one (AU20 Am5)
// =============================================================================

/** One inbox row: the full message plus its thread's `participants` JSON for JS membership filtering. */
export interface InboxRow {
	readonly message: Message;
	readonly participants: string;
}

/**
 * Inbox over-fetch, newest first. Two variants selected by filter field:
 *  - `excludeSenderId` → messages the agent did NOT send, newest first, capped.
 *  - `participantProbe` → messages in threads whose participants LIKE-match,
 *    newest first, page-limited.
 *
 * @lore AU20 Am5: replaces `listInboxBySenderExclusion` and
 * `listInboxByParticipantProbe` (2 → 1).
 */
export async function listInbox(exec: HyperIdleDb, f: InboxFilter): Promise<InboxRow[]> {
	const limit = f.limit ?? 50;
	const rows = await exec
		.select()
		.from(messages)
		.innerJoin(threads, eq(messages.threadId, threads.id))
		.where(f.excludeSenderId !== undefined ? ne(messages.senderId, f.excludeSenderId) : undefined)
		.orderBy(desc(messages.createdAt))
		.limit(limit);
	return rows.map((r) => ({ message: r.messages, participants: r.threads.participants }));
}

// =============================================================================
// Joined / aggregate surfaces — distinct product capabilities, kept (AU20 Am5)
// =============================================================================

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
export function searchConversations(
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


// =============================================================================
// Internal helpers
// =============================================================================

/** Build a WHERE clause from a condition list (empty → undefined = no WHERE). */
function buildWhere(conds: SQL[]): SQL | undefined {
	if (conds.length === 0) return undefined;
	if (conds.length === 1) return conds[0];
	return and(...conds);
}
