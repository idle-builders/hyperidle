/**
 * Subscriptions and inbox — the single owner of `subscriptions`/`inbox` row
 * reads and writes. A subscription is one row per
 * `user · event | schedule · document? · paused`; an inbox row is one reason
 * for a person or an agent to look at something, seen and read or not.
 */
import {
	type HyperIdleDb,
	inbox,
	type NewInboxRow,
	type NewSubscription,
	subscriptions,
} from "@hyperidle/db";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";

export type NewSubscriptionRow = NewSubscription;

export interface SubscriptionsFilter {
	readonly ids?: readonly string[];
	readonly userId?: string;
	readonly event?: string;
	/** Only the subscriptions that follow this one object. */
	readonly objectId?: string;
	readonly paused?: boolean;
}

export function listSubscriptions(
	db: HyperIdleDb,
	filter: SubscriptionsFilter = {},
): Promise<Array<typeof subscriptions.$inferSelect>> {
	if (filter.ids !== undefined && filter.ids.length === 0) return Promise.resolve([]);
	const preds = [];
	if (filter.ids !== undefined) preds.push(inArray(subscriptions.id, Array.from(filter.ids)));
	if (filter.userId !== undefined) preds.push(eq(subscriptions.userId, filter.userId));
	if (filter.event !== undefined) preds.push(eq(subscriptions.event, filter.event));
	if (filter.objectId !== undefined) preds.push(eq(subscriptions.objectId, filter.objectId));
	if (filter.paused !== undefined) preds.push(eq(subscriptions.paused, filter.paused));
	return db
		.select()
		.from(subscriptions)
		.where(preds.length > 0 ? and(...preds) : undefined);
}

export async function getSubscription(
	db: HyperIdleDb,
	id: string,
): Promise<typeof subscriptions.$inferSelect | undefined> {
	const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
	return row;
}

export async function insertSubscription(
	db: HyperIdleDb,
	values: NewSubscriptionRow,
	opts?: { readonly onConflictDoNothing?: boolean },
): Promise<typeof subscriptions.$inferSelect | undefined> {
	const [row] = opts?.onConflictDoNothing
		? await db.insert(subscriptions).values(values).onConflictDoNothing().returning()
		: await db.insert(subscriptions).values(values).returning();
	if (!(row || opts?.onConflictDoNothing)) {
		throw new Error("insertSubscription: insert returned no row");
	}
	return row;
}

export type SubscriptionPatch = Partial<
	Pick<NewSubscription, "event" | "schedule" | "paused" | "nextRunAt" | "updatedAt">
>;

export async function updateSubscription(
	db: HyperIdleDb,
	id: string,
	patch: SubscriptionPatch,
): Promise<void> {
	await db.update(subscriptions).set(patch).where(eq(subscriptions.id, id));
}

/** Pause or unpause every one of these subscriptions — the plugin
 * enable/disable/remove lifecycle's `setLive`, batched by id. */
export async function setSubscriptionsPaused(
	db: HyperIdleDb,
	ids: readonly string[],
	paused: boolean,
	updatedAt: string,
): Promise<void> {
	if (ids.length === 0) return;
	await db
		.update(subscriptions)
		.set({ paused, updatedAt })
		.where(inArray(subscriptions.id, Array.from(ids)));
}

/** Hard-delete every one of these subscriptions — a reinstall's cleanup of
 * the reasons its manifest no longer declares. */
export async function deleteSubscriptions(db: HyperIdleDb, ids: readonly string[]): Promise<void> {
	if (ids.length === 0) return;
	await db.delete(subscriptions).where(inArray(subscriptions.id, Array.from(ids)));
}

export async function deleteSubscription(db: HyperIdleDb, id: string): Promise<void> {
	await db.delete(subscriptions).where(eq(subscriptions.id, id));
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export interface InboxRowFilter {
	readonly userId: string;
	readonly limit?: number;
	/** Only the rows not yet read, oldest first — what an agent's runner works through. */
	readonly unread?: boolean;
}

/** Newest first — `open_user`'s "newest 50" — or, `unread`, oldest unread first. */
export function listInboxRows(
	db: HyperIdleDb,
	filter: InboxRowFilter,
): Promise<Array<typeof inbox.$inferSelect>> {
	const q = filter.unread
		? db
				.select()
				.from(inbox)
				.where(and(eq(inbox.userId, filter.userId), isNull(inbox.readAt)))
				.orderBy(asc(inbox.createdAt), asc(inbox.id))
		: db
				.select()
				.from(inbox)
				.where(eq(inbox.userId, filter.userId))
				.orderBy(desc(inbox.createdAt), desc(inbox.id));
	return filter.limit !== undefined ? q.limit(filter.limit) : q;
}

/** Idempotent on `(userId, key)` — the same wake is one row. */
export async function insertInboxRow(
	db: HyperIdleDb,
	values: NewInboxRow,
): Promise<typeof inbox.$inferSelect | undefined> {
	const [row] = await db.insert(inbox).values(values).onConflictDoNothing().returning();
	return row;
}

/** `seen: "all"` marks every unseen row for this user; a list marks only those rows. */
export async function markInboxSeen(
	db: HyperIdleDb,
	userId: string,
	ids: "all" | readonly string[],
	seenAt: string,
): Promise<void> {
	const scope =
		ids === "all"
			? and(eq(inbox.userId, userId), isNull(inbox.seenAt))
			: and(eq(inbox.userId, userId), inArray(inbox.id, Array.from(ids)));
	await db.update(inbox).set({ seenAt }).where(scope);
}

export async function markInboxRead(
	db: HyperIdleDb,
	userId: string,
	ids: readonly string[],
	readAt: string,
): Promise<void> {
	if (ids.length === 0) return;
	await db
		.update(inbox)
		.set({ readAt, seenAt: readAt })
		.where(and(eq(inbox.userId, userId), inArray(inbox.id, Array.from(ids))));
}

/** Delete every read inbox row written before `cutoff`. Returns the count deleted. */
export async function deleteReadInboxRowsBefore(db: HyperIdleDb, cutoff: string): Promise<number> {
	const deleted = await db
		.delete(inbox)
		.where(and(isNotNull(inbox.readAt), lt(inbox.createdAt, cutoff)))
		.returning({ id: inbox.id });
	return deleted.length;
}
