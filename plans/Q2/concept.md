# Q2 Concept — Human-authored knowledge at any scope

**Status:** Locked (inherits from `plans/human-authoring/concept.md`)
**Date:** 2026-05-26

---

## Concept inheritance

Q2 does not introduce new primitives or reshape existing ones. All concept work was completed in the parent concept doc at `plans/human-authoring/concept.md` (status: Locked). This document confirms alignment and notes observations relevant to Q2 implementation.

## Required reading (for downstream /design and /architecture)

- `plans/human-authoring/concept.md` — scope vs layer separation, collaborative continuation, vocabulary
- `docs/knowledge-architecture/the-canonical-store.md` — kernel schema with scope_kind + scope_id (ground truth, already updated)
- `docs/knowledge-architecture/canonical-shapes.md` — canonical kernel + strategy extension signatures (already includes scope_kind)
- `docs/knowledge-architecture/the-five-layers.md` — L0-L4 maturity model, scope-to-layer mapping table
- `packages/db/src/schema.ts` lines 302-321 (knowledgeItems kernel — NO scope_kind yet), 404-427 (knowledgeStrategyFabric — has scopeId)
- `packages/fabric/src/types.ts` — KnowledgeScope type (only practice | product | factory — needs extending)
- `packages/server/src/routes/knowledge.ts` — existing CRUD routes (no scope awareness)
- `packages/web/src/pages/KnowledgeList.tsx` — list page (scope param in URL but unused for filtering)
- `packages/web/src/pages/KnowledgeDetail.tsx` — detail page (fixture-driven, no scope mutation UI)
- `packages/web/src/pages/WorkBet.tsx` — bet detail (contextual creation target)
- `packages/web/src/shell/TaskSheet.tsx` — task detail drawer (contextual creation target)

## Noun classification for Q2

| Noun | Classification | Notes |
|---|---|---|
| scope_kind | **Reshaped** (concept locked) | Closed enum: factory, product, practice, team, bet, task, user. Must be added to kernel knowledgeItems table. |
| scope (kernel concept) | **Reshaped** (concept locked) | scope_kind + scope_id pair. scope_id moves from strategy fabric to kernel. |
| layer (strategy) | **Stable** | Optional, derived by fabric. No changes to layer concept. |
| knowledge item | **Stable** | Existing primitive; Q2 adds human creation flow but doesn't reshape the item itself. |
| collaborative continuation | **New** (concept locked) | Humans and agents are interchangeable authors. Q2 is the first implementation of human-initiated creation. |

## Observations for Q2 implementation

### 1. Code-doc drift on scope_kind

The ground-truth docs (`the-canonical-store.md`, `canonical-shapes.md`) already describe `scope_kind` + `scope_id` on the kernel `knowledge_items` table. The code does NOT yet have these columns. Q2's migration must bring the code into alignment with the docs — this is not new concept work, it is implementation catch-up.

Current code state:
- `knowledgeItems` table (schema.ts:302-321): has id, topic, title, body, format, status, version, updatedBy, createdAt, updatedAt. **No scope_kind, no scope_id.**
- `knowledgeStrategyFabric` table (schema.ts:404-427): has `scopeId` (strategy extension). This column stays but becomes secondary — the kernel table gets the authoritative scope.
- `KnowledgeScope` type in `packages/fabric/src/types.ts`: only `"practice" | "product" | "factory"`. Must be extended or a new kernel-level type created.

### 2. Scope-to-layer mapping is fabric's responsibility

The concept doc is clear: creation flow does NOT set layer. The Knowledge Fabric assigns layer based on scope mapping (factory->L4, product->L2, practice->L3, task->L1). Scopes without layer mapping (bet, team, user) have no layer. Q2's creation endpoint must NOT accept a layer parameter.

### 3. Status vocabulary drift

Ground-truth canonical shapes use the 6-state status: captured, provisional, validated, active, stale, archived. The O2 migration simplified kernel statuses to 3-state: draft, active, archived. The server route uses the 3-state set. Q2 should use the kernel 3-state set (draft, active, archived) since that is what the API currently enforces. New items default to "draft".

### 4. User-scoped item visibility

AC-6 requires user-scoped items visible only to the author. The current API has no auth context wired into knowledge routes (see lore comment on knowledgeAccessLog: "accessorKind defaults to 'human' when the auth context is not wired"). Q2 must implement filtering for user-scoped items — either server-side (preferred) or client-side with auth context.

### 5. Scope mutation tracking

AC-7 requires scope changes tracked in version history. The existing `knowledgeEditLog` table tracks field-level changes. Scope changes (scope_kind and scope_id) must be logged there. The version bump + edit log pattern already exists in the PATCH handler.

## Contracts confirmed (from parent concept doc)

- **Cardinality:** Every knowledge item has exactly one scope (scope_kind + scope_id). Layer is zero or one.
- **Closure:** scope_kind is a closed enum. Adding a scope kind requires concept-doc update first.
- **Mutability:** Scope is mutable (with version tracking via edit log). Layer is mutable by fabric only.
- **Identity:** Scope does not contribute to item identity. The item's opaque UUID is its identity.
- **Hard rule:** Kernel knowledgeItems carries scope_kind + scope_id. Layer stays in knowledgeStrategyFabric.

## No concept changes required

The parent concept doc covers all Q2 nouns without contradiction. No ground-truth doc updates needed — `the-canonical-store.md` and `canonical-shapes.md` already describe the target state. The work is implementation, not concept.
