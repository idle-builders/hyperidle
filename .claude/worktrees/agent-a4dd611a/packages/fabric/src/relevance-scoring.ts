import type { KnowledgeItem } from "@hyperidle/db";
import type { ScoringContext, ScoringWeights } from "./scoring-config.js";
import { type ScoredItem, enforceBudget } from "./token-budget.js";

/** Map agent roles to L3 practice community scope IDs. */
const ROLE_TO_COMMUNITY: Record<string, string> = {
	builder: "building",
	growth: "growth",
	product_manager: "product",
	practice_facilitator: "ops",
	chief_of_staff: "ops",
	brand_voice: "growth",
};

/** Recency decay window in milliseconds (30 days). */
const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Compute tag match factor (0-1).
 * Compares taskTags against item topic and meta.tags.
 */
function computeTagMatch(item: KnowledgeItem, taskTags: string[]): number {
	if (taskTags.length === 0) {
		return 0;
	}

	const itemTags: string[] = [];

	// Add topic as a tag
	if (item.topic) {
		itemTags.push(item.topic.toLowerCase());
	}

	// Parse meta.tags if present
	if (item.meta) {
		try {
			const meta: unknown = JSON.parse(item.meta);
			if (meta && typeof meta === "object" && "tags" in meta) {
				const metaTags = (meta as { tags: unknown }).tags;
				if (Array.isArray(metaTags)) {
					for (const t of metaTags) {
						if (typeof t === "string") {
							itemTags.push(t.toLowerCase());
						}
					}
				}
			}
		} catch {
			// Invalid JSON in meta — skip
		}
	}

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
function computeRoleMatch(item: KnowledgeItem, agentRole: string): number {
	const community = ROLE_TO_COMMUNITY[agentRole];
	if (!community) {
		return 0;
	}
	if (item.scopeId === community) {
		return 1;
	}
	// Also match if scopeId contains the role name
	if (item.scopeId?.includes(agentRole)) {
		return 0.5;
	}
	return 0;
}

/** Compute recency factor (0-1). Items updated within last 30 days score higher. */
function computeRecency(item: KnowledgeItem, now: number): number {
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

/** Compute confidence factor (0-1). Normalizes from 0-100 scale. */
function computeConfidence(item: KnowledgeItem): number {
	if (item.confidence == null) {
		return 0.5; // neutral default
	}
	return Math.max(0, Math.min(1, item.confidence / 100));
}

/**
 * Compute layer proximity factor (0-1).
 * Items closer to task context (lower layers) score higher for task work.
 * L0 (session) and L1 (task) are closest, L4 (factory) is furthest but always included.
 */
function computeLayerProximity(item: KnowledgeItem): number {
	const layerScores: Record<string, number> = {
		L0: 1.0,
		L1: 0.9,
		L2: 0.7,
		L3: 0.5,
		L4: 0.3,
	};
	return layerScores[item.layer] ?? 0;
}

/** Compute attention score factor (0-1). */
function computeAttentionScore(item: KnowledgeItem): number {
	if (item.attentionScore == null) {
		return 0.5; // neutral default
	}
	return Math.max(0, Math.min(1, item.attentionScore / 100));
}

/** Score a single knowledge item against the given context. Returns 0-100. */
export function scoreItem(
	item: KnowledgeItem,
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
	items: KnowledgeItem[],
	context: ScoringContext,
	weights: ScoringWeights,
	budgetTokens: number,
	now?: number,
): KnowledgeItem[] {
	const scored: ScoredItem[] = items.map((item) => ({
		item,
		score: scoreItem(item, context, weights, now),
	}));

	return enforceBudget(scored, budgetTokens);
}
