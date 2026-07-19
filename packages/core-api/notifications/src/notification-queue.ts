/**
 * @lore AU18: the single repository owning every `notificationQueue` read
 * AND write. This is the AU14 pattern (`knowledge-repository.ts`): one
 * file, zero allowlist, everyone else calls it. Originally enforced
 * repo-wide by `scripts/au18-notification-ownership-guard.ts` (retired AU19
 * Increment 5 item 4: vacuous once `packages/server` was dissolved — its own
 * scan root no longer existed); now enforced by `scripts/table-ownership-
 * guard.ts`'s `TABLE_OWNER` map + widened `packages/core-api/src` scan — the
 * ONLY other legal reference site is this module's own `*.test.ts`.
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
import { and, asc, desc, eq, inArray, isNull, lt, type SQL, sql } from "drizzle-orm";

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

// ─── Public surface (barrel exports) ────────────────────────────────────
//
// @lore AU20 Ag6a: collapsed 18 queue-CRUD functions into 4 general
// operations exposed via the barrel. Old functions remain as package-
// internal helpers (dispatcher.ts / digest.ts import them directly via
// relative path); only the 4 below appear in index.ts.

/**
 * Discriminated filter for `listNotifications`. Each variant maps to one or
 * more of the old per-caller list functions; the `kind` field selects the
 * query shape with no any-bag optional fields.
 */
export type NotificationFilter =
	| { kind: "all" }
	| { kind: "by-status"; status: string; limit?: number }
	| { kind: "unread"; limit?: number }
	| { kind: "pending" }
	| { kind: "pending-digest" }
	| { kind: "by-ids"; ids: readonly string[]; status?: string }
	| { kind: "stuck"; stuckBefore: string }
	| { kind: "pending-by-event"; eventType: string; subjectId: string }
	| { kind: "by-id"; id: string };

/**
 * Discriminated selector for `markNotifications`.
 * `kind: "ids"` targets specific rows (optionally guarded by current status);
 * `kind: "all"` targets every row (used for bulk transitions like mark-seen-all).
 */
export type NotificationSelector =
	| { kind: "ids"; ids: readonly string[]; onlyIfStatus?: string }
	| { kind: "all" };

/**
 * Semantic patch for `markNotifications`.
 * `read` and `seen` are boolean flags resolved to ISO timestamps at write time;
 * remaining fields are passed through directly to the DB update.
 */
export interface NotificationPatch {
	/** If true, sets `readAt` to `now` (unconditional). */
	readonly read?: boolean;
	/** If true, sets `seenAt` to `now` only on rows where `seenAt IS NULL`. */
	readonly seen?: boolean;
	readonly status?: string;
	readonly attempts?: number;
	readonly sentAt?: string | null;
	readonly lastError?: string | null;
	readonly claimedAt?: string | null;
}

/** Options for the `enqueue` function. */
export interface EnqueueOptions {
	/**
	 * When set, checks for an existing `pending` row with matching
	 * `eventType` + `subjectId` before inserting. If one exists, returns
	 * its `id` without a second insert (dedup / throttle guard).
	 */
	readonly dedupeBy?: { readonly eventType: string; readonly subjectId: string };
}

/**
 * Insert a notification row and return its `id`.
 *
 * If `opts.dedupeBy` is provided and a pending row already exists with the
 * same `eventType` + `subjectId`, the existing id is returned without
 * inserting a duplicate.
 *
 * Replaces: `insertNotification`, `findPendingByEventSubject` (via dedupeBy).
 */
export async function enqueue(
	db: HyperIdleDb,
	input: NewNotificationQueueRow,
	opts?: EnqueueOptions,
): Promise<string> {
	if (opts?.dedupeBy !== undefined) {
		const existing = await findPendingByEventSubject(
			db,
			opts.dedupeBy.eventType,
			opts.dedupeBy.subjectId,
		);
		if (existing !== undefined) return existing.id;
	}
	await insertNotification(db, input);
	return input.id;
}

