import type { KnowledgeItemWithProjection } from "./knowledge-repository.js";
import { communityForRole } from "./role-community-map.js";
import type { ScoringContext, ScoringWeights } from "./scoring-config.js";
import { enforceBudget, type ScoredItem } from "./token-budget.js";

/** Recency decay window in milliseconds (30 days). */
const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Extract tags from a knowledge item's topic and JSON meta.tags fields.
 *
 * @lore O2: meta field moved to knowledgeAppProjection; accepts KnowledgeItemWithProjection.
 */
function extractItemTags(item: KnowledgeItemWithProjection): string[] {
	const tags: string[] = [];
	if (item.topic) {
		tags.push(item.topic.toLowerCase());
	}
	const meta = item.meta ?? null;
	if (meta) {
		try {
			const parsed: unknown = JSON.parse(meta);
			if (parsed && typeof parsed === "object" && "tags" in parsed) {
				const metaTags = (parsed as { tags: unknown }).tags;
				if (Array.isArray(metaTags)) {
					for (const t of metaTags) {
						if (typeof t === "string") {
							tags.push(t.toLowerCase());
						}
					}
				}
			}
		} catch {
			// Invalid JSON in meta — skip
		}
	}
	return tags;
}

/**
 * Compute tag match factor (0-1).
 * Compares taskTags against item topic and meta.tags.
 */
function computeTagMatch(item: KnowledgeItemWithProjection, taskTags: string[]): number {
	if (taskTags.length === 0) {
		return 0;
	}

	const itemTags = extractItemTags(item);
	if (itemTags.length === 0) {
		return 0;
	}

	const normalizedTaskTags = taskTags.map((t) => t.toLowerCase());
	let matches = 0;
	for (const taskTag of normalizedTaskTags) {
		for (const itemTag of itemTags) {
			if (itemTag === taskTag || itemTag.includes(taskTag) || taskTag.includes(itemTag)) {
				matches++;
				break;
			}
		}
	}

	return matches / normalizedTaskTags.length;
}

/** Compute role match factor (0 or 1). */
function computeRoleMatch(item: KnowledgeItemWithProjection, agentRole: string): number {
	const community = communityForRole(agentRole);
	const scopeId = item.scopeId ?? null;
	if (scopeId === community) {
		return 1;
	}
	// Also match if scopeId contains the role name
	if (scopeId?.includes(agentRole)) {
		return 0.5;
	}
	return 0;
}

/** Compute recency factor (0-1). Items updated within last 30 days score higher. */
function computeRecency(item: KnowledgeItemWithProjection, now: number): number {
	const updatedAt = new Date(item.updatedAt).getTime();
	const age = now - updatedAt;

	if (age <= 0) {
		return 1;
	}
	if (age >= RECENCY_WINDOW_MS) {
		return 0;
	}

	return 1 - age / RECENCY_WINDOW_MS;
}

/** Compute confidence factor (0-1). Confidence stored as string in projection table. */
function computeConfidence(item: KnowledgeItemWithProjection): number {
	// @lore O2: confidence moved to knowledgeAppProjection as text column.
	// Parse to float; clamp to [0,1].
	if (item.confidence == null) {
		return 0.5; // neutral default
	}
	const val =
		typeof item.confidence === "string" ? Number.parseFloat(item.confidence) : item.confidence;
	if (!Number.isFinite(val)) return 0.5;
	// @lore I3 (TRACK-I.md L147-149): the previous `/ 100` divisor scaled this
	// 100× too small (a confidence of 0.8 became a factor of 0.008). The
	// schema stores `confidence` as `real` already in [0,1] — no normalization
	// needed. Clamp keeps us safe against out-of-range historic data.
	return Math.max(0, Math.min(1, val));
}

/**
 * Compute layer proximity factor (0-1).
 * Items closer to task context (lower layers) score higher for task work.
 * L0 (session) and L1 (task) are closest, L4 (factory) is furthest but always included.
 *
 * @lore O2: layer field is now optional (from projection table).
 */
function computeLayerProximity(item: KnowledgeItemWithProjection): number {
	const layerScores: Record<string, number> = {
		L0: 1.0,
		L1: 0.9,
		L2: 0.7,
		L3: 0.5,
		L4: 0.3,
	};
	return layerScores[item.layer ?? ""] ?? 0;
}

/** Compute attention score factor (0-1). attentionScore stored as string in projection table. */
function computeAttentionScore(item: KnowledgeItemWithProjection): number {
	// @lore O2: attentionScore moved to knowledgeAppProjection as text column.
	if (item.attentionScore == null) {
		return 0.5; // neutral default
	}
	const val =
		typeof item.attentionScore === "string"
			? Number.parseFloat(item.attentionScore)
			: item.attentionScore;
	if (!Number.isFinite(val)) return 0.5;
	// @lore I3: same fix as `computeConfidence` — drop the `/ 100` divisor.
	return Math.max(0, Math.min(1, val));
}

/** Score a single knowledge item against the given context. Returns 0-100. */
export function scoreItem(
	item: KnowledgeItemWithProjection,
	context: ScoringContext,
	weights: ScoringWeights,
	now?: number,
): number {
	const timestamp = now ?? Date.now();

	const tagMatch = computeTagMatch(item, context.taskTags);
	const roleMatch = computeRoleMatch(item, context.agentRole);
	const recency = computeRecency(item, timestamp);
	const confidence = computeConfidence(item);
	const layerProximity = computeLayerProximity(item);
	const attentionScoreFactor = computeAttentionScore(item);

	const weighted =
		tagMatch * weights.tagMatch +
		roleMatch * weights.roleMatch +
		recency * weights.recency +
		confidence * weights.confidence +
		layerProximity * weights.layerProximity +
		attentionScoreFactor * weights.attentionScore;

	// Normalize to 0-100
	const totalWeight =
		weights.tagMatch +
		weights.roleMatch +
		weights.recency +
		weights.confidence +
		weights.layerProximity +
		weights.attentionScore;

	if (totalWeight === 0) {
		return 0;
	}

	return Math.round((weighted / totalWeight) * 100);
}

/**
 * Rank items by relevance score and enforce a token budget.
 * L4 items are always included (non-negotiable).
 * Returns the top-scoring items that fit within the budget.
 */
export function rankAndBudget(
	items: KnowledgeItemWithProjection[],
	context: ScoringContext,
	weights: ScoringWeights,
	budgetTokens: number,
	now?: number,
): KnowledgeItemWithProjection[] {
	const scored: ScoredItem[] = items.map((item) => ({
		item,
		score: scoreItem(item, context, weights, now),
	}));

	return enforceBudget(scored, budgetTokens) as KnowledgeItemWithProjection[];
}
