import type { KnowledgeItem } from "@hyperidle/db";
import type { AgentRole } from "@hyperidle/shared";
import { ROLE_TO_COMMUNITY } from "./role-community-map.js";
import type { ScoringContext, ScoringWeights } from "./scoring-config.js";
import { type ScoredItem, enforceBudget } from "./token-budget.js";

/** Recency decay window in milliseconds (30 days). */
const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Extract tags from a knowledge item's topic and JSON meta.tags fields.
 */
function extractItemTags(item: KnowledgeItem): string[] {
	const tags: string[] = [];
	if (item.topic) {
		tags.push(item.topic.toLowerCase());
	}
	if (item.meta) {
		try {
			const meta: unknown = JSON.parse(item.meta);
			if (meta && typeof meta === "object" && "tags" in meta) {
				const metaTags = (meta as { tags: unknown }).tags;
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
function computeTagMatch(item: KnowledgeItem, taskTags: string[]): number {
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

const KNOWN_AGENT_ROLES: readonly AgentRole[] = [
	"builder",
	"growth",
	"product_manager",
	"practice_facilitator",
	"chief_of_staff",
	"brand_voice",
];

function isAgentRole(value: string): value is AgentRole {
	return (KNOWN_AGENT_ROLES as readonly string[]).includes(value);
}

/** Compute role match factor (0 or 1). */
function computeRoleMatch(item: KnowledgeItem, agentRole: string): number {
	// ScoringContext.agentRole is typed as `string` (public API); the role map
	// is keyed by the canonical `AgentRole` union. Narrow via a type guard so
	// an unknown role returns 0 rather than throwing.
	if (!isAgentRole(agentRole)) {
		return 0;
	}
	const community = ROLE_TO_COMMUNITY[agentRole];
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

/** Compute confidence factor (0-1). Confidence is stored as `real` in [0,1]. */
function computeConfidence(item: KnowledgeItem): number {
	if (item.confidence == null) {
		return 0.5; // neutral default
	}
	// @lore I3 (TRACK-I.md L147-149): the previous `/ 100` divisor scaled this
	// 100× too small (a confidence of 0.8 became a factor of 0.008). The
	// schema stores `confidence` as `real` already in [0,1] — no normalization
	// needed. Clamp keeps us safe against out-of-range historic data.
	return Math.max(0, Math.min(1, item.confidence));
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

/** Compute attention score factor (0-1). attentionScore is `real` in [0,1]. */
function computeAttentionScore(item: KnowledgeItem): number {
	if (item.attentionScore == null) {
		return 0.5; // neutral default
	}
	// @lore I3: same fix as `computeConfidence` — drop the `/ 100` divisor.
	return Math.max(0, Math.min(1, item.attentionScore));
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
