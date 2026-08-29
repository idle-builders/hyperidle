import type { HyperIdleDb } from "@hyperidle/db";

interface ScoringWeights {
	tagMatch: number;
	roleMatch: number;
	recency: number;
	confidence: number;
	layerProximity: number;
	attentionScore: number;
}

interface ScoringContext {
	taskDescription: string;
	taskTags: string[];
	agentRole: string;
	/** Optional: absent for a team-less agent. No scorer reads it today. */
	productId?: string;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
	tagMatch: 0.35,
	roleMatch: 0.15,
	recency: 0.15,
	confidence: 0.1,
	layerProximity: 0.15,
	attentionScore: 0.1,
};

/** Total context window tokens and knowledge allocation ratio. */
const CONTEXT_WINDOW_TOKENS = 200_000;
const KNOWLEDGE_ALLOCATION_RATIO = 0.2;
const DEFAULT_KNOWLEDGE_BUDGET = CONTEXT_WINDOW_TOKENS * KNOWLEDGE_ALLOCATION_RATIO; // 40_000

/**
 * Scoring weights. Always the hardcoded defaults.
 *
 * @lore AU18: previously read `factory_settings.scoring.weight.*` overrides.
 * No production or eval writer ever existed for this namespace — the only
 * write path was the generic PATCH /api/status/settings catch-all, itself
 * retired this WP. Dropping the DB read is behavior-identical in practice
 * (prod always resolved to these defaults) and removes a dead config surface.
 * `db` is kept as a parameter for call-site compatibility even though it is
 * now unused — every caller passes a live db handle already.
 */
async function loadScoringWeights(_db: HyperIdleDb): Promise<ScoringWeights> {
	return { ...DEFAULT_WEIGHTS };
}

// --- Attention scoring weights (G2) ---

/**
 * Weights for the attention scoring engine. All values are non-negative.
 *
 * @lore `repetition` and `confidence` are applied as INVERSE contributions in
 * the scorer (high repetition / high confidence REDUCE attention). The weight
 * itself remains a positive knob meaning "how strongly does this signal
 * dampen attention". Defaults are ratios; the scorer normalizes by total.
 */
interface AttentionWeights {
	readonly novelty: number;
	readonly impact: number;
	readonly conflict: number;
	/** Inverse: high repetition (same finding across many scopes) reduces attention. */
	readonly repetition: number;
	/** Inverse: high confidence reduces attention. */
	readonly confidence: number;
	readonly tasteSensitivity: number;
	readonly recency: number;
	readonly usage: number;
}

/**
 * @lore I6: defaults adjusted to sum to 1.0 (was 1.25). Reduced impact,
 * tasteSensitivity, and recency to bring the total in line.
 */
const DEFAULT_ATTENTION_WEIGHTS: AttentionWeights = {
	novelty: 0.2,
	impact: 0.2,
	conflict: 0.15,
	repetition: 0.1,
	confidence: 0.1,
	tasteSensitivity: 0.15,
	recency: 0.05,
	usage: 0.05,
};

/** Threshold at which a recompute crossing upward creates a review item. */
const ATTENTION_THRESHOLD = 0.7;

/**
 * Attention weights. Always the hardcoded defaults.
 *
 * @lore AU18: previously read `factory_settings.attention.weight.*`
 * overrides with a `[0,1]` defense-in-depth clamp. No production or eval
 * writer ever existed — the only write path was the generic
 * PATCH /api/status/settings catch-all, itself retired this WP. Dropping the
 * DB read is behavior-identical in practice and removes a dead config
 * surface (the defense-in-depth clamp is moot with no writer at all).
 */
async function loadAttentionWeights(_db: HyperIdleDb): Promise<AttentionWeights> {
	return { ...DEFAULT_ATTENTION_WEIGHTS };
}

export type { AttentionWeights, ScoringContext, ScoringWeights };
export { ATTENTION_THRESHOLD, DEFAULT_KNOWLEDGE_BUDGET, loadAttentionWeights, loadScoringWeights };
