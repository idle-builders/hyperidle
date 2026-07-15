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
 * @lore AU19 Increment 1j: `practice-meeting-store.ts` added — low-level raw
 * accessors `@hyperidle/review`'s `practice-meeting.ts` needs (its own
 * `PracticeMeetingKnowledgeStore` DI port, Mechanism C — an ordinary
 * downward core-api-to-core-api edge, wired directly since `knowledge` is
 * already a real migrated package). NOT the general CRUD surface — see that
 * file's own top-of-file `@lore` for why `create()`/`update()` weren't reused.
 *
 * @lore AU19 Increment 2c: `git-export-store.ts` added — a genuinely NEW
 * `git-export -> knowledge` edge the §10.2 census missed entirely (surfaced
 * when `git-export`'s own migration hit Table ACL on its direct
 * `knowledgeItems`/`knowledgeAppProjection` query). `@hyperidle/git-export`'s
 * `GitExportKnowledgeReader` port wires directly to
 * `listExportableKnowledgeItems` (ordinary downward edge, `knowledge`
 * already real).
 *
 * @lore AU19 Increment 2g: `reapKnowledgeAccessLog` added to
 * `relevance-service.ts` (the module already reading `knowledgeAccessLog`) —
 * `@hyperidle/retention`'s TTL sweep used to delete from
 * `knowledgeAccessLog` directly; Table ACL now forbids that foreign direct
 * access, so the delete logic moved here (verbatim, zero behavior change)
 * and `retention` calls it through its injected
 * `RetentionKnowledgeAccessLogReaper` port. A genuinely NEW `retention →
 * knowledge` edge the original §10.2 census missed (raw table access wasn't
 * a countable edge at original census time) — see `@hyperidle/retention`'s
 * `ports.ts` top `@lore` for the census-correction row.
 *
 * @lore AU19 Increment 3f: `writeback-conflict-store.ts` added — the third
 * `capture-writeback -> knowledge` call site (`create`/`update` were already
 * counted; `writeback.ts`'s direct `knowledgeConflicts` inserts were raw
 * table access at original census time, not a countable edge). See
 * `@hyperidle/capture-writeback`'s `ports.ts` top `@lore` for the port side.
 *
 * @lore AU19 Increment 3h: `portfolio-retro-store.ts` added — the
 * `dispatch -> knowledge` census correction (`runPortfolioRetro`'s raw
 * `knowledgeItems`/`knowledgeAppProjection` join was never a countable edge
 * at original census time). See `@hyperidle/dispatch`'s `ports.ts` top
 * `@lore` for the port side.
 */

// -- attention-score-store (AU19 Increment 4 — the tool-handlers -> knowledge edge) --
export { upsertKnowledgeAppProjectionAttentionScore } from "./attention-score-store.js";
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
// -- conflict-review-store (AU19 Increment 4 — the tool-handlers -> knowledge edge) --
export type {
	CreateKnowledgeConflictInput,
	KnowledgeItemVersionRow,
} from "./conflict-review-store.js";
export {
	createKnowledgeConflict,
	findKnowledgeItemVersionById,
	findOpenConflictByItemAndProposer,
} from "./conflict-review-store.js";
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
// -- git-export read surface (AU19 Increment 2c — the git-export -> knowledge edge) --
export type {
	ExportableKnowledgeItemFilters,
	ExportableKnowledgeItemRow,
	KnowledgeItemProjectionRow,
} from "./git-export-store.js";
export {
	findKnowledgeItemProjectionById,
	listExportableKnowledgeItems,
} from "./git-export-store.js";
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
// -- portfolio-retro-store (AU19 Increment 3h — the dispatch -> knowledge edge) --
export type { RecentLayeredKnowledgeItemRow } from "./portfolio-retro-store.js";
export { listRecentByLayers } from "./portfolio-retro-store.js";
// -- practice-meeting raw accessors (Mechanism C port for @hyperidle/review) --
export type {
	ArchiveKnowledgeItemInput,
	CapturedProjectedItem,
	KnowledgeAppProjectionRow,
	RawKnowledgeAppProjectionInsert,
	RawKnowledgeEditLogInsert,
	RawKnowledgeItemInsert,
	RawKnowledgeItemRow,
} from "./practice-meeting-store.js";
export {
	archiveKnowledgeItemWithLogRaw,
	findKnowledgeAppProjectionByItemIdRaw,
	findKnowledgeItemByIdRaw,
	insertKnowledgeAppProjectionRaw,
	insertKnowledgeEditLogRaw,
	insertKnowledgeItemRaw,
	listCapturedItemsByProjectionScopeRaw,
	touchKnowledgeItemUpdatedAtRaw,
	updateKnowledgeAppProjectionMetaIfUnchangedRaw,
} from "./practice-meeting-store.js";
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
// -- promotion-transition (AU19 Increment 4 — the tool-handlers -> knowledge edge) --
export type {
	PromoteKnowledgeItemInput,
	PromoteKnowledgeItemResult,
} from "./promotion-transition.js";
export { findKnowledgeItemStatusById, promoteKnowledgeItem } from "./promotion-transition.js";
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
// -- writeback-conflict-store (AU19 Increment 3f — the capture-writeback -> knowledge edge) --
export type { RecordWritebackConflictInput } from "./writeback-conflict-store.js";
export { recordWritebackConflict } from "./writeback-conflict-store.js";
