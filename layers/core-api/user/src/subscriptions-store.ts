/**
 * Subscriptions and inbox — the single owner of `subscriptions`/`inbox` row
 * reads and writes (migration 0088, BC5 T2). A subscription is one row per
 * `user · event | schedule · document? · paused`; an inbox row is a pointer
 * at a `changes` row a person has (or has not) seen/read. `user-actions.ts`'s
 * `edit_user`/`open_user` are the only callers today — the fire mechanism
 * (T7a's `subscription-fire.ts`) is this store's second caller once it
 * lands.
 */
import {
	type HyperIdleDb,
	inbox,
	type NewInboxRow,
	type NewSubscription,
	subscriptions,
} from "@hyperidle/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

export type NewSubscriptionRow = NewSubscription;

export interface SubscriptionsFilter {
	readonly ids?: readonly string[];
	readonly userId?: string;
	readonly event?: string;
	readonly paused?: boolean;
}

export async function listSubscriptions(
	db: HyperIdleDb,
	filter: SubscriptionsFilter = {},
): Promise<Array<typeof subscriptions.$inferSelect>> {
	if (filter.ids !== undefined && filter.ids.length === 0) return [];
	const preds = [];
	if (filter.ids !== undefined) preds.push(inArray(subscriptions.id, Array.from(filter.ids)));
	if (filter.userId !== undefined) preds.push(eq(subscriptions.userId, filter.userId));
	if (filter.event !== undefined) preds.push(eq(subscriptions.event, filter.event));
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
): Promise<typeof subscriptions.$inferSelect> {
	const [row] = await db.insert(subscriptions).values(values).returning();
	if (!row) throw new Error("insertSubscription: insert returned no row");
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

export async function deleteSubscription(db: HyperIdleDb, id: string): Promise<void> {
	await db.delete(subscriptions).where(eq(subscriptions.id, id));
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export interface InboxRowFilter {
	readonly userId: string;
	readonly limit?: number;
}

/** Newest first, by `change_id` insertion order — `open_user`'s "newest 50". */
export async function listInboxRows(
	db: HyperIdleDb,
	filter: InboxRowFilter,
): Promise<Array<typeof inbox.$inferSelect>> {
	const q = db
		.select()
		.from(inbox)
		.where(eq(inbox.userId, filter.userId))
		.orderBy(desc(inbox.changeId));
	return filter.limit !== undefined ? q.limit(filter.limit) : q;
}

/** Idempotent — a subscriber can only ever see a change once. */
export async function insertInboxRow(
	db: HyperIdleDb,
	values: NewInboxRow,
): Promise<typeof inbox.$inferSelect | undefined> {
	const [row] = await db.insert(inbox).values(values).onConflictDoNothing().returning();
	return row;
}

/** `seen: "all"` marks every unseen row for this user; a list marks only those ids. */
export async function markInboxSeen(
	db: HyperIdleDb,
	userId: string,
	changeIds: "all" | readonly string[],
	seenAt: string,
): Promise<void> {
	const scope =
		changeIds === "all"
			? and(eq(inbox.userId, userId), isNull(inbox.seenAt))
			: and(eq(inbox.userId, userId), inArray(inbox.changeId, Array.from(changeIds)));
	await db.update(inbox).set({ seenAt }).where(scope);
}

export async function markInboxRead(
	db: HyperIdleDb,
	userId: string,
	changeIds: readonly string[],
	readAt: string,
): Promise<void> {
	if (changeIds.length === 0) return;
	await db
		.update(inbox)
		.set({ readAt, seenAt: readAt })
		.where(and(eq(inbox.userId, userId), inArray(inbox.changeId, Array.from(changeIds))));
}
