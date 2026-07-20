# knowledge — Service-as-Product Re-Architecture (AU20)

**Layer:** core-api · **Substrate:** owned-tables (5) · **Now:** 87 methods / 67 types · **Target:** 17 methods / 12 types

The prior pass (analysis/services/knowledge.md) designed only the OUTSIDE (138→32 exports by fusing per-consumer finders). It never re-derived the surface INSIDE-OUT from the tables the service owns. The barrel shrank to ~39 but the module kept every per-caller shape behind it. This pass anchors on the substrate.

---

## 1. INSIDE-OUT — substrate → floor → owned capabilities

**Substrate = owned DB tables (5).** This is the canonical knowledge store. Kind (a). One aggregate root + two append-only child logs + a 1:1 projection extension:

| Table | Role | Public floor |
|---|---|---|
| `knowledgeItems` | aggregate root: identity + content (title/body/format/status/version/scope) | full CRUD |
| `knowledgeAppProjection` | 1:1 strategy projection (layer/kind/attention/relevance/citation) — cascade child of items | **0 dedicated** — read via item `view:projection`, written by item write + attention/relevance recompute |
| `knowledgeEditLog` | append-only field-level edit history, `RESTRICT` (outlives subject) | **0 public** — internal side-effect of every item write |
| `knowledgeAccessLog` | append-only detail-view fetch log, feeds relevance | record / count / reap |
| `knowledgeConflicts` | concurrent-edit conflict records, open→resolved | record / findOpen |

**The floor is NOT 5×5=25.** Two of the five tables carry no independent public surface: `knowledgeEditLog` is written transactionally inside every item create/update/remove (never read by a consumer), and `knowledgeAppProjection` is a 1:1 extension read through the item and written through the item + the score engines — it never gets its own `createProjection`/`deleteProjection`. So the substrate floor is:

- **Items (root + projection):** `create` · `get` · `list` · `count` · `update` · `remove` = **6**
- **AccessLog (append-only):** `recordAccess` · `countAccesses` · `reapAccessLog` = **3**
- **Conflicts (open/resolve):** `recordConflict` · `findOpenConflict` = **2**

**FLOOR = 11.**

**Genuine owned capabilities above the floor** — real algorithms this service owns, not reducible to CRUD (these are why `knowledge` is a standalone product, not a table dump):

1. **Full-text search** over items — `search`. A capability of the store (FTS index + query sanitization), not a table read.
2. **Relevance engine** (three-signal ranking + token-budget enforcement) — `rank` (score + budget a candidate set for context assembly) + `recomputeRelevance` (denormalize `relevanceScore` onto the projection). The compounding-knowledge product core.
3. **Attention engine** (attention scoring + threshold→review side-effect) — `recomputeAttention(spec)` collapsing `recomputeOne`/`recomputeMany`/`recomputeScope`.
4. **Lifecycle state machine** (promotion + staleness + structural edits) — `transition(id, target)` (promote|archive|flag|markStale|changeScope|merge|split) + `sweep(kind)` (autoPromotion|stale).

Genuine capabilities = **6** (`search` 1, relevance 2, attention 1, lifecycle 2).

**TARGET = 11 + 6 = 17.**

---

## 2. OUTSIDE-IN — real consumer demand (from service-data-23.json)

- **git-export** → `listExportableItems`, `getProjectionByItemId` → `list({exportable})`, `get(id,{view:projection})`
- **dispatch** → `runAutoPromotionSweep`, `runStaleSweep`, `listRecentByLayers`, `recomputeAttentionForCandidates` → `sweep(kind)`, `list({recentByLayers})`, `recomputeAttention({filter})`
- **session-requests** → `findById` → `get(id)`
- **tool-handlers** → `search`, `create`, `findKnowledgeItemVersionById`, `findKnowledgeItemStatusById`, `findOpenConflictByItemAndProposer`, `createKnowledgeConflict`, `promoteKnowledgeItem`, `upsertKnowledgeAppProjectionAttentionScore`, `recomputeAttentionScoreForItem` → `search`, `create`, `get(id,{view:version|status})`, `findOpenConflict`, `recordConflict`, `transition(id,'promote')`, `recomputeAttention({itemId})`

