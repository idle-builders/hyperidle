import type { HyperIdleDb } from "@hyperidle/db";

/**
 * @lore nested-knowledge-items D1: `roleMatch` and `layerProximity` are
 * DELETED. `roleMatch` scored against a role→community map that never
 * matched seeded data (the census found the fuzzy substring fallback did all
 * the work); `layerProximity` scored the now-deleted layer ladder. What an
 * agent receives is answered entirely by scope (factory + its team + its
 * own) — no subtree selection, no replacement weight.
 */
interface ScoringWeights {
	tagMatch: number;
	recency: number;
	confidence: number;
}

interface ScoringContext {
	taskDescription: string;
	taskTags: string[];
	agentRole: string;
	/** Optional: absent for a team-less agent. No scorer reads it today. */
	productId?: string;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
	tagMatch: 0.55,
	recency: 0.2,
	confidence: 0.15,
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

export type { ScoringContext, ScoringWeights };
export { DEFAULT_KNOWLEDGE_BUDGET, loadScoringWeights };
