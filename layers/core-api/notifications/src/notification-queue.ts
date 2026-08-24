/**
 * @lore AU18: the single repository owning every `notificationQueue` read
 * AND write. This is the AU14 pattern (`knowledge-repository.ts`): one
 * file, zero allowlist, everyone else calls it. Originally enforced
 * repo-wide by `scripts/au18-notification-ownership-guard.ts` (retired AU19
 * Increment 5 item 4: vacuous once `packages/server` was dissolved — its own
 * scan root no longer existed); now enforced by `scripts/table-ownership-
 * guard.ts`'s `TABLE_OWNER` map + widened `layers/core-api/src` scan — the
 * ONLY other legal reference site is this module's own `*.test.ts`.
 *
 * `dispatcher.ts` keeps its orchestration logic (flood cap eviction,
 * lease flush loop, adapter calls, silence/quiet-hours routing) — it
 * delegates all table I/O here. Six production call sites route through
 * this module: dispatcher.ts, digest.ts, routes/notifications-routes.ts,
 * services/retention-reaper.ts, services/lifecycle-propagation.ts, and —
 * @lore AU26, replacing `routes/teams-routes.ts`'s deleted
 * `maybeNotifyAgentError` — services/agent-health-session-end-reactions.ts.
 * Every notification test that seeds or asserts
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
import { and, asc, desc, eq, gte, inArray, isNull, lt, type SQL, sql } from "drizzle-orm";

// ─── Reads ──────────────────────────────────────────────────────────────

async function queueCountByStatus(db: HyperIdleDb, status: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)` })
		.from(notificationQueue)
		.where(eq(notificationQueue.status, status))
		.limit(1);
	return row?.count ?? 0;
}

/** enqueue cap eviction — oldest first. */
async function listPending(db: HyperIdleDb): Promise<NotificationQueueRow[]> {
	return await db
		.select()
		.from(notificationQueue)
		.where(eq(notificationQueue.status, "pending"))
		.orderBy(asc(notificationQueue.createdAt));
}

/** `routes/notifications-routes.ts` GET /inbox — popover list, newest first, optional row cap. */
async function listUnread(db: HyperIdleDb, limit?: number): Promise<NotificationQueueRow[]> {
	const query = db
		.select()
		.from(notificationQueue)
		.where(isNull(notificationQueue.readAt))
		.orderBy(desc(notificationQueue.createdAt));
	return await (limit === undefined ? query : query.limit(limit));
}

/**
 * AU26 — `agent-health-session-end-reactions.ts`'s windowed failure count.
 * Status-agnostic on purpose: a recorded-but-never-surfaced crash (status
 * `"dropped"`) counts exactly as much as a delivered one, because the question
 * is "how often did this agent break", not "how often did we tell you".
 */
async function listByEventSubjectSince(
	db: HyperIdleDb,
	eventType: string,
	subjectId: string,
	since: string,
): Promise<NotificationQueueRow[]> {
	return await db
		.select()
		.from(notificationQueue)
		.where(
			and(
				eq(notificationQueue.eventType, eventType),
				eq(notificationQueue.subjectId, subjectId),
				gte(notificationQueue.createdAt, since),
			),
		)
		.orderBy(desc(notificationQueue.createdAt));
}

// ─── Writes ─────────────────────────────────────────────────────────────

async function insertNotification(db: HyperIdleDb, row: NewNotificationQueueRow): Promise<void> {
	await db.insert(notificationQueue).values(row);
}

// @lore AU20 Stage 2: claimForSend, requeueLease, updateManyByIds removed —
// install.ts uses markNotifications({onlyIfStatus}) for claim and the batch
// transition ops. updateStatus retained for the enqueue cap-eviction path.

interface NotificationQueuePatch {
	readonly status?: string;
	readonly attempts?: number;
	readonly sentAt?: string | null;
	readonly lastError?: string | null;
	readonly claimedAt?: string | null;
}

async function updateStatus(
	db: HyperIdleDb,
	id: string,
	patch: NotificationQueuePatch,
): Promise<void> {
	await db.update(notificationQueue).set(patch).where(eq(notificationQueue.id, id));
}

/**
 * `services/retention-reaper.ts` — age-based GC of rows the user has already read.
 *
 * @lore AU44 batch 4: signature changed from `(db, cutoff, statuses[])` to
 * `(db, cutoff)`. Predicate changed from `status IN (sent, failed, dropped)`
 * to `readAt IS NOT NULL AND createdAt < cutoff` — the dispatcher that produced
 * sent/failed/dropped rows is deleted; the surviving inbox only marks read/seen.
 */
