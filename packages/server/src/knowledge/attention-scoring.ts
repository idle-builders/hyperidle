import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import { and, eq, inArray, ne } from "drizzle-orm";
import { isTasteSensitive } from "./attention-classifier.js";
import type { KnowledgeItemWithProjection } from "./knowledge-repository.js";
import type { AttentionWeights } from "./scoring-config.js";

/**
 * Cohort ceiling — 10+ identical items → novelty saturates at 0.
 *
 * @lore G2: cohort identity is (layer, scope_id, topic, kind). Higher ceilings
 * leave novelty high for too long; lower ceilings over-penalize normal
 * clusters of related knowledge.
 */
const COHORT_NOVELTY_CEILING = 10;

/** Repetition saturation — 5+ other scopes with the same topic/kind → full. */
const REPETITION_SATURATION = 5;

/** Review recency window — human edit within 7 days → recency signal = 0. */
const REVIEW_RECENCY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Review recency saturation — 90+ days since human edit → recency signal = 1. */
const REVIEW_RECENCY_SATURATION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * @lore L22: IMPACT_BY_KIND was deleted in L22. Per-kind impact priors were
 * a heuristic that made items of different kinds non-comparable. With L22's
 * three-signal relevance model (recency/frequency/citation), impact contributes
 * 0 by inlining the constant below. The impact weight in AttentionWeights still
 * exists for future use (e.g. a human-audited citation column in L23+), but
 * the kind-based lookup is gone. Do not reinstate it — it was a security risk:
 * a low-trust agent could influence attention scores by crafting item kinds.
 */

/** Public context for scoring. Built once per batch and reused across items. */
export interface AttentionScoringContext {
	/** Current time (ms epoch) — injected for deterministic tests. */
	readonly now: number;
	/** Items in the same (layer, scope_id, topic, kind) cohort → counts. */
	readonly cohortSizeByKey: ReadonlyMap<string, number>;
	/** Same (layer, topic, kind) across OTHER scopes → distinct-scope counts. */
	readonly crossScopeCountByKey: ReadonlyMap<string, number>;
	/** Ids with an OPEN knowledge_conflicts row. */
	readonly conflictedIds: ReadonlySet<string>;
	/** Ids edited by a human within REVIEW_RECENCY_WINDOW_MS. */
	readonly recentlyHumanEditedIds: ReadonlySet<string>;
	/** Per-id most recent human edit timestamp (ms epoch). Missing → never. */
	readonly lastHumanEditAt: ReadonlyMap<string, number>;
}

/** Build a (layer, scope_id, topic, kind) cohort key. */
export function cohortKey(
	layer: string | null,
	scopeId: string | null,
	topic: string | null,
	kind: string | null,
): string {
	return `${layer ?? ""}|${scopeId ?? ""}|${topic ?? ""}|${kind ?? ""}`;
}

/** Build a (layer, topic, kind) cross-scope key. */
export function crossScopeKey(
	layer: string | null,
	topic: string | null,
	kind: string | null,
): string {
	return `${layer ?? ""}|${topic ?? ""}|${kind ?? ""}`;
}

function clamp01(x: number): number {
	if (x < 0) return 0;
	if (x > 1) return 1;
	return x;
}

/** Round to 6 decimals for cross-platform determinism (AC5). */
function round6(x: number): number {
	return Math.round(x * 1_000_000) / 1_000_000;
}

function computeNovelty(item: KnowledgeItemWithProjection, ctx: AttentionScoringContext): number {
	const key = cohortKey(item.layer ?? null, item.scopeId ?? null, item.topic, item.kind ?? null);
	const size = ctx.cohortSizeByKey.get(key) ?? 1;
	return clamp01(1 - size / COHORT_NOVELTY_CEILING);
}

function computeRepetitionSignal(
	item: KnowledgeItemWithProjection,
	ctx: AttentionScoringContext,
): number {
	const key = crossScopeKey(item.layer ?? null, item.topic, item.kind ?? null);
	const nScopes = ctx.crossScopeCountByKey.get(key) ?? 1;
	// (nScopes - 1): a single-scope item yields 0; 5+ scopes saturates.
	return clamp01((nScopes - 1) / REPETITION_SATURATION);
}

