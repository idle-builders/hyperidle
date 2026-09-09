import {
	type HyperIdleDb,
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
 * @lore nested-knowledge-items §4: cohort identity used to be
 * (layer, scope_id, topic, kind); those three vocabularies are gone, so the
 * sibling set — (parentKind, parentId, scope_id) — replaces it. Higher
 * ceilings leave novelty high for too long; lower ceilings over-penalize
 * normal clusters of related knowledge.
 */
const COHORT_NOVELTY_CEILING = 10;

/** Repetition saturation — 5+ other scopes among the same siblings → full. */
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
interface AttentionScoringContext {
	/** Current time (ms epoch) — injected for deterministic tests. */
	readonly now: number;
	/** Items in the same (parentKind, parentId, scope_id) cohort → counts. */
	readonly cohortSizeByKey: ReadonlyMap<string, number>;
	/** Same (parentKind, parentId) across OTHER scopes → distinct-scope counts. */
	readonly crossScopeCountByKey: ReadonlyMap<string, number>;
	/** Ids with an OPEN knowledge_conflicts row. */
	readonly conflictedIds: ReadonlySet<string>;
	/** Ids edited by a human within REVIEW_RECENCY_WINDOW_MS. */
	readonly recentlyHumanEditedIds: ReadonlySet<string>;
	/** Per-id most recent human edit timestamp (ms epoch). Missing → never. */
	readonly lastHumanEditAt: ReadonlyMap<string, number>;
}

/** Build a (parentKind, parentId, scope_id) sibling-cohort key. */
function cohortKey(
	parentKind: string | null,
	parentId: string | null,
	scopeId: string | null,
): string {
	return `${parentKind ?? ""}|${parentId ?? ""}|${scopeId ?? ""}`;
}

/** Build a (parentKind, parentId) cross-scope key. */
function crossScopeKey(parentKind: string | null, parentId: string | null): string {
	return `${parentKind ?? ""}|${parentId ?? ""}`;
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
	const key = cohortKey(item.parentKind ?? null, item.parentId ?? null, item.scopeId ?? null);
	const size = ctx.cohortSizeByKey.get(key) ?? 1;
	return clamp01(1 - size / COHORT_NOVELTY_CEILING);
}

function computeRepetitionSignal(
	item: KnowledgeItemWithProjection,
	ctx: AttentionScoringContext,
): number {
	const key = crossScopeKey(item.parentKind ?? null, item.parentId ?? null);
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
function scoreAttention(
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
function scoreAttentionBatch(
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
 * Build an AttentionScoringContext for a list of items.
 *
 * @lore nested-knowledge-items §4: cohort/cross-scope counts are computed
 * from `knowledgeItems.parentKind`/`parentId`/`scopeId` directly — all three
 * now live on the kernel row, so this no longer joins the app projection
 * table at all. Unlike the old layer-filtered query, there is no cheap
 * indexed prefilter for "which parents are in play", so this scans every
 * non-archived row and filters to the needed keys in JS — correct, and
 * simpler, at the cost of the old layer-based prefilter's narrower scan.
 *
 * @lore Confidence correctness over raw SQL: Drizzle's composite-key IN
 * support varies; we filter in-app rather than risk adapter quirks.
 */
async function buildAttentionContext(
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
		neededCohortKeys.add(cohortKey(it.parentKind ?? null, it.parentId ?? null, it.scopeId ?? null));
		neededCrossScopeKeys.add(crossScopeKey(it.parentKind ?? null, it.parentId ?? null));
	}

	// 1) Open conflicts
	const conflictRows = await db
		.select({ itemId: knowledgeConflicts.itemId })
		.from(knowledgeConflicts)
		.where(and(eq(knowledgeConflicts.status, "open"), inArray(knowledgeConflicts.itemId, ids)));
	const conflictedIds = new Set<string>(conflictRows.map((r) => r.itemId));

	// 2) Cohort sizes — parent/scope now live on the kernel row directly.
	const cohortRows = await db
		.select({
			parentKind: knowledgeItems.parentKind,
			parentId: knowledgeItems.parentId,
			scopeId: knowledgeItems.scopeId,
		})
		.from(knowledgeItems)
		.where(ne(knowledgeItems.status, "archived"));

	const cohortSizeByKey = new Map<string, number>();
	const crossScopeSetsByKey = new Map<string, Set<string>>();
	for (const r of cohortRows) {
		const ck = cohortKey(r.parentKind, r.parentId, r.scopeId);
		if (neededCohortKeys.has(ck)) {
			cohortSizeByKey.set(ck, (cohortSizeByKey.get(ck) ?? 0) + 1);
		}
		const xk = crossScopeKey(r.parentKind, r.parentId);
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

export type { AttentionScoringContext };
export { buildAttentionContext, cohortKey, crossScopeKey, scoreAttention, scoreAttentionBatch };