Every request lands on a general method. No consumer needs a bespoke method — the fragmentation was one finder per (consumer × shape), all of which fold into `get(id,{view})` / `list(filter)` / `transition(id,target)` / `recomputeAttention(spec)`. The demand confirms the inside-out floor: no consumer wants a raw projection or edit-log write, validating the 0-public verdict on those two tables.

---

## 3. THE COHERENT PRODUCT API (17 methods)

### A. Items — repository over `knowledgeItems` (+ `knowledgeAppProjection`, `knowledgeEditLog` internally)  — CRUD floor, both lenses
1. `create(input) → KnowledgeItem` — writes item + edit-log + projection in one tx. Review's clock/scopeId quirk = optional `input.nowMs?` / `input.scopeOnProjectionOnly?` fields, NOT a parallel `insertRaw`.
2. `get(id, {view?}) → …` — `view ∈ summary | detail | projection | version | status`. Subsumes findById, findDetailById, findProjectionById, findVersionById, findStatusById.
3. `list(filter) → KnowledgeItem[]` — `filter = {scope?, layers?, topic?, status?, exportable?, recentByLayers?, visibleWithSignals?, triageVisible?, titlesByIds?, retroForBet?, relatedTopic?}`. Subsumes listByScope, list, listVisibleWithSignals, findRelatedByTopic, listExportableKnowledgeItems, listRecentByLayers, listTitlesByIds, findRetroKnowledgeItemForBet.
4. `count(filter) → number` — same filter shape; subsumes countTriageVisible.
5. `update(id, patch) → KnowledgeItem` — version-checked; writes edit-log. Subsumes update + the raw `touchUpdatedAt`/`archiveWithLogRaw`/projection upserts.
6. `remove(id) → KnowledgeItem` — soft archive with edit-log.

### B. Lifecycle — state machine over items + promotion  — internal-logic capability
7. `transition(id, target, ctx?) → TransitionResult` — `target ∈ promote | archive | flag | markStale | changeScope | merge | split`. Discriminated result. Subsumes promoteKnowledgeItem, flagItem, changeScope, mergeItems, splitItem, markStale, detectLayerContradiction.
8. `sweep(kind, opts?) → SweepResult` — `kind ∈ autoPromotion | stale`. Subsumes runAutoPromotionSweep, runStaleSweep, checkAutoPromotion, findStaleItems.

### C. Search — FTS capability
9. `search(query, {visibility?, scope?}) → KnowledgeItem[]` — `visibility ∈ all | visibleTo(userId)`. Subsumes search, searchByText, searchVisibleByText, ftsSearch, sanitizeFtsQuery (internal).

### D. Relevance — owned ranking + token-budget engine  — genuine capability (fabric/context-assembly demand)
10. `rank(items, ctx) → ScoredItem[]` — three-signal score + token-budget to `ctx.tokenLimit`. Subsumes rankAndBudget, scoreItem, enforceBudget, countTokens.
11. `recomputeRelevance(itemIds) → void` — denormalize `relevanceScore` onto projection. Subsumes createRelevanceService.recomputeScores.

### E. Attention — owned attention-scoring engine  — genuine capability (dispatch, tool-handlers demand)
12. `recomputeAttention(spec) → AttentionResult` — `spec = {itemId} | {itemIds} | {filter}`. Subsumes recomputeOne, recomputeMany, recomputeScope, upsertKnowledgeAppProjectionAttentionScore.

### F. Conflicts — `knowledgeConflicts` lifecycle
13. `recordConflict(input) → KnowledgeConflict` — subsumes createKnowledgeConflict, recordWritebackConflict.
14. `findOpenConflict(itemId, proposer) → KnowledgeConflict | null`.

### G. AccessLog — append-only `knowledgeAccessLog`
15. `recordAccess(input) → void`.
16. `countAccesses(filter) → number` — `filter = {itemId?, since?}`. Subsumes countAccessesSince.
17. `reapAccessLog(cutoff) → string[]` — retention prune.

### Shared vocabulary (types, not methods)
`KnowledgeScope`, `KnowledgeItem`, `KnowledgeItemWithProjection`, `KnowledgeItemView`, `CreateKnowledgeItemInput`, `UpdateKnowledgeItemInput`, `ListFilter`, `TransitionResult`, `SweepResult`, `ScoredItem`, `ItemDeletedError`, `VersionConflictError`. Enums (`KnowledgeStatus/Kind/Layer/PropagationLevel`) re-used from `@hyperidle/shared`, not redefined here.