async function deleteReaped(db: HyperIdleDb, cutoff: string): Promise<string[]> {
	const deleted = await db
		.delete(notificationQueue)
		.where(
			and(lt(notificationQueue.createdAt, cutoff), sql`${notificationQueue.readAt} IS NOT NULL`),
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
 * Defense-in-depth queue ceiling shared by `enqueue` (public) and
 * `enqueueNotification` (package-internal, dispatcher.ts). Kept here so
 * both paths enforce an identical cap without cross-file coupling.
 *
 * @lore AU20 Ag6b: when `enqueueNotification` callers were migrated to the
 * public `enqueue`, the cap was initially missing from `enqueue`, creating a
 * behavior regression at the teams-routes.ts emit site. Cap now lives in the
 * public function so every caller gets it uniformly.
 */
const NOTIFICATION_QUEUE_CAP = 10_000;

/**
 * Discriminated filter for `listNotifications`.
 *
 * @lore AU44 batch 4: reduced from 10 variants to 3. Removed: all, by-status,
 * pending, pending-digest, by-ids, stuck, by-id. These were only used by the
 * dispatcher, drain, and digest — all deleted. Surviving callers:
 *   - unread: notifications-routes.ts GET /inbox
 *   - by-event-since: agent-health-session-end-reactions.ts windowed failure count
 *   - pending-by-event: agent-health-session-end-reactions.ts dedup check
 */
export type NotificationFilter =
	| { kind: "unread"; limit?: number }
	| { kind: "pending-by-event"; eventType: string; subjectId: string }
	/**
	 * AU26 — every row this subject has for `eventType` whose `createdAt` is at
	 * or after `since`, whatever its status. This is the notification system
	 * counting its OWN events: "how many times has this agent broken in the last
	 * 7 days" is answered from `notification_queue` alone, so the degraded-agent
	 * rule needs no second table and no tally state. Callers take `.length`.
	 */
	| { kind: "by-event-since"; eventType: string; subjectId: string; since: string };

/**
 * Discriminated selector for `markNotifications`.
 * `kind: "ids"` targets specific rows; `kind: "all"` targets every row
 * (used for bulk transitions like mark-seen-all).
 *
 * @lore AU44 batch 4: onlyIfStatus removed from the "ids" variant — it was
 * only used by the dispatcher for optimistic row-claiming (now deleted).
 */
export type NotificationSelector = { kind: "ids"; ids: readonly string[] } | { kind: "all" };

/**
 * Semantic patch for `markNotifications`.
 * `read` and `seen` are boolean flags resolved to ISO timestamps at write time.
 *
 * @lore AU44 batch 4: status, attempts, sentAt, lastError, claimedAt removed —
 * these were only used by the dispatcher for delivery state transitions (now
 * deleted). The surviving callers only need read/seen flags.
 */
export interface NotificationPatch {
	/** If true, sets `readAt` to `now` (unconditional). */
	readonly read?: boolean;
	/** If true, sets `seenAt` to `now` only on rows where `seenAt IS NULL`. */
	readonly seen?: boolean;
}

/**
 * Insert a notification row and return its `id`.
 *
 * Enforces NOTIFICATION_QUEUE_CAP (10 000) before inserting: evicts the
 * oldest pending row to hold the ceiling.
 *
 * @lore AU44 batch 4: dedupeBy option removed — it was only used by the
 * dispatcher's enqueueNotification helper (now deleted).
 */
export async function enqueue(db: HyperIdleDb, input: NewNotificationQueueRow): Promise<string> {
	// Defense-in-depth queue cap: drop the oldest pending row if at capacity.
	while ((await queueCountByStatus(db, "pending")) >= NOTIFICATION_QUEUE_CAP) {
		const [oldest] = await listPending(db);
		if (!oldest) break; // queue unexpectedly empty — insert safely
		await updateStatus(db, oldest.id, { status: "dropped" });
	}
	await insertNotification(db, input);
	return input.id;
}

/**
 * Parameterised read over `notificationQueue`.
 *
 * @lore AU44 batch 4: reduced from 10 filter variants to 3. See NotificationFilter.
 */
export async function listNotifications(
	db: HyperIdleDb,
	filter: NotificationFilter,
): Promise<NotificationQueueRow[]> {
	switch (filter.kind) {
		case "unread":
			return listUnread(db, filter.limit);
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
		case "by-event-since":
			return listByEventSubjectSince(db, filter.eventType, filter.subjectId, filter.since);
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
 * @lore AU44 batch 4: status/attempts/sentAt/lastError/claimedAt patch fields
 * removed (only used by the deleted dispatcher). onlyIfStatus removed from
 * selector (only used by dispatcher for optimistic row-claiming).
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

	// Build WHERE clause from selector + optional seen-guard.
	const seenGuard = patch.seen === true ? isNull(notificationQueue.seenAt) : undefined;

	let where: SQL | undefined;
	if (selector.kind === "all") {
		where = seenGuard;
	} else {
		const idCond = inArray(notificationQueue.id, selector.ids);
		where = and(idCond, seenGuard);
	}

	const updated = await db
		.update(notificationQueue)
		.set(dbPatch)
		.where(where)
		.returning({ id: notificationQueue.id });
	return updated.length;
}

/**
 * Delete read notification rows older than `cutoff`.
 * Returns the ids of deleted rows.
 *
 * @lore AU44 batch 4: statuses parameter removed — now deletes rows where
 * `readAt IS NOT NULL AND createdAt < cutoff` instead of by status.
 */
export function reap(db: HyperIdleDb, cutoff: string): Promise<string[]> {
	return deleteReaped(db, cutoff);
}
