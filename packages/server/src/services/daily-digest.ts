import { type HyperIdleDb, type Item, items, responses } from "@hyperidle/db";
import { and, gte, like } from "drizzle-orm";

interface DailyDigestResult {
	items: Item[];
	generatedAt: string;
}

/**
 * Returns all queued items from the past 24 hours that have no response yet.
 * Queued items are identified by auditTrail containing "policy_queued".
 */
export function getDailyDigest(db: HyperIdleDb, now?: Date): DailyDigestResult {
	const currentTime = now ?? new Date();
	const twentyFourHoursAgo = new Date(currentTime.getTime() - 24 * 60 * 60 * 1000);
	const cutoff = twentyFourHoursAgo.toISOString();

	// Get all queued items from the last 24h
	const queuedItems = db
		.select()
		.from(items)
		.where(and(like(items.auditTrail, "%policy_queued%"), gte(items.createdAt, cutoff)))
		.all();

	// Get all item IDs that have responses
	const respondedItemIds = new Set(
		db
			.select({ itemId: responses.itemId })
			.from(responses)
			.all()
			.map((r) => r.itemId),
	);

	// Filter out items that already have responses
	const pendingItems = queuedItems.filter((item) => !respondedItemIds.has(item.id));

	return {
		items: pendingItems,
		generatedAt: currentTime.toISOString(),
	};
}