/**
 * Parameterised read over `notificationQueue`.
 *
 * Returns the matched rows for all filter variants. For `by-id` and
 * `pending-by-event`, the result is 0 or 1 elements.
 *
 * Replaces: `listAll`, `listByStatus`, `listUnread`, `listPending`,
 * `listPendingDigest`, `listByIdsWithStatus`, `listStuckLeases`,
 * `findPendingByEventSubject`, `findById`, `queueCountByStatus` (via
 * `.length` on `by-status`/`all`).
 */
export async function listNotifications(
	db: HyperIdleDb,
	filter: NotificationFilter,
): Promise<NotificationQueueRow[]> {
	switch (filter.kind) {
		case "all":
			return listAll(db);
		case "by-status":
			return listByStatus(db, filter.status, filter.limit);
		case "unread":
			return listUnread(db, filter.limit);
		case "pending":
			return listPending(db);
		case "pending-digest":
			return listPendingDigest(db);
		case "by-ids": {
			if (filter.status !== undefined) {
				return listByIdsWithStatus(db, filter.ids, filter.status);
			}
			// No status filter: return all rows matching the id set.
			return db.select().from(notificationQueue).where(inArray(notificationQueue.id, filter.ids));
		}
		case "stuck":
			return listStuckLeases(db, filter.stuckBefore);
		case "pending-by-event":
			// Single-row dedup check; returns 0 or 1 full rows.
			return db
				.select()
				.from(notificationQueue)
				.where(
					and(
						eq(notificationQueue.eventType, filter.eventType),
						eq(notificationQueue.subjectId, filter.subjectId),
						eq(notificationQueue.status, "pending"),
					),
				)
				.limit(1);
		case "by-id": {
			const row = await findById(db, filter.id);
			return row !== undefined ? [row] : [];
		}
	}
}

/**
 * Apply a patch to notifications matching the given selector.
 * Returns the number of rows actually updated.
 *
 * `patch.seen = true` adds a `seenAt IS NULL` guard so already-seen rows
 * keep their original timestamp (idempotent mark-seen-all behaviour).
 * `patch.read = true` sets `readAt` unconditionally.
 *
 * Replaces: `markRead`, `markSeenAll`, `updateStatus`, `updateManyByIds`,
 * `requeueLease`, `claimForSend` (via `onlyIfStatus`).
 */
export async function markNotifications(
	db: HyperIdleDb,
	selector: NotificationSelector,
	patch: NotificationPatch,
	now?: Date,
): Promise<number> {
	const nowStr = (now ?? new Date()).toISOString();

	// Resolve semantic flags to DB columns.
	const dbPatch: Record<string, unknown> = {};
	if (patch.read === true) dbPatch.readAt = nowStr;
	if (patch.seen === true) dbPatch.seenAt = nowStr;
	if (patch.status !== undefined) dbPatch.status = patch.status;
	if (patch.attempts !== undefined) dbPatch.attempts = patch.attempts;
	if ("sentAt" in patch) dbPatch.sentAt = patch.sentAt ?? null;
	if ("lastError" in patch) dbPatch.lastError = patch.lastError ?? null;
	if ("claimedAt" in patch) dbPatch.claimedAt = patch.claimedAt ?? null;

	// Build WHERE clause from selector + optional seen-guard.
	const seenGuard = patch.seen === true ? isNull(notificationQueue.seenAt) : undefined;

	let where: SQL | undefined;
	if (selector.kind === "all") {
		where = seenGuard;
	} else {
		const idCond = inArray(notificationQueue.id, selector.ids);
		const statusCond =
			selector.onlyIfStatus !== undefined
				? eq(notificationQueue.status, selector.onlyIfStatus)
				: undefined;
		where = and(idCond, statusCond, seenGuard);
	}

	const updated = await db
		.update(notificationQueue)
		.set(dbPatch)
		.where(where)
		.returning({ id: notificationQueue.id });
	return updated.length;
}

/**
 * Delete notification rows older than `cutoff` whose status is in `statuses`.
 * Returns the ids of deleted rows.
 *
 * Replaces: `deleteReaped`.
 */
export function reap(
	db: HyperIdleDb,
	cutoff: string,
	statuses: readonly string[],
): Promise<string[]> {
	return deleteReaped(db, cutoff, statuses);
}