function computeConfidenceValue(item: KnowledgeItemWithProjection): number {
	// @lore O2: confidence stored as string in knowledgeAppProjection; parse to number.
	if (item.confidence == null) return 0.5;
	const val =
		typeof item.confidence === "string" ? Number.parseFloat(item.confidence) : item.confidence;
	return clamp01(Number.isFinite(val) ? val : 0.5);
}

function computeRecency(item: KnowledgeItemWithProjection, ctx: AttentionScoringContext): number {
	// Recency = "how STALE is this in terms of human attention".
	// If recently human-edited → 0 (low need to look again).
	// Otherwise grow with time since last edit, saturating at 90 days.
	if (ctx.recentlyHumanEditedIds.has(item.id)) {
		return 0;
	}
	const last = ctx.lastHumanEditAt.get(item.id);
	if (last == null) {
		// Never edited by human → treat as maximally stale.
		return 1;
	}
	const age = Math.max(0, ctx.now - last);
	return clamp01(age / REVIEW_RECENCY_SATURATION_MS);
}

function computeTasteSensitivity(item: KnowledgeItemWithProjection): number {
	return isTasteSensitive(item) ? 1 : 0;
}

/**
 * Score a single knowledge item. Pure. Returns a value in [0, 1] rounded to
 * six decimals.
 *
 * @lore O2: accepts KnowledgeItemWithProjection since projection fields (layer, kind,
 * scopeId, attentionScore, confidence) moved to the extension table.
 */
export function scoreAttention(
	item: KnowledgeItemWithProjection,
	context: AttentionScoringContext,
	weights: AttentionWeights,
): number {
	const novelty = computeNovelty(item, context);
	// impact: always 0 after L22 IMPACT_BY_KIND deletion (see @lore above)
	const impact = 0;
	const conflict = context.conflictedIds.has(item.id) ? 1 : 0;
	const repetition = computeRepetitionSignal(item, context);
	const confidence = computeConfidenceValue(item);
	const taste = computeTasteSensitivity(item);
	const recency = computeRecency(item, context);
	// usage: always 0 until a trustworthy reference-count source exists (L23+)
	const usage = 0;

	const weighted =
		novelty * weights.novelty +
		impact * weights.impact +
		conflict * weights.conflict +
		(1 - repetition) * weights.repetition +
		(1 - confidence) * weights.confidence +
		taste * weights.tasteSensitivity +
		recency * weights.recency +
		usage * weights.usage;

	const totalWeight =
		weights.novelty +
		weights.impact +
		weights.conflict +
		weights.repetition +
		weights.confidence +
		weights.tasteSensitivity +
		weights.recency +
		weights.usage;

	if (totalWeight === 0) return 0;
	return round6(clamp01(weighted / totalWeight));
}

/** Score a batch of items sharing a context. Output order matches input order. */
export function scoreAttentionBatch(
	items: readonly KnowledgeItemWithProjection[],
	context: AttentionScoringContext,
	weights: AttentionWeights,
): ReadonlyArray<{ id: string; score: number; prior: number | null }> {
	const out: Array<{ id: string; score: number; prior: number | null }> = [];
	for (const item of items) {
		// @lore O2: attentionScore stored as string in the projection table; parse to number.
		const priorRaw = item.attentionScore;
		const prior =
			priorRaw == null
				? null
				: typeof priorRaw === "string"
					? Number.parseFloat(priorRaw)
					: priorRaw;
		out.push({
			id: item.id,
			score: scoreAttention(item, context, weights),
			prior: prior != null && Number.isFinite(prior) ? prior : null,
		});
	}
	return out;
}

/**
 * Build an AttentionScoringContext for a list of items. Executes a small
 * fixed number of aggregate queries — the cost is O(distinct cohorts), not
 * O(items) — which is what makes the 1000-item AC6 budget achievable.
 *
 * @lore O2: cohort/cross-scope counts are now computed by JOINing
 * knowledge_items with the app projection extension table. The items passed in must
 * be KnowledgeItemWithProjection (projection fields are optional — items without
 * a projection row contribute null layer/kind/scopeId to the cohort keys).
 *
 * @lore Confidence correctness over raw SQL: Drizzle's composite-key IN
 * support varies; we filter in-app rather than risk adapter quirks. The
 * outer GROUP BY runs server-side; the subset-of-batch filter happens in JS.
 */
