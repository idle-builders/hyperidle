/**
 * Barrel for @hyperidle/knowledge (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `knowledgeItems`
 * (or `knowledgeEditLog`/`knowledgeAccessLog`/`knowledgeConflicts`/
 * `knowledgeAppProjection`) pgTable object — that would let a consumer obtain
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
 *
 * @lore AU20 Ag7a: the 8 per-consumer *-store barrel files are retired as
 * PUBLIC surface — their bodies were absorbed into the appropriate general
 * modules (`knowledge-repository.ts` for read/write helpers,
 * `promotion-pipeline.ts` for the promote transition,
 * `knowledge-conflicts.ts` for conflict write + writeback paths,
 * `practice-meeting.ts` for the raw accessors it was the sole consumer of).
 * Two simple-duplicate functions (`findKnowledgeItemVersionById`,
 * `findKnowledgeItemStatusById`) were retired from the barrel entirely —
 * callers replaced with `findById` adapters. The 6 individual DI-port-type
 * exports are bundled into one `KnowledgeDeps` re-export.
 */

// -- attention engine (recompute service + public DI types) --
/**
 * Bundled DI contract for wiring the knowledge attention service — replaces
 * the 6 individual DI-port-type re-exports (`AttentionServiceDeps`,
 * `AttentionWriteExecutor`, `ReasoningMarkerFinder`, `KnowledgeReviewWriter`,
 * `CreateReviewItemForKnowledgeInput`, `CreateReviewItemForKnowledgeResult`).
 *
 * @lore AU20 Ag7a: these were "inbound DI-port-type mirrors" — types external
 * packages implement to wire into the attention service. Bundling them under
 * one name removes the per-component churn from the public surface.
 */
export type {
	AttentionRecomputeResult,
	AttentionRecomputeScopeError,
	AttentionRecomputeScopeResult,
	AttentionRecomputeSummary,
	AttentionService,
	AttentionServiceDeps as KnowledgeDeps,
	AttentionServiceFilter,
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
// -- conflicts (knowledgeConflicts accessors, consolidated from retired barrels) --
export type {
	CreateKnowledgeConflictInput,
	RecordWritebackConflictInput,
} from "./knowledge-conflicts.js";
export {
	createKnowledgeConflict,
	findOpenConflictByItemAndProposer,
	recordWritebackConflict,
} from "./knowledge-conflicts.js";
// -- read (scope vocabulary — KnowledgeScope kept for external DI port typing) --
// @lore Ag7b: listByScope retired from public barrel (zero external callers; the
// knowledge-reader.integration.test.ts imports directly from "./knowledge-reader.js").
// KnowledgeScope kept because core-api/src/index.ts re-exports it for downstream use.
export type { KnowledgeScope } from "./knowledge-reader.js";
// -- the CRUD repository (general surface + absorbed per-consumer helpers) --
// @lore Ag7b: findById, findDetailById, findKnowledgeItemProjectionById, findRelatedByTopic,
// findRetroKnowledgeItemForBet, listVisibleWithSignals, listRecentByLayers,
// listExportableKnowledgeItems, listTitlesByIds retired from public barrel — callers
// migrated to get(id,{view?}) and list(filter) with discriminated return types.
export {
	archiveItem,
	type CreateKnowledgeItemInput,
	changeScope,
	countAccessesSince,
	countTriageVisible,
	create,
	type ExportableKnowledgeItemFilters,
	type ExportableKnowledgeItemRow,
	type ExportableListFilter,
	flagItem,
	get,
	type KnowledgeDetailRow,
	type KnowledgeItemProjectionRow,
	type KnowledgeItemView,
	type KnowledgeItemWithProjection,
	type KnowledgeListRow,
	type ListFilters,
	list,
	mergeItems,
	type RecentByLayersFilter,
	type RecentLayeredKnowledgeItemRow,
	type RecordKnowledgeAccessInput,
	type RelatedByTopicFilter,
	type RetroExistingKnowledgeItemRow,
	type RetroForBetFilter,
	recordKnowledgeAccess,
	type SearchVisibleKnowledgeRow,
	search,
	searchByText,
	searchVisibleByText,
	splitItem,
	type TitlesByIdsFilter,
	type UpdateKnowledgeItemInput,
	type UpsertBetRetroKnowledgeItemInput,
	update,
	upsertBetRetroKnowledgeItem,
	upsertKnowledgeAppProjectionAttentionScore,
	type VisibleWithSignalsFilter,
} from "./knowledge-repository.js";
// -- practice-meeting workflow (AU20 Am9: relocated from @hyperidle/review — actual data owner) --
export type {
	CreatePracticeMeetingInput,
	CreatePracticeMeetingResult,
	PracticeMeetingTurnResult,
	ProposalInput,
	ReactionInput,
	RunPracticeMeetingTurnInput,
	SynthesisInput,
} from "./practice-meeting.js";
export {
	createPracticeMeeting,
	PRACTICE_MEETING_ANCHOR_ROLE,
	runPracticeMeetingTurn,
} from "./practice-meeting.js";
// -- promotion pipeline (auto-promotion + stale sweeps + promote transition) --
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
	type PromoteKnowledgeItemInput,
	type PromoteKnowledgeItemResult,
	promoteKnowledgeItem,
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
export { createRelevanceService, reapKnowledgeAccessLog } from "./relevance-service.js";
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
