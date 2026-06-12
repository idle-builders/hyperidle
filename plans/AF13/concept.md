# AF13 — Concept probe

**Workpackage.** Knowledge authoring and curation that works. Defect-fix on an existing primitive.

## Required reading (downstream `/architecture` + `/write-*`)

- `.pipeline/work-packages/TRACK-AF.md` § AF13 (lines 493–529).
- `docs/knowledge-architecture/the-canonical-store.md` — scope→layer table (`user` = no layer, private).
- `docs/human-interface-layer/the-three-views-the-rail.md` § "What a KnowledgeRow shows" (line 342) — the at-a-glance contract: title, preview, kind/status/topic tags, three relevance signals (recency, 30-day access count, citation), `user`→"Private" badge.
- `packages/web/src/utils/scope-labels.ts` — the locked AD6/AE1 label mapping (the vocabulary contract; do not re-derive).
- `packages/shared/src/types.ts` lines 142–167 — `SCOPE_KINDS` (7-value closed enum) + `SCOPES_REQUIRING_ID`.

## Phase 0 — Nouns and classification

| Noun | Working definition | Classification |
|---|---|---|
| **Knowledge item** | A scoped, versioned unit of captured org knowledge (`knowledge_items` row). | **Stable** — exists since O2/Q2. AF13 does not change what it is. |
| **Scope** | Where an item belongs; a 7-value closed enum (`scopeKind`) + optional `scopeId`, collapsed to 3 user-facing labels (Shared/Team/Private). | **Stable** — locked by AD6/AE1. AF13 fixes a *mapping defect* (default→editability), not the concept. |
| **Status** | Lifecycle state: `draft \| active \| archived \| needs_human`. | **Stable** — AF13 honors a requested status it currently ignores; the state set is unchanged. |
| **Triage** | The review surface where `draft`/`needs_human` items are validated (→active) or rejected (→archived). | **Stable** — Y4 flow. AF13 fixes a *post-action visibility* defect, not the flow's meaning. |
| **Relevance signals** | Per-item metadata: 30-day access count, recency, related items, editor, kind, topic. | **Stable** — defined in the-three-views doc. AF13 sources them correctly; it does not invent new signals. |
| **Sort** | An ordering of the list by relevance / recency / frequency. | **Stable** — `KNOWLEDGE_SORT_OPTIONS` already closed in `packages/fabric/src/types.ts`. AF13 makes the pills actually apply it. |

**Verdict: NO New or Reshaped nouns.** Every load-bearing noun is already locked in `docs/` + code. AF13 is a pure defect-fix workpackage: wrong mappings, a missing sort application, a stale-version bug, and detail-response fields the route omits. Per the `/concept` skip rule, the concept layer is **not reopened**.

## What this is NOT (defect-fix guardrails, not concept work)

These are scope rejections the architecture/build must honor — carried from the spec's "Out of scope":

- **Not a fabric-relevance rebuild.** Relevance/promotion/FTS mechanics belong to AF9. The "relevance" sort here orders by the existing `relevanceScore` signal (or a defined deterministic fallback); it does not compute new scores.
- **Not new surfaces.** Merge/split, related-items authoring, citation graph are not built. AF13 only repairs controls that already render. "Related items" is **derived** (by topic, mirroring the existing fixture logic), not a new authored relation — there is no `knowledge_relations` table and AF13 does not add one.
- **Not a scope-vocabulary change.** The 3-label mapping (`scope-labels.ts`) is authoritative and stays. The bug is that the *create default* "Shared" maps to `factory`, and `factory` is treated as read-only in the detail view — that is a coupling defect, not a vocabulary change. Raw `scopeKind` enums must never reach the user (the `ScopeChangeDialog` select currently leaks them — flagged for architecture).

## Vocabulary (carried, not redefined)

| Term | Definition | Aliases not to use |
|---|---|---|
| **Knowledge item** | Scoped versioned knowledge unit. | doc, note, entry, card |
| **Scope** | `scopeKind` (7-enum) + `scopeId`; user-facing label via `scopeKindToLabel`. | layer (layer is a fabric-derived concept, not a scope) |
| **Shared / Team / Private** | The only user-facing scope labels (AD6/AE1). | factory, practice, product, user (raw enums — never shown) |
| **Triage** | draft/needs_human review queue. | inbox, review-queue |

## Contracts touched (handed to `/architecture`, not decided here)

These are existing contracts AF13 must repair without reshaping:

1. **Create-status contract.** `POST /api/knowledge` already accepts `status?` and defaults to `draft`. The defect: the create *page* never sends `status`, so a user-authored item is always a draft requiring triage. Contract stays "honor requested status, default draft"; the fix is on the caller + possibly the default for human-authored items.
2. **Editability contract.** Editability is a function of scope, not an accident of the default. `factory` read-only is a deliberate rule (agent-curated org knowledge); the defect is that the *default human create scope* lands in `factory`. The contract to make explicit: a human-created default item must be editable by its creator.
3. **Optimistic-concurrency contract.** `version` is the per-item monotonic counter; every mutating endpoint checks it and 409s on mismatch. The defect is a *client* bug (the scope dialog holds a frozen version), not a contract change.
4. **Detail-response contract.** The detail route must return exactly the fields `useKnowledgeItem`'s `KnowledgeItemData` declares (`accessCount`, `relatedItems`, `kind`, `confidence`, `topic`, `updatedBy`, `layer`) — or the hook stops declaring them. No permanent placeholders (spec constraint).

## Rationale

AF13 is the "make the controls real" workpackage. Knowledge already has a sound concept (scope, version, status, signals); the audit (Z8-034…141) found that the *wiring between UI and route* is broken at four seams. Reopening the concept would be the anti-pattern the skill warns against — the bug is in the contracts' implementation, not their shape. Locking this here prevents `/architecture` from drifting into a relevance-engine or merge-UI redesign that the spec explicitly puts out of scope.
