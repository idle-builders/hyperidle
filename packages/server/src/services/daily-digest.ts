import { type HyperIdleDb, type Item, items, responses } from "@hyperidle/db";
import { and, gte, inArray, like } from "drizzle-orm";

interface DailyDigestResult {
	items: Item[];
	generatedAt: string;
}

/**
 * Returns all queued items from the past 24 hours that have no response yet.
 * Queued items are identified by auditTrail containing "policy_queued".
 *
 * @lore I6: uses a scoped response query instead of loading the entire
 * responses table into memory. The previous approach was O(total responses)
 * in memory; this approach only queries responses for candidate item IDs.
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

	if (queuedItems.length === 0) {
		return { items: [], generatedAt: currentTime.toISOString() };
	}

	// Only query responses for the candidate item IDs (scoped, not full table)
	const candidateIds = queuedItems.map((i) => i.id);
	const respondedItemIds = new Set(
		db
			.select({ itemId: responses.itemId })
			.from(responses)
			.where(inArray(responses.itemId, candidateIds))
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
