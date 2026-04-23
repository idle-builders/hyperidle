import { randomUUID } from "node:crypto";
import {
	type HyperIdleDb,
	items,
	type KnowledgeItem,
	knowledgeConflicts,
	knowledgeItems,
} from "@hyperidle/db";
import {
	ATTENTION_THRESHOLD,
	type AttentionWeights,
	buildAttentionContext,
	loadAttentionWeights,
	scoreAttentionBatch,
} from "@hyperidle/fabric";
import type { EventBus, KnowledgeUpdatedEvent } from "@hyperidle/shared";
import { and, eq, inArray, like } from "drizzle-orm";
import {
	attentionReviewReasoningMarker,
	createReviewItemForKnowledge,
} from "./review-item-factory.js";

/**
 * Hard cap on `recomputeScope` batch size.
 *
 * @lore G2 DoS prevention: an unbounded `recomputeScope({})` would load every
 * knowledge item in the database into memory, build the full aggregate
 * context, and push `knowledge_updated` for each — an easy self-inflicted
 * outage from a stray call. We cap and require at least one filter so the
 * caller has to be intentional about the size. 5000 is well above the
 * largest legitimate scope (a layer × product cross-section) observed in
 * sizing exercises.
 */
export const MAX_RECOMPUTE_BATCH = 5000;

/** Per-item recompute result. */
export interface AttentionRecomputeResult {
	readonly knowledgeItemId: string;
	readonly prior: number | null;
	readonly current: number;
	readonly crossedThreshold: boolean;
	/** True when the threshold crossed and a review item was newly created. */
	readonly reviewItemCreated: boolean;
}

/** Summary of a scope-wide recompute. */
export interface AttentionRecomputeSummary {
	readonly updated: number;
	readonly crossed: number;
	readonly results: readonly AttentionRecomputeResult[];
}

export interface AttentionServiceFilter {
	readonly layer?: string;
	readonly scopeId?: string;
	readonly status?: string;
	readonly kind?: string;
	readonly topic?: string;
	readonly ids?: readonly string[];
}

/**
 * Result of a rejected `recomputeScope` call. We return a typed error shape
 * rather than throwing so callers (HTTP handlers, skill tools) can route on
 * `code` without a try/catch.
 */
export type AttentionRecomputeScopeError =
	| { readonly code: "FILTER_REQUIRED"; readonly message: string }
	| { readonly code: "BATCH_TOO_LARGE"; readonly message: string; readonly size: number };

export type AttentionRecomputeScopeResult =
	| { readonly ok: true; readonly summary: AttentionRecomputeSummary }
	| { readonly ok: false; readonly error: AttentionRecomputeScopeError };

export interface AttentionService {
	recomputeOne(knowledgeItemId: string): Promise<AttentionRecomputeResult>;
	recomputeMany(
		knowledgeItemIds: readonly string[],
	): Promise<ReadonlyArray<AttentionRecomputeResult>>;
	recomputeScope(filter: AttentionServiceFilter): Promise<AttentionRecomputeScopeResult>;
}

export interface AttentionServiceDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/** Test seam: alternate weights loader. */
	readonly loadWeights?: (db: HyperIdleDb) => AttentionWeights;
	/** Test seam: Date.now() injection for determinism tests. */
	readonly now?: () => number;
}

/**
 * Build the attention service. Callers (G4 routines, facilitator tools, the
 * admin API) use `recomputeOne`/`recomputeMany`/`recomputeScope` to refresh
 * `knowledge_items.attentionScore` and surface threshold crossings into the
 * human interface.
 *
 * @lore G2 event emission: upward crossings of the 0.7 threshold create an
 * `items` row with kind=knowledge and verb=review, then emit `item_created`.
 * Recompute also emits `knowledge_updated` with action=attention_recomputed
 * so the Triage view stays fresh. Neither the repository.update path nor a
 * new event type are introduced — see G2-plan §3.6.
 *
 * @lore G2 idempotency: before creating a review item, we LIKE-search the
 * existing `items.reasoning` for an attention-engine marker referencing this
 * knowledge item. A score that oscillates above/below 0.7 therefore only
 * ever produces ONE open review until the human closes it.
 *
 * @lore G2 concurrency: the per-item read/score/write/create-review critical
 * section is wrapped in a SQLite transaction so two racing recomputations
 * can't both observe `prior < 0.7` and both emit `item_created`.
 */