export async function buildAttentionContext(
	db: HyperIdleDb,
	items: readonly KnowledgeItemWithProjection[],
	now?: number,
): Promise<AttentionScoringContext> {
	const nowMs = now ?? Date.now();

	if (items.length === 0) {
		return {
			now: nowMs,
			cohortSizeByKey: new Map(),
			crossScopeCountByKey: new Map(),
			conflictedIds: new Set(),
			recentlyHumanEditedIds: new Set(),
			lastHumanEditAt: new Map(),
		};
	}

	const ids = items.map((i) => i.id);

	// Distinct cohort keys we need to count.
	const neededCohortKeys = new Set<string>();
	const neededCrossScopeKeys = new Set<string>();
	for (const it of items) {
		neededCohortKeys.add(
			cohortKey(it.layer ?? null, it.scopeId ?? null, it.topic, it.kind ?? null),
		);
		neededCrossScopeKeys.add(crossScopeKey(it.layer ?? null, it.topic, it.kind ?? null));
	}

	// 1) Open conflicts
	const conflictRows = await db
		.select({ itemId: knowledgeConflicts.itemId })
		.from(knowledgeConflicts)
		.where(and(eq(knowledgeConflicts.status, "open"), inArray(knowledgeConflicts.itemId, ids)));
	const conflictedIds = new Set<string>(conflictRows.map((r) => r.itemId));

	// 2) Cohort sizes — JOIN with app projection to get layer/kind/scopeId.
	//    @lore O2: projection fields (layer, kind, scopeId) moved to
	//    knowledgeAppProjection. We LEFT JOIN so canonical-only items (no projection
	//    row) still appear in the result with null projection fields.
	const distinctLayers = new Set<string>(
		items.map((i) => i.layer).filter((l): l is string => l != null),
	);

	// Only query if we have layers to filter on; otherwise cohort counts are 0.
	const cohortRows =
		distinctLayers.size > 0
			? await db
					.select({
						layer: knowledgeAppProjection.layer,
						scopeId: knowledgeAppProjection.scopeId,
						topic: knowledgeItems.topic,
						kind: knowledgeAppProjection.kind,
					})
					.from(knowledgeItems)
					.innerJoin(
						knowledgeAppProjection,
						eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
					)
					.where(
						and(
							ne(knowledgeItems.status, "archived"),
							inArray(knowledgeAppProjection.layer, Array.from(distinctLayers)),
						),
					)
			: [];

	const cohortSizeByKey = new Map<string, number>();
	const crossScopeSetsByKey = new Map<string, Set<string>>();
	for (const r of cohortRows) {
		const ck = cohortKey(r.layer, r.scopeId, r.topic, r.kind);
		if (neededCohortKeys.has(ck)) {
			cohortSizeByKey.set(ck, (cohortSizeByKey.get(ck) ?? 0) + 1);
		}
		const xk = crossScopeKey(r.layer, r.topic, r.kind);
		if (neededCrossScopeKeys.has(xk) && r.scopeId != null) {
			let s = crossScopeSetsByKey.get(xk);
			if (!s) {
				s = new Set();
				crossScopeSetsByKey.set(xk, s);
			}
			s.add(r.scopeId);
		}
	}

	const crossScopeCountByKey = new Map<string, number>();
	for (const [k, s] of crossScopeSetsByKey.entries()) {
		crossScopeCountByKey.set(k, s.size);
	}

	// 3) Human edit log — per item, most recent timestamp.
	const editRows = await db
		.select({
			itemId: knowledgeEditLog.itemId,
			createdAt: knowledgeEditLog.createdAt,
		})
		.from(knowledgeEditLog)
		.where(and(eq(knowledgeEditLog.editor, "human"), inArray(knowledgeEditLog.itemId, ids)));

	const lastHumanEditAt = new Map<string, number>();
	for (const r of editRows) {
		const t = new Date(r.createdAt).getTime();
		const existing = lastHumanEditAt.get(r.itemId);
		if (existing == null || t > existing) {
			lastHumanEditAt.set(r.itemId, t);
		}
	}

	const recentlyHumanEditedIds = new Set<string>();
	for (const [id, t] of lastHumanEditAt.entries()) {
		if (nowMs - t <= REVIEW_RECENCY_WINDOW_MS) {
			recentlyHumanEditedIds.add(id);
		}
	}

	return {
		now: nowMs,
		cohortSizeByKey,
		crossScopeCountByKey,
		conflictedIds,
		recentlyHumanEditedIds,
		lastHumanEditAt,
	};
}
