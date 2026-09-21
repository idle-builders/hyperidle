/**
 * Barrel for @hyperidle/knowledge (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `documents`
 * pgTable object — that would let a consumer obtain a table transitively and
 * defeat Table ACL (Mechanism A). Consumers get typed functions; the table
 * stays private to this Service.
 *
 * @lore BC4: the extension table (`knowledge_app_projection`) and the edit
 * log (`knowledge_edit_log`) are dropped with migration 0086 — `documents`
 * is the only table this Service owns now.
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

// -- errors --
export { InvalidReparentError, ItemDeletedError, VersionConflictError } from "./errors.js";
// @lore document-module B0c: `knowledge-conflicts.ts`'s `recordConflict`/
// `findOpenConflict` accessors are DELETED — a document has no conflict
// object (founder ruling); an edit carrying a stale version is refused and
// the writer retries, nothing records a conflict row.
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
	GraduationNotAllowedError,
	get,
	getAgentIdentity,
	getAgentIdentityIds,
	getParentedItem,
	getRoutinePrompt,
	getRoutinePromptBodies,
	graduate,
	type KnowledgeItemChildRef,
	list,
	listItemIdsByParent,
	listParentedItemBodies,
	remove,
	reparent,
	restorePluginDocumentBody,
	search,
	setKnowledgeStatus,
	transition,
	type UpsertKnowledgeDocumentInput,
	update,
	upsertAgentIdentity,
	upsertKnowledgeDocument,
} from "./knowledge-repository.js";
// @lore BC3 architecture.md §5 B7b: `review-item-factory.ts` DELETED —
// `createReviewItem`/`attentionReviewReasoningMarker`/`CreateReviewItemInput`/
// `CreateReviewItemResult` go with the `items` table. The stalled-knowledge-
// action review is a `send_message` now (`agent-run-admission-reactions.ts`).
// -- session context assembly (AU21 §9 Increment 12, Decision H3 — the
// requireRunnableAgent-precedent shared assembler; per-kind resolvers call
// this intra-layer instead of run-orchestration reading knowledge back) --
export type { SessionDocument } from "./session-documents.js";
export { assembleSessionDocuments } from "./session-documents.js";