export function buildAttentionService(deps: AttentionServiceDeps): AttentionService {
	const { db, eventBus } = deps;
	const loadWeights = deps.loadWeights ?? loadAttentionWeights;
	const now = deps.now ?? ((): number => Date.now());

	// biome-ignore lint/suspicious/useAwait: callers expect Promise return for consistency with async service layer
	async function recomputeMany(
		ids: readonly string[],
	): Promise<ReadonlyArray<AttentionRecomputeResult>> {
		if (ids.length === 0) return [];

		const loadedItems = db
			.select()
			.from(knowledgeItems)
			.where(inArray(knowledgeItems.id, Array.from(ids)))
			.all();

		if (loadedItems.length === 0) return [];

		const nowMs = now();
		const weights = loadWeights(db);
		const context = buildAttentionContext(db, loadedItems, nowMs);
		const scored = scoreAttentionBatch(loadedItems, context, weights);

		const results: AttentionRecomputeResult[] = [];

		for (let i = 0; i < loadedItems.length; i++) {
			const item = loadedItems[i];
			const row = scored[i];
			if (!(item && row)) continue;

			const result = applyRecomputeForItem(item, row.score, nowMs);
			results.push(result);
		}

		return results;
	}

	/**
	 * Transactional per-item critical section. Re-reads the prior score INSIDE
	 * the transaction so a concurrent recompute can't observe the stale value.
	 * Creating the review item + emitting `item_created` happens inside the
	 * same transaction so two callers both seeing `prior < 0.7` serialize and
	 * only one creates the review.
	 */
	function applyRecomputeForItem(
		item: KnowledgeItem,
		currentScore: number,
		nowMs: number,
	): AttentionRecomputeResult {
		const isoNow = new Date(nowMs).toISOString();

		const txResult = db.transaction(
			(
				tx,
			): {
				prior: number | null;
				crossed: boolean;
				reviewItemCreated: boolean;
			} => {
				const refreshed = tx
					.select({ attentionScore: knowledgeItems.attentionScore })
					.from(knowledgeItems)
					.where(eq(knowledgeItems.id, item.id))
					.get();
				const prior = refreshed?.attentionScore ?? null;

				tx.update(knowledgeItems)
					.set({ attentionScore: currentScore, updatedAt: isoNow })
					.where(eq(knowledgeItems.id, item.id))
					.run();

				// @lore G2 threshold interval: the crossing predicate is half-open
				// on prior (strictly less than 0.7) and closed on current
				// (greater-or-equal to 0.7). prior=0.7/current=0.7 does NOT cross;
				// prior=0.6999/current=0.7 does.
				const crossed = (prior ?? 0) < ATTENTION_THRESHOLD && currentScore >= ATTENTION_THRESHOLD;

				let reviewItemCreated = false;
				if (crossed) {
					const marker = attentionReviewReasoningMarker(item.id);
					const existing = tx
						.select({ id: items.id })
						.from(items)
						.where(like(items.reasoning, `%${marker}%`))
						.get();
					if (!existing) {
						const hasConflict = hasOpenConflict(tx, item.id);
						const riskTier = hasConflict ? "medium" : "low";
						const bodySummary = item.body.length > 500 ? `${item.body.slice(0, 500)}…` : item.body;

						createReviewItemForKnowledge(tx, eventBus, {
							knowledgeItemId: item.id,
							layer: item.layer,
							title: `Knowledge item needs attention: ${item.title}`,
							body: bodySummary,
							riskTier,
							attentionScore: Math.round(currentScore * 100),
							reasoning: {
								threshold: ATTENTION_THRESHOLD,
								score: currentScore,
							},
							nowMs,
						});
						reviewItemCreated = true;
					}
				}

				return { prior, crossed, reviewItemCreated };
			},
		);

		const updatedEvent: KnowledgeUpdatedEvent = {
			type: "knowledge_updated",
			streamId: randomUUID(),
			itemId: item.id,
			action: "attention_recomputed",
			timestamp: nowMs,
		};
		eventBus.emit(updatedEvent);

		return {
			knowledgeItemId: item.id,
			prior: txResult.prior,
			current: currentScore,
			crossedThreshold: txResult.crossed,
			reviewItemCreated: txResult.reviewItemCreated,
		};
	}

	async function recomputeOne(id: string): Promise<AttentionRecomputeResult> {
		const results = await recomputeMany([id]);
		const r = results[0];
		if (!r) {
			throw new Error(`Attention recompute: knowledge item not found: ${id}`);
		}
		return r;
	}

	async function recomputeScope(
		filter: AttentionServiceFilter,
	): Promise<AttentionRecomputeScopeResult> {
		const conditions = [];
		if (filter.layer) conditions.push(eq(knowledgeItems.layer, filter.layer));
		if (filter.scopeId) conditions.push(eq(knowledgeItems.scopeId, filter.scopeId));
		if (filter.status) conditions.push(eq(knowledgeItems.status, filter.status));
		if (filter.kind) conditions.push(eq(knowledgeItems.kind, filter.kind));
		if (filter.topic) conditions.push(eq(knowledgeItems.topic, filter.topic));
		if (filter.ids && filter.ids.length > 0) {
			conditions.push(inArray(knowledgeItems.id, Array.from(filter.ids)));
		}

		if (conditions.length === 0) {
			return {
				ok: false,
				error: {
					code: "FILTER_REQUIRED",
					message:
						"recomputeScope requires at least one of: layer, scopeId, status, kind, topic, ids",
				},
			};
		}

		const rows = db
			.select({ id: knowledgeItems.id })
			.from(knowledgeItems)
			.where(and(...conditions))
			.all();

		if (rows.length > MAX_RECOMPUTE_BATCH) {
			return {
				ok: false,
				error: {
					code: "BATCH_TOO_LARGE",
					message: `recomputeScope selected ${rows.length} items, exceeding the hard cap of ${MAX_RECOMPUTE_BATCH}`,
					size: rows.length,
				},
			};
		}

		const ids = rows.map((r) => r.id);
		const results = await recomputeMany(ids);

		return {
			ok: true,
			summary: {
				updated: results.length,
				crossed: results.filter((r) => r.crossedThreshold).length,
				results,
			},
		};
	}

	return { recomputeOne, recomputeMany, recomputeScope };
}

function hasOpenConflict(db: HyperIdleDb, knowledgeItemId: string): boolean {
	const row = db
		.select({ id: knowledgeConflicts.id })
		.from(knowledgeConflicts)
		.where(
			and(eq(knowledgeConflicts.itemId, knowledgeItemId), eq(knowledgeConflicts.status, "open")),
		)
		.get();
	return Boolean(row);
}
