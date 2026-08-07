/**
 * @lore AU20 Stage 2: NotificationsDigestDeps removed from ports.ts barrel.
 * This file defines its own local DigestDeps interface — callers pass
 * structural matches (status.ts already does this with inline objects).
 * The `verdicts` field is NOT in NotificationsDeps (not all callers wire it);
 * keeping deps here avoids forcing every caller to include a verdicts reader.
 */
import type { HyperIdleDb, Item } from "@hyperidle/db";

interface DigestDeps {
	work: { listQueuedItemsSince(db: HyperIdleDb, cutoff: string): Promise<Item[]> };
	verdicts: { listVerdictItemIds(db: HyperIdleDb, itemIds: string[]): Promise<string[]> };
}

interface DailyDigestResult {
	items: Item[];
	generatedAt: string;
}

/**
 * Returns all queued items from the past 24 hours that have no verdict yet.
 * Queued items are identified by auditTrail containing "policy_queued".
 *
 * @lore L1a M4: the legacy `responses` table was dropped; verdicts are now
 * `verdict`-typed `messages` rows whose `legacy_item_id` (for backfilled
 * rows) or `payload.resolvesMessageId` (for new rows) ties them to a
 * source item. For the digest's "already responded" check we project the
 * old responses-by-item-id query to a messages-by-legacy-item-id query.
 *
 * @lore AU19 Increment 1g: `work.listQueuedItemsSince`(`@hyperidle/work`) and
 * `listVerdictItemIds`(`@hyperidle/conversation`) used to be plain direct
 * imports — `composition-boundary-guard` bans ANY `@hyperidle/*` import
 * (other than `db`/`shared`) from this package's `src/**`. Both injected
 * via the local DigestDeps interface (structural — callers assign inline).
 */
export async function getDailyDigest(
	db: HyperIdleDb,
	now: Date | undefined,
	deps: DigestDeps,
): Promise<DailyDigestResult> {
	const currentTime = now ?? new Date();
	const twentyFourHoursAgo = new Date(currentTime.getTime() - 24 * 60 * 60 * 1000);
	const cutoff = twentyFourHoursAgo.toISOString();

	const queuedItems = await deps.work.listQueuedItemsSince(db, cutoff);

	if (queuedItems.length === 0) {
		return { items: [], generatedAt: currentTime.toISOString() };
	}

	const candidateIds = queuedItems.map((i) => i.id);
	const respondedItemIds = new Set(await deps.verdicts.listVerdictItemIds(db, candidateIds));
	const pendingItems = queuedItems.filter((item) => !respondedItemIds.has(item.id));

	return {
		items: pendingItems,
		generatedAt: currentTime.toISOString(),
	};
}
