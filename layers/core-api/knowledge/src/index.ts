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
 * typing or import from @hyperidle/domain-model directly. Target surface: ~39 exports
 * (functions + the two types needed for inline-typed call sites).
 */

// -- attention engine (recompute service) --
export { recomputeAttention } from "./attention-service.js";
// -- errors --
export { ItemDeletedError, VersionConflictError } from "./errors.js";
// -- conflicts (knowledgeConflicts accessors) --
export {
	findOpenConflict,
	type RecordConflictInput,
	recordConflict,
} from "./knowledge-conflicts.js";
// -- the CRUD repository --
// @lore AU20 K1-reads: countAccessesSince/countTriageVisible/searchByText/
// searchVisibleByText deleted from source; replaced by count()/search({mode:'text',...}).
// @lore AU20 K2-writes: changeScope/flagItem/mergeItems/splitItem/recordKnowledgeAccess/
// upsertBetRetroKnowledgeItem/upsertKnowledgeAppProjectionAttentionScore deleted from
// source; callers use transition()/recordAccess(). promoteKnowledgeItem deleted from
// promotion-pipeline; callers use transition({target:"promote",...}).
export {
	count,
	create,
	get,
	getAgentIdentity,
	getAgentIdentityIds,
	getParentedItem,
	list,
	listItemIdsByParent,
	remove,
	restorePluginDocumentBody,
	search,
	setKnowledgeStatus,
	transition,
	type UpsertPluginDocumentInput,
	update,
	upsertAgentIdentity,
	upsertPluginDocument,
} from "./knowledge-repository.js";
export { sweep } from "./promotion-pipeline.js";
// -- review-item factory (moved from @hyperidle/review, AU44 batch 4 rows 9/10 MERGE) --
// The LIKE-probe idempotency contract belongs to knowledge; both callers live here.
// Kills the KnowledgeReviewWriter DI port and the currying factory shape in review.
export type { CreateReviewItemInput, CreateReviewItemResult } from "./review-item-factory.js";
export { attentionReviewReasoningMarker, createReviewItem } from "./review-item-factory.js";
// -- session context assembly (AU21 §9 Increment 12, Decision H3 — the
// requireRunnableAgent-precedent shared assembler; per-kind resolvers call
// this intra-layer instead of run-orchestration reading knowledge back) --
export type { SessionKnowledgeInput } from "./session-knowledge-assembler.js";
export { assembleSessionKnowledge } from "./session-knowledge-assembler.js";
