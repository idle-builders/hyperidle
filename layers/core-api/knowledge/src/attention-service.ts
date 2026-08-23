import { randomUUID } from "node:crypto";
import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeConflicts,
	knowledgeItems,
	type NewItem,
	type NewThread,
} from "@hyperidle/db";
import type { KnowledgeUpdatedEvent } from "@hyperidle/event-bus";
import type { EventBus } from "@hyperidle/event-bus";
import { and, eq, inArray } from "drizzle-orm";
import { buildAttentionContext, scoreAttentionBatch } from "./attention-scoring.js";
import type { KnowledgeItemWithProjection } from "./knowledge-repository.js";
import { attentionReviewReasoningMarker, createReviewItem } from "./review-item-factory.js";
import {
	ATTENTION_THRESHOLD,
	type AttentionWeights,
	loadAttentionWeights,
} from "./scoring-config.js";

/**
 * Executor type accepted by the injected ports — either the top-level
 * `HyperIdleDb` or a `tx` handle inside a `db.transaction(async (tx) => …)`
 * callback. Structurally identical to `work-service.ts`'s `WriteExecutor`.
 *
 * @lore AU44 batch 4: `review-item-factory.ts` moved into this package, so
 * the `KnowledgeReviewWriter` DI port is gone. `attentionReviewReasoningMarker`
 * and `createReviewItem` are now local imports; the `review` dep on
 * `AttentionServiceDeps` is replaced by `conversation` (for `insertThread`)
 * and an expanded `work` (adds `createItem`). Both remain Mechanism C ports
 * because knowledge cannot import `@hyperidle/conversation` or `@hyperidle/work`.
 */
type AttentionWriteExecutor =
	| HyperIdleDb
	| Parameters<Parameters<HyperIdleDb["transaction"]>[0]>[0];

/** Port for the `work` Service (Mechanism C). */
interface WorkPort {
	findItemByReasoningMarker(
		exec: AttentionWriteExecutor,
		marker: string,
	): Promise<{ id: string } | undefined>;
	createItem(exec: AttentionWriteExecutor, values: NewItem): Promise<void>;
}

/** Port for the `conversation` Service (Mechanism C). */
interface ConversationPort {
	insertThread(exec: AttentionWriteExecutor, values: NewThread): Promise<void>;
}

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
const ATTENTION_BATCH_LIMIT = 5000;

/** Per-item recompute result. */
interface AttentionRecomputeResult {
	readonly knowledgeItemId: string;
	readonly prior: number | null;
	readonly current: number;
	readonly crossedThreshold: boolean;
	/** True when the threshold crossed and a review item was newly created. */
	readonly reviewItemCreated: boolean;
}

/** Summary of a scope-wide recompute. */
interface AttentionRecomputeSummary {
	readonly updated: number;
	readonly crossed: number;
	readonly results: readonly AttentionRecomputeResult[];
}

