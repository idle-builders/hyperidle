import type { HyperIdleDb, Item } from "@hyperidle/db";
import type { NotificationsDigestDeps } from "./ports.js";

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
 * Forward-looking note: post-L1a, items.id is NOT the canonical anchor for
 * verdicts — the verdict targets a `messages.id` (a review-typed message
 * created from the item). The bridge is `messages.legacy_item_id` for
 * backfilled rows and the review-message id (recorded on items by the new
 * item creation path) for fresh rows. Until item-creation is fully ported
 * to the thread primitive, the digest joins on `legacy_item_id`.
 *
 * @lore AU19 Increment 1g: `work.listQueuedItemsSince`(`@hyperidle/work`) and
 * `listVerdictItemIds`(`@hyperidle/conversation`) used to be plain direct
 * imports (both real, already-migrated packages) — legal only while this
 * file lived in `packages/server`, unscanned. `composition-boundary-guard`
 * bans ANY `@hyperidle/*` import (other than `db`/`shared`) from this
 * package's `src/**`, so both are now injected via `NotificationsDigestDeps`
 * (Mechanism C) — the caller (`packages/server`, unguarded) wires the real
 * functions directly, zero behavior change.
 */
export async function getDailyDigest(
	db: HyperIdleDb,
	now: Date | undefined,
	deps: NotificationsDigestDeps,
): Promise<DailyDigestResult> {
	const currentTime = now ?? new Date();
	const twentyFourHoursAgo = new Date(currentTime.getTime() - 24 * 60 * 60 * 1000);
	const cutoff = twentyFourHoursAgo.toISOString();

	// Get all queued items from the last 24h
	const queuedItems = await deps.work.listQueuedItemsSince(db, cutoff);

	if (queuedItems.length === 0) {
		return { items: [], generatedAt: currentTime.toISOString() };
	}

	// Verdict-message rows are the new source of "responded" — filter the
	// candidate set by joining on `legacy_item_id`. Scoped to candidate
	// ids only, not full table.
	const candidateIds = queuedItems.map((i) => i.id);
	const respondedItemIds = new Set(await deps.verdicts.listVerdictItemIds(db, candidateIds));

	// Filter out items that already have a verdict-typed message.
	const pendingItems = queuedItems.filter((item) => !respondedItemIds.has(item.id));

	return {
		items: pendingItems,
		generatedAt: currentTime.toISOString(),
	};
}
