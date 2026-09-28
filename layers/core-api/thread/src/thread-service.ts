import {
	type HyperIdleDb,
	type Message,
	messages,
	type NewMessage,
	type NewThread,
	type Thread,
	threads,
} from "@hyperidle/db";
import { and, asc, desc, eq, gte, inArray, isNull, type SQL, sql } from "drizzle-orm";

// =============================================================================
// Filter types
// =============================================================================

export interface ThreadFilter {
	readonly id?: string;
	readonly directKey?: string;
	readonly host?: { readonly kind: string; readonly id: string };
	readonly hostKind?: string;
	readonly pinned?: boolean;
	readonly participantProbe?: string;
	readonly ids?: string[];
	/** `false` → add `deletedAt IS NULL`. Absent/`true` → include deleted rows. */
	readonly includeDeleted?: boolean;
	readonly order?: "lastActive";
	readonly limit?: number;
}

export interface MessageFilter {
	readonly id?: string;
	readonly clientKey?: string;
	readonly senderId?: string;
	readonly threadId?: string;
	readonly threadIds?: string[];
	readonly types?: string[];
	readonly blockId?: string;
	readonly unresolved?: boolean;
	readonly includeDeleted?: boolean;
	readonly threadInitiatorId?: string;
	readonly since?: string;
	readonly order?: "createdAt";
	readonly dir?: "asc" | "desc";
	readonly tiebreakId?: boolean;
	readonly limit?: number;
}

// =============================================================================
// CRUD writes
// =============================================================================

export async function insertThread(exec: HyperIdleDb, values: NewThread): Promise<void> {
	await exec.insert(threads).values(values);
}

// @lore: direct-thread INSERT ON CONFLICT (direct_key) DO NOTHING; READ COMMITTED waits on concurrent insert; undefined means re-read with findThreadForUpdate
export async function insertDirectThread(
	exec: HyperIdleDb,
	values: NewThread & { directKey: string },
): Promise<Thread | undefined> {
	const [row] = await exec
		.insert(threads)
		.values(values)
		.onConflictDoNothing({
			target: threads.directKey,
			where: sql`${threads.directKey} IS NOT NULL`,
		})
		.returning();
	return row;
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

export async function updateMessage(
	exec: HyperIdleDb,
	id: string,
	patch: Partial<NewMessage>,
): Promise<void> {
	await exec.update(messages).set(patch).where(eq(messages.id, id));
}

/**
 * Verdict-race resolve: set `resolvedAt` only if the message is still
 * unresolved. First-verdict-wins — the caller checks `.length`.
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
// Thread reads
// =============================================================================

function buildThreadConds(f: ThreadFilter): SQL[] {
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
	if (f.includeDeleted === false) conds.push(isNull(threads.deletedAt));
	return conds;
}

function buildWhere(conds: SQL[]): SQL | undefined {
	if (conds.length === 0) return undefined;
	if (conds.length === 1) return conds[0];
	return and(...conds);
}

export async function findThread(exec: HyperIdleDb, q: ThreadFilter): Promise<Thread | undefined> {
	const w = buildWhere(buildThreadConds(q));
	let base = exec.select().from(threads).$dynamic();
	if (w !== undefined) base = base.where(w);
	const [row] = await base.limit(1);
	return row;
}

// @lore: findThreadForUpdate — SELECT FOR UPDATE; read inside tx before membership change; lock serialises concurrent posts; takes id or directKey
export async function findThreadForUpdate(
	exec: HyperIdleDb,
	q: Pick<ThreadFilter, "id" | "directKey">,
): Promise<Thread | undefined> {
	const w = buildWhere(buildThreadConds(q));
	let base = exec.select().from(threads).$dynamic();
	if (w !== undefined) base = base.where(w);
	const [row] = await base.for("update").limit(1);
	return row;
}

export function listThreads(exec: HyperIdleDb, f: ThreadFilter): Promise<Thread[]> {
	const w = buildWhere(buildThreadConds(f));
	let q = exec.select().from(threads).$dynamic();
	if (w !== undefined) q = q.where(w);
	if (f.order === "lastActive") q = q.orderBy(desc(threads.lastActiveAt), desc(threads.id));
	if (f.limit !== undefined) q = q.limit(f.limit);
	return q;
}

// =============================================================================
// Message reads
// =============================================================================

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
	if (f.since !== undefined) conds.push(gte(messages.createdAt, f.since));
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

/**
 * The latest non-deleted message per thread, for `search_threads`'s
 * `lastMessagePreview` — one query for every thread id in the result page,
 * never one `listMessages` call per thread. A thread
 * with no messages simply has no row in the result; the caller looks each
 * thread id up in a `Map` and treats a miss as "no preview".
 */
export function listLastMessagePerThread(
	exec: HyperIdleDb,
	threadIds: readonly string[],
): Promise<Message[]> {
	if (threadIds.length === 0) return Promise.resolve([]);
	return exec
		.selectDistinctOn([messages.threadId])
		.from(messages)
		.where(and(inArray(messages.threadId, threadIds), isNull(messages.deletedAt)))
		.orderBy(messages.threadId, desc(messages.createdAt), desc(messages.id));
}

// =============================================================================
// Joined / aggregate surfaces
// =============================================================================

export interface ThreadSearchRow {
	readonly id: string;
	readonly hostKind: string;
	readonly lastActiveAt: string;
	readonly participants: string;
	readonly title: string | null;
}

/**
 * Text search: threads whose `participants` match `participantPattern` OR
 * whose stored `title` matches `titlePattern`, AND that have a non-deleted
 * message matching `messagePattern` OR a stored title match — over-fetched
 * newest-active first, up to `limit`. Includes the stored rung-0 title.
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
			title: threads.title,
		})
		.from(threads)
		.innerJoin(messages, eq(messages.threadId, threads.id))
		.where(
			and(
				sql`${threads.participants} LIKE ${participantPattern} ESCAPE '\\'`,
				sql`${messages.payload} ILIKE ${messagePattern} ESCAPE '\\'`,
				sql`${messages.deletedAt} IS NULL`,
				isNull(threads.deletedAt),
			),
		)
		.orderBy(desc(threads.lastActiveAt), threads.id)
		.limit(limit);
}

/** Threads whose STORED title matches, independent of any message content. */
export function searchThreadsByTitle(
	exec: HyperIdleDb,
	titlePattern: string,
	limit: number,
): Promise<ThreadSearchRow[]> {
	return exec
		.select({
			id: threads.id,
			hostKind: threads.hostKind,
			lastActiveAt: threads.lastActiveAt,
			participants: threads.participants,
			title: threads.title,
		})
		.from(threads)
		.where(and(sql`${threads.title} ILIKE ${titlePattern} ESCAPE '\\'`, isNull(threads.deletedAt)))
		.orderBy(desc(threads.lastActiveAt), threads.id)
		.limit(limit);
}
