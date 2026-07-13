/**
 * Barrel for @hyperidle/knowledge (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `knowledgeItems`
 * (or `knowledgeEditLog`/`knowledgeAccessLog`/`knowledgeConflicts`/
 * `knowledgeStrategyFabric`) pgTable object — that would let a consumer obtain
 * a table transitively and defeat Table ACL (Mechanism A). Consumers get
 * typed functions; the tables stay private to this Service.
 *
 * @lore AU19 Increment 1a: this is the real cut-over — the full 15-file
 * knowledge module (attention scoring, FTS, promotion pipeline, relevance
 * engine, the CRUD repository) moved here from `packages/server/src/knowledge/`
 * unchanged (behavior-preserving move). Two production edges out of knowledge
 * (`attention-service.ts` → `work`/`review`) became injected DI ports
 * (Mechanism C) since neither `work` nor `review` has migrated yet — see
 * `AttentionServiceDeps` in `attention-service.ts`.
 */

// -- attention engine (recompute service + DI ports for work/review edges) --
export type {
	AttentionRecomputeResult,
	AttentionRecomputeScopeError,
	AttentionRecomputeScopeResult,
	AttentionRecomputeSummary,
	AttentionService,
	AttentionServiceDeps,
	AttentionServiceFilter,
	AttentionWriteExecutor,
	CreateReviewItemForKnowledgeInput,
	CreateReviewItemForKnowledgeResult,
	KnowledgeReviewWriter,
	ReasoningMarkerFinder,
} from "./attention-service.js";
export { buildAttentionService, MAX_RECOMPUTE_BATCH } from "./attention-service.js";

// -- errors --
export { ItemDeletedError, VersionConflictError } from "./errors.js";

// -- full-text search --
export {
	FTS_MAX_QUERY_CHARS,
	FTS_MAX_TOKENS,
	type FtsSearchOptions,
	ftsSearch,
	sanitizeFtsQuery,
	setupFts,
} from "./fts.js";
// -- read (scope-based; the Increment 0 KnowledgeReader edge for context-assembly) --
export type { KnowledgeScope } from "./knowledge-reader.js";
export { listByScope } from "./knowledge-reader.js";
// -- the CRUD repository (production surface: routes/knowledge.ts, tools/*, context-assembly.ts) --
export {
	archiveItem,
	type CreateKnowledgeItemInput,
	changeScope,
	countAccessesSince,
	countTriageVisible,
	create,
	findById,
	findDetailById,
	findRelatedByTopic,
	flagItem,
	type KnowledgeDetailRow,
	type KnowledgeItemWithProjection,
	type KnowledgeListRow,
	type ListFilters,
	list,
	listVisibleWithSignals,
	mergeItems,
	search,
	searchByText,
	splitItem,
	type UpdateKnowledgeItemInput,
	update,
} from "./knowledge-repository.js";
// -- promotion pipeline (auto-promotion + stale sweeps) --
export {
	AUTO_PROMOTION_EDITOR,
	AUTO_PROMOTION_REPETITION_THRESHOLD,
	type AutoPromotionResult,
	type AutoPromotionSweepResult,
	type ContradictionResult,
	checkAutoPromotion,
	DEFAULT_SWEEP_MAX_BATCH_SIZE,
	detectLayerContradiction,
	findStaleItems,
	markStale,
	runAutoPromotionSweep,
	runStaleSweep,
	STALE_THRESHOLD_MS,
	type StaleSweepOptions,
	type StaleSweepResult,
} from "./promotion-pipeline.js";
export type {
	RelevanceConfig,
	RelevanceInput,
	RelevanceShape,
	RelevanceWeights,
} from "./relevance-engine.js";
// -- relevance engine + service + scoring --
export { computeRelevanceScore, DEFAULT_RELEVANCE_CONFIG } from "./relevance-engine.js";
export { registerRelevanceListener } from "./relevance-listener.js";
export { rankAndBudget, scoreItem } from "./relevance-scoring.js";
export type { RelevanceService, SignalSet } from "./relevance-service.js";
export { createRelevanceService } from "./relevance-service.js";
// -- role/community mapping --
export { communityForRole } from "./role-community-map.js";
// -- scoring config (weights, thresholds, token budgets) --
export {
	ATTENTION_THRESHOLD,
	type AttentionWeights,
	CONTEXT_WINDOW_TOKENS,
	DEFAULT_KNOWLEDGE_BUDGET,
	KNOWLEDGE_ALLOCATION_RATIO,
	loadAttentionWeights,
	loadRelevanceConfig,
	loadScoringWeights,
	type ScoringContext,
	type ScoringWeights,
} from "./scoring-config.js";
// -- token budgeting --
export { countItemTokens, countTokens, enforceBudget, type ScoredItem } from "./token-budget.js";
// -- shared knowledge types --
export {
	KNOWLEDGE_STATUSES,
	type KnowledgeKind,
	type KnowledgeLayer,
	type KnowledgeStatus,
	type PropagationLevel,
} from "./types.js";
