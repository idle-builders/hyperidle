/**
 * L22 — RelevanceService: compute three-signal relevance signals and
 * denormalize relevanceScore onto knowledge_items.
 *
 * computeSignals: returns a Map<itemId, SignalSet> for a batch of item IDs.
 * recomputeScores: updates the relevanceScore column on knowledge_items.
 *
 * @lore L22: computeSignals is now async (PGlite requires async DB access).
 * recomputeScores is async to allow future batching with async boundaries.
 * Both take an explicit itemIds list — never load the full table.
 */
import {
	type HyperIdleDb,
	knowledgeAccessLog,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import { and, eq, inArray } from "drizzle-orm";
import { computeRelevanceScore, DEFAULT_RELEVANCE_CONFIG } from "./relevance-engine.js";
import { loadRelevanceConfig } from "./scoring-config.js";

/** The raw signals computed for a single knowledge item. */
export interface SignalSet {
	/** ISO string of the most recent activity (access, edit, or validation). Null when no data. */
	lastActivityAt: string | null;
	/** Access count within the last 30 days. Null when no access log rows exist. */
	accessCount30d: number | null;
	/** Always null in L22 — staged for L23+. */
	citationCount: null;
}

/** Factory function for the RelevanceService. */
export interface RelevanceService {
	/**
	 * Compute relevance signals for a batch of item IDs.
	 * Returns a Map keyed by item ID. Empty IDs array returns empty Map.
	 */
	computeSignals(itemIds: readonly string[], nowMs: number): Promise<Map<string, SignalSet>>;

	/**
	 * Recompute relevanceScore for the given item IDs and write to DB.
	 * Items with no signal data get relevanceScore=null.
	 */
	recomputeScores(itemIds: readonly string[]): Promise<void>;
}

/**
 * Create a RelevanceService bound to the given database.
 */
export function createRelevanceService(db: HyperIdleDb): RelevanceService {
	async function computeSignals(
		itemIds: readonly string[],
		nowMs: number,
	): Promise<Map<string, SignalSet>> {
		if (itemIds.length === 0) {
			return new Map();
		}

		const thirtyDaysAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;
		const thirtyDaysAgoIso = new Date(thirtyDaysAgoMs).toISOString();

		// --- Access log: max(accessedAt) per item, count within 30 days ---
		// Query all access log rows for these items
		const accessRows = await db
			.select({
				itemId: knowledgeAccessLog.itemId,
				accessedAt: knowledgeAccessLog.accessedAt,
			})
			.from(knowledgeAccessLog)
			.where(inArray(knowledgeAccessLog.itemId, itemIds as string[]));

		// Aggregate in JS: maxAccessedAt and count within 30d
		const maxAccessedAt = new Map<string, string>();
		const accessCount30d = new Map<string, number>();

		for (const row of accessRows) {
			// Track max accessedAt
			const prev = maxAccessedAt.get(row.itemId);
			if (prev == null || row.accessedAt > prev) {
				maxAccessedAt.set(row.itemId, row.accessedAt);
			}
			// Count within 30-day window
			if (row.accessedAt >= thirtyDaysAgoIso) {
				accessCount30d.set(row.itemId, (accessCount30d.get(row.itemId) ?? 0) + 1);
			}
		}

		// --- Edit log: max(createdAt) per item for editor='human' ---
		const editRows = await db
			.select({
				itemId: knowledgeEditLog.itemId,
				createdAt: knowledgeEditLog.createdAt,
			})
			.from(knowledgeEditLog)
			.where(
				and(
					inArray(knowledgeEditLog.itemId, itemIds as string[]),
					eq(knowledgeEditLog.editor, "human"),
				),
			);

		const maxHumanEditAt = new Map<string, string>();
		for (const row of editRows) {
			const prev = maxHumanEditAt.get(row.itemId);
			if (prev == null || row.createdAt > prev) {
				maxHumanEditAt.set(row.itemId, row.createdAt);
			}
		}

		// --- Assemble result ---
		const result = new Map<string, SignalSet>();

		for (const itemId of itemIds) {
			const lastAccess = maxAccessedAt.get(itemId) ?? null;
			const lastHumanEdit = maxHumanEditAt.get(itemId) ?? null;
			const count30d = accessCount30d.get(itemId) ?? null;

			// lastActivityAt = max of all available timestamps
			// @lore AF3 C13: TypeScript cannot narrow a mutable `let` variable in
			// the RHS of `||`. Capture into a const first; null-check the const
			// so `>` is always `string > string`. The first assignment is a simple
			// set (prev is null at that point, no comparison needed).
			let lastActivityAt: string | null = lastAccess ?? null;
			if (lastHumanEdit != null) {
				const prev = lastActivityAt;
				lastActivityAt = prev !== null && prev > lastHumanEdit ? prev : lastHumanEdit;
			}

			result.set(itemId, {
				lastActivityAt,
				accessCount30d: count30d,
				citationCount: null, // staged — L22 always null
			});
		}

		return result;
	}

	async function recomputeScores(itemIds: readonly string[]): Promise<void> {
		if (itemIds.length === 0) {
			return;
		}

		const nowMs = Date.now();
		const config = (await loadRelevanceConfig(db)) ?? DEFAULT_RELEVANCE_CONFIG;
		const signals = await computeSignals(itemIds, nowMs);

		// Fetch items to get their updatedAt for ageDays
		const rows = await db
			.select({ id: knowledgeItems.id, updatedAt: knowledgeItems.updatedAt })
			.from(knowledgeItems)
			.where(inArray(knowledgeItems.id, itemIds as string[]));

		const updatedAtById = new Map<string, string>();
		for (const row of rows) {
			updatedAtById.set(row.id, row.updatedAt);
		}

		for (const itemId of itemIds) {
			const signal = signals.get(itemId);
			const updatedAt = updatedAtById.get(itemId);

			let score: number | null = null;

			if (signal != null && updatedAt != null) {
				// Only compute ageDays when we have at least one activity signal.
				// If there's no activity data at all, ageDays alone would produce a
				// recency-only score that looks like real relevance — misleading.
				// The all-null guard in computeRelevanceScore returns null when
				// ageDays is also null, which is what we want for no-data items.
				const hasActivity = signal.lastActivityAt != null || signal.accessCount30d != null;
				const ageDays = hasActivity
					? (nowMs - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000)
					: null;

				score = computeRelevanceScore(
					{
						ageDays,
						accessCount: signal.accessCount30d,
						citationCount: signal.citationCount,
					},
					config,
				);
			}

			// @lore O2: relevanceScore moved from knowledgeItems to knowledgeAppProjection.
			// Upsert: update if projection row exists, otherwise insert a minimal row.
			const [existingFabric] = await db
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, itemId))
				.limit(1);
			if (existingFabric) {
				await db
					.update(knowledgeAppProjection)
					.set({ relevanceScore: score != null ? String(score) : null })
					.where(eq(knowledgeAppProjection.knowledgeItemId, itemId));
			} else {
				await db.insert(knowledgeAppProjection).values({
					id: `ksf-recompute-${itemId}`,
					knowledgeItemId: itemId,
					layer: "L0",
					kind: "pattern",
					relevanceScore: score != null ? String(score) : null,
				});
			}
		}
	}

	return { computeSignals, recomputeScores };
}
