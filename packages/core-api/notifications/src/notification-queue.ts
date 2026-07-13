/**
 * @lore AU18: the single repository owning every `notificationQueue` read
 * AND write. This is the AU14 pattern (`knowledge-repository.ts`): one
 * file, zero allowlist, everyone else calls it. Enforced repo-wide by
 * `scripts/au18-notification-ownership-guard.ts` — the ONLY other legal
 * reference site is this module's own `*.test.ts`.
 *
 * `dispatcher.ts` keeps its orchestration logic (flood cap eviction,
 * lease flush loop, adapter calls, silence/quiet-hours routing) — it
 * delegates all table I/O here. Six production call sites route through
 * this module: dispatcher.ts, digest.ts, routes/notifications-routes.ts,
 * services/retention-reaper.ts, services/lifecycle-propagation.ts,
 * routes/teams-routes.ts. Every notification test that seeds or asserts
 * against `notification_queue` rows also routes through this module's
 * exports (`listAll`/`findById` cover generic test assertions that don't
 * match one of the narrower, production-shaped read functions below).
 */
import {
	type HyperIdleDb,
	type NewNotificationQueueRow,
	type NotificationQueueRow,
	notificationQueue,
} from "@hyperidle/db";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";

// ─── Reads ──────────────────────────────────────────────────────────────

