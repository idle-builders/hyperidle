/**
 * Barrel for @hyperidle/document (core-api Layer, SQL-owning Service).
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
 * @lore B21: the barrel's target shape, locked by architecture.md §8.1 —
 * `createDocumentActions`, `DocumentActionsDeps`, `assembleSessionDocuments`,
 * `SessionDocument`, and `getDocument` (the websocket authorizer's own read).
 * Every prior consumer of the legacy CRUD repository (`knowledge-repository.ts`,
 * deleted with this block, along with `errors.ts`/`types.ts`) has moved onto
 * the action mechanism — `routes/*.ts`, `actions/compose.ts`,
 * `services/*-bindings.ts` reach documents only through
 * `search_documents`/`open_document`/`edit_document` now, never a direct
 * repository import. `./document-store.js` stays unexported except for
 * `getDocument` — no hidden extra door onto the raw table.
 */

// -- the action mechanism (architecture.md §3, §8.1) --
export { createDocumentActions, type DocumentActionsDeps } from "./document-actions.js";
// @lore BC4 B9 (architecture.md §7): the WS authorizer's own read of a
// `documents` row for the `document:<id>` subscribe-authz check — the same
// shape `@hyperidle/thread`'s `findThread` export serves
// `ws-subscribe-authorizer.ts`'s `conversation` port.
export { getDocument } from "./document-store.js";
// -- session context assembly (AU21 §9 Increment 12, Decision H3 — the
// requireRunnableAgent-precedent shared assembler; per-kind resolvers call
// this intra-layer instead of run-orchestration reading documents back) --
export type { SessionDocument } from "./session-documents.js";
export { assembleSessionDocuments } from "./session-documents.js";