interface AttentionServiceFilter {
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
type AttentionRecomputeScopeError =
	| { readonly code: "FILTER_REQUIRED"; readonly message: string }
	| { readonly code: "BATCH_TOO_LARGE"; readonly message: string; readonly size: number };

type AttentionRecomputeScopeResult =
	| { readonly ok: true; readonly summary: AttentionRecomputeSummary }
	| { readonly ok: false; readonly error: AttentionRecomputeScopeError };

interface AttentionService {
	recomputeOne(knowledgeItemId: string): Promise<AttentionRecomputeResult>;
	recomputeMany(
		knowledgeItemIds: readonly string[],
	): Promise<ReadonlyArray<AttentionRecomputeResult>>;
	recomputeScope(filter: AttentionServiceFilter): Promise<AttentionRecomputeScopeResult>;
}

interface AttentionServiceDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/** Injected `work` Service port (Mechanism C). */
	readonly work: WorkPort;
	/** Injected `conversation` Service port (Mechanism C — for review item thread creation). */
	readonly conversation: ConversationPort;
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
function buildAttentionService(deps: AttentionServiceDeps): AttentionService {
	const { db, eventBus, work } = deps;
	const loadWeights = deps.loadWeights ?? loadAttentionWeights;
	const now = deps.now ?? ((): number => Date.now());
	// Build the review item factory once at service-creation time.
	// `attentionReviewReasoningMarker` is a local import; no DI port needed.
	const createReviewItemFn = createReviewItem({
		conversation: deps.conversation,
		work: deps.work,
	});

	async function recomputeMany(
		ids: readonly string[],
	): Promise<ReadonlyArray<AttentionRecomputeResult>> {
		if (ids.length === 0) return [];

		// @lore O2: JOIN with knowledgeAppProjection to get projection fields
		// (layer, scopeId, kind, attentionScore, confidence) needed for scoring.
		const rows = await db
			.select({ item: knowledgeItems, fabric: knowledgeAppProjection })
			.from(knowledgeItems)
			.leftJoin(
				knowledgeAppProjection,
				eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
			)
			.where(inArray(knowledgeItems.id, Array.from(ids)));

		if (rows.length === 0) return [];

		// Merge canonical item row + projection row into KnowledgeItemWithProjection.
		const loadedItems: KnowledgeItemWithProjection[] = rows.map(({ item, fabric }) => ({
			...item,
			layer: fabric?.layer ?? null,
			scopeId: fabric?.scopeId ?? null,
			kind: fabric?.kind ?? null,
			attentionScore: fabric?.attentionScore ?? null,
			confidence: fabric?.confidence ?? null,
			meta: fabric?.meta ?? null,
		}));

		const nowMs = now();
		const weights = await loadWeights(db);
		const context = await buildAttentionContext(db, loadedItems, nowMs);
		const scored = scoreAttentionBatch(loadedItems, context, weights);

		const results: AttentionRecomputeResult[] = [];

		for (let i = 0; i < loadedItems.length; i++) {
			const item = loadedItems[i];
			const row = scored[i];
			if (!(item && row)) continue;

			const result = await applyRecomputeForItem(item, row.score, nowMs);
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
	 *
	 * @lore O2: attentionScore is stored in knowledgeAppProjection (not on
	 * the kernel knowledgeItems table). Reading the prior score and writing the
	 * new score both touch the extension table. The kernel table is not updated
	 * by attention recomputes — only content edits bump knowledgeItems.updatedAt.
	 */
	async function applyRecomputeForItem(
		item: KnowledgeItemWithProjection,
		currentScore: number,
		nowMs: number,
	): Promise<AttentionRecomputeResult> {
		const txResult = await db.transaction(
			async (
				tx,
			): Promise<{
				prior: number | null;
				crossed: boolean;
				reviewItemCreated: boolean;
			}> => {
				// @lore O2: read prior attentionScore from the extension table.
				// parseFloat safely converts the stored string to a number.
				const [fabricRow] = await tx
					.select({ attentionScore: knowledgeAppProjection.attentionScore })
					.from(knowledgeAppProjection)
					.where(eq(knowledgeAppProjection.knowledgeItemId, item.id))
					.limit(1);
				const priorStr = fabricRow?.attentionScore ?? null;
				const prior = priorStr != null ? Number.parseFloat(priorStr) : null;

				// @lore O2: write attentionScore to the extension table.
				// Upsert: update if row exists, insert if not.
				const [existingFabric] = await tx
					.select({ id: knowledgeAppProjection.id })
					.from(knowledgeAppProjection)
					.where(eq(knowledgeAppProjection.knowledgeItemId, item.id))
					.limit(1);
				if (existingFabric) {
					await tx
						.update(knowledgeAppProjection)
						.set({ attentionScore: String(currentScore) })
						.where(eq(knowledgeAppProjection.knowledgeItemId, item.id));
				} else {
					await tx.insert(knowledgeAppProjection).values({
						id: randomUUID(),
						knowledgeItemId: item.id,
						attentionScore: String(currentScore),
					});
				}

				// @lore G2 threshold interval: the crossing predicate is half-open
				// on prior (strictly less than 0.7) and closed on current
				// (greater-or-equal to 0.7). prior=0.7/current=0.7 does NOT cross;
				// prior=0.6999/current=0.7 does.
				const crossed = (prior ?? 0) < ATTENTION_THRESHOLD && currentScore >= ATTENTION_THRESHOLD;

				let reviewItemCreated = false;
				if (crossed) {
					const marker = attentionReviewReasoningMarker(item.id);
					// @lore AU13 addendum §A6: MUST stay `tx` (not pooled `db`) — the
					// idempotency probe runs inside the per-item critical-section tx.
					const existing = await work.findItemByReasoningMarker(tx, marker);
					if (!existing) {
						const hasConflict = await hasOpenConflict(tx, item.id);
						const riskTier = hasConflict ? "medium" : "low";
						const bodySummary = item.body.length > 500 ? `${item.body.slice(0, 500)}…` : item.body;

						// @lore AU44 batch 4: factory moved to this package; calls via
						// local `createReviewItemFn` instead of the former DI port.
						await createReviewItemFn(tx as HyperIdleDb, eventBus, {
							knowledgeItemId: item.id,
							// @lore O2: layer comes from the projection item (may be null)
							layer: item.layer ?? null,
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
		// @lore O2: projection fields (layer, scopeId, kind) are in knowledgeAppProjection.
		// Canonical fields (status, topic, ids) are on knowledgeItems.
		// When projection filters are present we JOIN; otherwise we query canonical rows only.
		const hasProjectionFilter = !!(filter.layer || filter.scopeId || filter.kind);
		const hasAnyFilter =
			hasProjectionFilter ||
			!!(filter.status || filter.topic || (filter.ids && filter.ids.length > 0));

		if (!hasAnyFilter) {
			return {
				ok: false,
				error: {
					code: "FILTER_REQUIRED",
					message:
						"recomputeScope requires at least one of: layer, scopeId, status, kind, topic, ids",
				},
			};
		}

		const kernelConditions = [];
		const projectionConditions = [];

		if (filter.status) kernelConditions.push(eq(knowledgeItems.status, filter.status));
		if (filter.topic) kernelConditions.push(eq(knowledgeItems.topic, filter.topic));
		if (filter.ids && filter.ids.length > 0) {
			kernelConditions.push(inArray(knowledgeItems.id, Array.from(filter.ids)));
		}
		if (filter.layer) projectionConditions.push(eq(knowledgeAppProjection.layer, filter.layer));
		if (filter.scopeId) {
			projectionConditions.push(eq(knowledgeAppProjection.scopeId, filter.scopeId));
		}
		if (filter.kind) projectionConditions.push(eq(knowledgeAppProjection.kind, filter.kind));

		let rows: Array<{ id: string }>;

		if (hasProjectionFilter) {
			// Need JOIN when filtering by projection fields.
			const allConditions = [...kernelConditions, ...projectionConditions];
			rows = await db
				.select({ id: knowledgeItems.id })
				.from(knowledgeItems)
				.innerJoin(
					knowledgeAppProjection,
					eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
				)
				.where(and(...allConditions));
		} else {
			rows = await db
				.select({ id: knowledgeItems.id })
				.from(knowledgeItems)
				.where(and(...kernelConditions));
		}

		if (rows.length > ATTENTION_BATCH_LIMIT) {
			return {
				ok: false,
				error: {
					code: "BATCH_TOO_LARGE",
					message: `recomputeScope selected ${rows.length} items, exceeding the hard cap of ${ATTENTION_BATCH_LIMIT}`,
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

export function recomputeAttention(
	deps: AttentionServiceDeps,
	spec:
		| { readonly itemId: string }
		| { readonly itemIds: readonly string[] }
		| { readonly filter: AttentionServiceFilter },
): Promise<
	AttentionRecomputeResult | ReadonlyArray<AttentionRecomputeResult> | AttentionRecomputeScopeResult
> {
	const service = buildAttentionService(deps);
	if ("itemId" in spec) return service.recomputeOne(spec.itemId);
	if ("itemIds" in spec) return service.recomputeMany(spec.itemIds);
	return service.recomputeScope(spec.filter);
}

async function hasOpenConflict(db: HyperIdleDb, knowledgeItemId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: knowledgeConflicts.id })
		.from(knowledgeConflicts)
		.where(
			and(eq(knowledgeConflicts.itemId, knowledgeItemId), eq(knowledgeConflicts.status, "open")),
		)
		.limit(1);
	return Boolean(row);
}
