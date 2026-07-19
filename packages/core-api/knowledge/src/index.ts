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
 *
 * @lore AU20 Ag7b: reads unified — findById/findDetailById/
 * findKnowledgeItemProjectionById collapsed into `get(id,{view?})`;
 * 8 specialized list helpers collapsed into `list(filter)` with
 * discriminated overloads. All row/filter types removed from barrel —
 * callers infer from function signatures.
 *
 * @lore AU20 Ag7c: writes collapsed — `archiveItem` renamed to `remove`
 * (archive-with-log path folds under `remove`; behavior unchanged).
 * All per-caller internal types, DI-port types, promotion-pipeline
 * internals, relevance/scoring internals, FTS internals, practice-meeting
 * types, and vocabulary types removed from barrel — callers use structural
 * typing or import from @hyperidle/shared directly. Target surface: ~39 exports
 * (functions + the two types needed for inline-typed call sites).
 */

// -- attention engine (recompute service) --
export { buildAttentionService, MAX_RECOMPUTE_BATCH } from "./attention-service.js";
// -- errors --
export { ItemDeletedError, VersionConflictError } from "./errors.js";
// -- full-text search (setup only; ftsSearch/sanitizeFtsQuery are internal) --
export { setupFts } from "./fts.js";
// -- conflicts (knowledgeConflicts accessors) --
export {
	createKnowledgeConflict,
	findOpenConflictByItemAndProposer,
	recordWritebackConflict,
} from "./knowledge-conflicts.js";
// -- scope vocabulary (KnowledgeScope kept for core-api/src/index.ts re-export) --
export type { KnowledgeScope } from "./knowledge-reader.js";
// -- the CRUD repository --
// @lore Ag7c: ExportableKnowledgeItemFilters kept — inline-typed by
// server-factory.ts and git-export-routes.ts via
// `import("@hyperidle/knowledge").ExportableKnowledgeItemFilters`.
// All other row/filter types removed (callers infer from return types).
export {
	changeScope,
	countAccessesSince,
	countTriageVisible,
	create,
	type ExportableKnowledgeItemFilters,
	flagItem,
	get,
	list,
	mergeItems,
	recordKnowledgeAccess,
	remove,
	search,
	searchByText,
	searchVisibleByText,
	splitItem,
	update,
	upsertBetRetroKnowledgeItem,
	upsertKnowledgeAppProjectionAttentionScore,
} from "./knowledge-repository.js";
// -- practice-meeting workflow --
export { createPracticeMeeting, runPracticeMeetingTurn } from "./practice-meeting.js";
// -- promotion pipeline (sweep + promote transition; internals are package-private) --
export {
	promoteKnowledgeItem,
	runAutoPromotionSweep,
	runStaleSweep,
} from "./promotion-pipeline.js";
// -- relevance engine + service --
export { registerRelevanceListener } from "./relevance-listener.js";
export { rankAndBudget } from "./relevance-scoring.js";
export { createRelevanceService, reapKnowledgeAccessLog } from "./relevance-service.js";
// -- scoring config (weights + token budget) --
export { DEFAULT_KNOWLEDGE_BUDGET, loadScoringWeights } from "./scoring-config.js";
// -- token budgeting --
export { countTokens } from "./token-budget.js";