export async function queueCountByStatus(db: HyperIdleDb, status: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)` })
		.from(notificationQueue)
		.where(eq(notificationQueue.status, status))
		.limit(1);
	return row?.count ?? 0;
}

/** `routes/notifications-routes.ts` GET /queue — newest first, optional row cap. */
export async function listByStatus(
	db: HyperIdleDb,
	status: string,
	limit?: number,
): Promise<NotificationQueueRow[]> {
	const query = db
		.select()
		.from(notificationQueue)
		.where(eq(notificationQueue.status, status))
		.orderBy(desc(notificationQueue.createdAt));
	return await (limit === undefined ? query : query.limit(limit));
}

/** dispatcher.ts flushQueue + digest.ts runDailyDigest — oldest first. */
export async function listPending(db: HyperIdleDb): Promise<NotificationQueueRow[]> {
	return await db
		.select()
		.from(notificationQueue)
		.where(eq(notificationQueue.status, "pending"))
		.orderBy(asc(notificationQueue.createdAt));
}

/**
 * dispatcher.ts's `enqueueNotification` flood-cap eviction — the oldest
 * pending digest row is evicted first so blocking/cost_breach rows always
 * have room. Caller takes `[0]` (matches the original `.limit(1)` query).
 */
export async function listPendingDigest(db: HyperIdleDb): Promise<NotificationQueueRow[]> {
	return await db
		.select()
		.from(notificationQueue)
		.where(and(eq(notificationQueue.status, "pending"), eq(notificationQueue.severity, "digest")))
		.orderBy(asc(notificationQueue.createdAt));
}

/** `routes/notifications-routes.ts` GET /inbox — popover list, newest first, optional row cap. */
export async function listUnread(db: HyperIdleDb, limit?: number): Promise<NotificationQueueRow[]> {
	const query = db
		.select()
		.from(notificationQueue)
		.where(isNull(notificationQueue.readAt))
		.orderBy(desc(notificationQueue.createdAt));
	return await (limit === undefined ? query : query.limit(limit));
}

/** dispatcher.ts's `recoverStuckLeases` — rows whose `sending` lease expired. */
export async function listStuckLeases(
	db: HyperIdleDb,
	cutoff: string,
): Promise<NotificationQueueRow[]> {
	return await db
		.select()
		.from(notificationQueue)
		.where(and(eq(notificationQueue.status, "sending"), lt(notificationQueue.claimedAt, cutoff)));
}

/** digest.ts's post-claim read — the batch of ids just claimed as `sending`. */
export async function listByIdsWithStatus(
	db: HyperIdleDb,
	ids: readonly string[],
	status: string,
): Promise<NotificationQueueRow[]> {
	return await db
		.select()
		.from(notificationQueue)
		.where(and(inArray(notificationQueue.id, ids), eq(notificationQueue.status, status)));
}

/** `routes/teams-routes.ts`'s dedup/throttle check (AB2). */
export async function findPendingByEventSubject(
	db: HyperIdleDb,
	eventType: string,
	subjectId: string,
): Promise<{ id: string } | undefined> {
	const [row] = await db
		.select({ id: notificationQueue.id })
		.from(notificationQueue)
		.where(
			and(
				eq(notificationQueue.eventType, eventType),
				eq(notificationQueue.subjectId, subjectId),
				eq(notificationQueue.status, "pending"),
			),
		)
		.limit(1);
	return row;
}

/** Single-row lookup by id. Test-support read (no single narrower shape fits every call site). */
export async function findById(
	db: HyperIdleDb,
	id: string,
): Promise<NotificationQueueRow | undefined> {
	const [row] = await db
		.select()
		.from(notificationQueue)
		.where(eq(notificationQueue.id, id))
		.limit(1);
	return row;
}

/** Every row, unfiltered. Test-support read for full-table assertions. */
export async function listAll(db: HyperIdleDb): Promise<NotificationQueueRow[]> {
	return await db.select().from(notificationQueue);
}

// ─── Writes ─────────────────────────────────────────────────────────────

export async function insertNotification(
	db: HyperIdleDb,
	row: NewNotificationQueueRow,
): Promise<void> {
	await db.insert(notificationQueue).values(row);
}

/**
 * Atomically claim a pending row for delivery (pending → sending). Returns
 * the claimed row's id, or `undefined` if a concurrent claim already took
 * it (the WHERE clause guards against double-claim).
 */
export async function claimForSend(
	db: HyperIdleDb,
	id: string,
	now: Date,
): Promise<{ id: string } | undefined> {
	const [row] = await db
		.update(notificationQueue)
		.set({ status: "sending", claimedAt: now.toISOString() })
		.where(and(eq(notificationQueue.id, id), eq(notificationQueue.status, "pending")))
		.returning({ id: notificationQueue.id });
	return row;
}

export interface NotificationQueuePatch {
	readonly status?: string;
	readonly attempts?: number;
	readonly sentAt?: string | null;
	readonly lastError?: string | null;
	readonly claimedAt?: string | null;
}

export async function updateStatus(
	db: HyperIdleDb,
	id: string,
	patch: NotificationQueuePatch,
): Promise<void> {
	await db.update(notificationQueue).set(patch).where(eq(notificationQueue.id, id));
}

/** Requeue a single stuck lease: sending → pending, clears claimedAt. */
export async function requeueLease(db: HyperIdleDb, id: string): Promise<void> {
	await db
		.update(notificationQueue)
		.set({ status: "pending", claimedAt: null })
		.where(eq(notificationQueue.id, id));
}

/** `routes/notifications-routes.ts` POST /seen — bulk-clear the unread dot. */
export async function markSeenAll(db: HyperIdleDb, now: Date): Promise<void> {
	await db
		.update(notificationQueue)
		.set({ seenAt: now.toISOString() })
		.where(isNull(notificationQueue.seenAt));
}

/** `routes/notifications-routes.ts` POST /:id/read. */
export async function markRead(db: HyperIdleDb, id: string, now: Date): Promise<void> {
	await db
		.update(notificationQueue)
		.set({ readAt: now.toISOString() })
		.where(eq(notificationQueue.id, id));
}

/**
 * digest.ts's cross-row batch transitions: atomic claim (pending→sending,
 * `onlyIfStatus="pending"`), and the three unconditional batch updates
 * (revert on adapter throw, revert-with-error on adapter failure, complete
 * on success) that omit `onlyIfStatus`.
 */
export async function updateManyByIds(
	db: HyperIdleDb,
	ids: readonly string[],
	patch: NotificationQueuePatch,
	onlyIfStatus?: string,
): Promise<void> {
	const where = onlyIfStatus
		? and(inArray(notificationQueue.id, ids), eq(notificationQueue.status, onlyIfStatus))
		: inArray(notificationQueue.id, ids);
	await db.update(notificationQueue).set(patch).where(where);
}

/** `services/retention-reaper.ts` — age-based, terminal-status-only GC. Returns deleted ids. */
export async function deleteReaped(
	db: HyperIdleDb,
	cutoff: string,
	statuses: readonly string[],
): Promise<string[]> {
	const deleted = await db
		.delete(notificationQueue)
		.where(
			and(lt(notificationQueue.createdAt, cutoff), inArray(notificationQueue.status, statuses)),
		)
		.returning({ id: notificationQueue.id });
	return deleted.map((r) => r.id);
}