---

## 4. TARGET NUMBERS & what gets DELETED

- **targetMethods = 17** (floor 11 + 6 genuine capabilities). Every method traces to a table's CRUD/lifecycle or a named owned algorithm.
- **targetTypes = 12** — one `ListFilter` replaces 6 per-shape filter interfaces (VisibleWithSignalsFilter, RetroForBetFilter, TitlesByIdsFilter, RecentByLayersFilter, ExportableListFilter, RelatedByTopicFilter); one item/view type family replaces 7 row types (KnowledgeListRow, KnowledgeDetailRow, RetroExistingKnowledgeItemRow, RecentLayeredKnowledgeItemRow, KnowledgeItemProjectionRow, ExportableKnowledgeItemRow, SearchVisibleKnowledgeRow).

**DELETED (capability removed / sprawl cut, not merely internalized):**
- The **9 practice-meeting raw accessors** (`insertKnowledgeItemRaw`, `findKnowledgeItemByIdRaw`, `archiveKnowledgeItemWithLogRaw`, `touchKnowledgeItemUpdatedAtRaw`, projection raws, …) — DELETED; callers use `create/get/update/remove`. The clock/scopeId reasons become two optional `create` input fields.
- **Duplicate finders** `findKnowledgeItemVersionById` / `findKnowledgeItemStatusById` — DELETED; folded into `get(id,{view})`.
- **~15 relevance/attention/scoring public exports** (ATTENTION_THRESHOLD, DEFAULT_RELEVANCE_CONFIG, loadAttentionWeights/loadRelevanceConfig/loadScoringWeights, CONTEXT_WINDOW_TOKENS, KNOWLEDGE_ALLOCATION_RATIO, MAX_RECOMPUTE_BATCH, DEFAULT_KNOWLEDGE_BUDGET, DEFAULT_SWEEP_MAX_BATCH_SIZE, AUTO_PROMOTION_REPETITION_THRESHOLD, STALE_THRESHOLD_MS, …) — DELETED from surface; collapse behind one internal `loadScoringConfig()`. Tuning = config change, not export churn.
- **The 8 per-consumer `*-store` barrels** (bet-retro-store, portfolio-retro-store, git-export-store, route-support, writeback-conflict-store, conflict-review-store, promotion-transition, attention-score-store) — DELETED as public surface; bodies survive inside the 7 interfaces above.
- **`setupFts`** → internal migration hook (not public). `registerRelevanceListener` / `createRelevanceService` / `buildAttentionService` factories → collapsed into the `rank`/`recomputeRelevance`/`recomputeAttention` methods (DI wired internally).

**RELOCATED (out of the store product, capability preserved elsewhere):** `createPracticeMeeting` / `runPracticeMeetingTurn` + their types are a distinct *workflow* (a facilitated meeting that emits knowledge), not the knowledge store's API. They become an internal consumer of `Items.create` (or move to their own service). Not counted in the store's 17; capability intact via composition.

---

## 5. LEAN *AND* COMPLETE — every real feature still deliverable

| Real feature | Delivered through |
|---|---|
| Agent creates/edits knowledge (tool-handlers) | `create`, `update`, `remove` |
| Context assembly pulls ranked, budget-fitted knowledge (fabric) | `list(filter)` → `rank(items, ctx)` |
| Git export of exportable items + projection | `list({exportable})`, `get(id,{view:projection})` |
| Auto-promotion + stale sweeps (dispatch routines) | `sweep('autoPromotion')`, `sweep('stale')` |
| Attention recompute for candidates / one item | `recomputeAttention({filter})`, `recomputeAttention({itemId})` |
| Promote an item to a higher layer (skill tool) | `transition(id, 'promote')` |
| Concurrent-edit conflict capture + dedupe | `recordConflict`, `findOpenConflict` |
| Triage / visible-with-signals lists in UI | `list({triageVisible})`, `list({visibleWithSignals})`, `count({triageVisible})` |
| Bet-retro knowledge upsert | `create`/`update` with retro fields; lookup via `list({retroForBet})` |
| Access logging + relevance signals + retention reap | `recordAccess`, `countAccesses`, `reapAccessLog` |
| Full-text search, visibility-scoped | `search(query, {visibility})` |

No current user feature loses reachability. Removing FRAGMENTATION (one method per consumer×shape) — not capability — takes 87→17.
