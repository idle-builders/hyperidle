# knowledge — Service-as-Product Audit (AU20)

**Layer:** core-api · **Owned tables:** knowledgeItems, knowledgeEditLog, knowledgeAccessLog, knowledgeConflicts, knowledgeAppProjection · **Current public exports:** 138 · **Consumers:** 8

## 1. Existence / Consolidation Verdict — STANDALONE

`knowledge` is the one core-api service that unambiguously earns its own boundary. It is the **canonical knowledge store** — the compounding-knowledge substrate: it owns 5 tables, holds two real engines (relevance ranking, attention scoring) that are genuine domain logic not reducible to CRUD, and is the single biggest consumer-magnet in the graph (8 distinct services read/write it: context-assembly, tool-handlers, dispatch, review, capture-writeback, git-export, retention, session-requests). Product purpose: **own knowledge items + their app projection, and serve ranked/relevant/searchable knowledge to every consumer that assembles context or curates the fabric.** Candidate-cluster hypothesis was `[]` (no neighbors) — correct. There is no sibling to fold into and nothing here to dissolve. The AU19 "why separate" claim holds; I do not challenge existence.

**But the number is the finding.** 138 exports for one MVP knowledge store is ~4x what the demand justifies. The inflation is a textbook case of the anti-pattern the frame rejects: **a bespoke `*-store.ts` file carved per consumer edge instead of composing the existing surface.** The AU19 migration added, one increment at a time, `practice-meeting-store` (review), `bet-retro-store` (bets routes), `portfolio-retro-store` (dispatch), `git-export-store` (git-export), `writeback-conflict-store` (capture-writeback), `route-support` (threads/search routes), `conflict-review-store`/`promotion-transition`/`attention-score-store` (tool-handlers). Each is a thin read/write the general repository already covers or nearly covers. The worst offender, `practice-meeting-store`, exports **9 raw table accessors** (`insertKnowledgeItemRaw`, `findKnowledgeItemByIdRaw`, `archiveKnowledgeItemWithLogRaw`, …) that re-implement `create`/`update`/`findById`/`archive` at the raw-Drizzle level — and its own top-of-file `@lore` admits they exist only because `create()`/`update()` "weren't reused" (clock injection + a scopeId-placement quirk). That is a per-caller carve, not a product surface.

## 2. Deliberate Target Public API (138 → ~32)

Seven composable interfaces, each parameterized by intent/filter:

### A. `KnowledgeItems` — the repository (get / list / create / update / remove)
- `get(id, view)` where `view ∈ {summary, detail, projection, version, status}` — **subsumes** findById, findDetailById, findKnowledgeItemProjectionById, findKnowledgeItemVersionById, findKnowledgeItemStatusById, findKnowledgeItemByIdRaw, findKnowledgeAppProjectionByItemIdRaw.
- `list(filter)` where filter carries `{scope?, layers?, topic?, exportable?, capturedScope?, recentByLayers?, visibleWithSignals?, triageVisible?, titlesByIds?, retroForBet?}` — **subsumes** listByScope, list, listVisibleWithSignals, findRelatedByTopic, countTriageVisible, listExportableKnowledgeItems, listRecentByLayers, listCapturedItemsByProjectionScopeRaw, listTitlesByIds, findRetroKnowledgeItemForBet. (count-style callers pass the same filter to a `count` sibling.)
- `create(input)` / `update(id, patch)` / `remove(id)` (soft archive w/ edit-log) — **subsumes** create, update, the 9 practice-meeting raw accessors, upsertBetRetroKnowledgeItem, archiveKnowledgeItemWithLogRaw, touchKnowledgeItemUpdatedAtRaw, the insert/update/upsert projection raws. Review's clock/scopeId quirk becomes two optional `input` fields (`nowMs?`, `scopeOnProjectionOnly?`), not a parallel surface — that is the collapse the frame demands.

### B. `KnowledgeLifecycle` — `transition(id, target, ctx)`
Targets: `promote | archive | flag | markStale | changeScope | merge | split`. Plus `sweep(kind)` for `kind ∈ {autoPromotion, stale}`. **Subsumes** promoteKnowledgeItem, archiveItem, flagItem, markStale, changeScope, mergeItems, splitItem, checkAutoPromotion, detectLayerContradiction, findStaleItems, runAutoPromotionSweep, runStaleSweep and their loose constants.

### C. `KnowledgeSearch` — `search(query, {visibility, opts})`
One entry parameterized by visibility scope. **Subsumes** search, searchByText, searchVisibleByText, ftsSearch, sanitizeFtsQuery. `setupFts` becomes an internal migration hook (not public).

### D. `Relevance` (scoring engine) — `rank(items, ctx)` + `budget(scored, limit)` + `computeScore(input)` + `recomputeAttention(scope)`
The genuine sub-product. **Subsumes** rankAndBudget, scoreItem, computeRelevanceScore, enforceBudget, countTokens/countItemTokens, buildAttentionService, upsertKnowledgeAppProjectionAttentionScore, createRelevanceService, registerRelevanceListener. The ~15 exported scoring **constants + weight loaders** (ATTENTION_THRESHOLD, DEFAULT_RELEVANCE_CONFIG, loadAttentionWeights, loadRelevanceConfig, loadScoringWeights, CONTEXT_WINDOW_TOKENS, KNOWLEDGE_ALLOCATION_RATIO, …) collapse to internal config behind `loadScoringConfig()`.

### E. `KnowledgeConflicts` — `record(input)` + `findOpen(itemId, proposer)`
**Subsumes** createKnowledgeConflict, recordWritebackConflict, findOpenConflictByItemAndProposer. Two consumers (tool-handlers, capture-writeback) want the same capability.

### F. `KnowledgeAccessLog` — `record(input)` + `count(filter)` + `reap(before)`
**Subsumes** recordKnowledgeAccess, countAccessesSince, reapKnowledgeAccessLog.

### G. Shared vocabulary — types + errors + scope
`KnowledgeScope`, `KNOWLEDGE_STATUSES`, `KnowledgeKind/Layer/Status/PropagationLevel`, `ItemDeletedError`, `VersionConflictError`, `communityForRole`. (~8, unchanged — these are genuine shared vocabulary, not per-caller sprawl.)

**Target export count: ~32** (down from 138). Roughly: Items 8, Lifecycle 4, Search 3, Relevance 6, Conflicts 3, AccessLog 3, Vocabulary 5 (+ result/row types folded into interface namespaces).

## 3. Inside Lens
Internally keep the file split that reflects real cohesion (repository, relevance engine, attention engine, promotion pipeline, fts) — that is healthy. What changes is the **barrel**: it stops re-exporting one function per consumer edge and exposes only the seven interfaces. New consumer? It composes `get/list/transition/search`, wiring a DI port to the *general* method — no new file, no new export. The clock/scopeId quirks that spawned parallel raws become explicit optional input fields on `create`, documented once, so behavior variance is data not duplicated code. Scoring weights live behind one loader so tuning is a config change, not an export churn.

## 4. Scaling Argument (sub-linear)
Add a hypothetical "digest" service that wants the 20 most-relevant items for a team scope, and an "audit" service that wants access counts per layer. Under today's API each gets a new `listDigestByTeam` + `countAccessesByLayer` export (method-per-intent → linear growth; that is exactly how 8 consumers produced 138 exports). Under the target: digest calls `list({scope, recentByLayers})` then `Relevance.rank(...).budget(20)`; audit calls `AccessLog.count({groupBy: layer})`. **Zero new methods.** The filter/view/target parameters absorb the new demand. Dozens more services compose from `get(id,view)` / `list(filter)` / `transition(id,target)` / `search(query,vis)` / `rank+budget` — the surface stays ~32 regardless of consumer count. The `list(filter)` vs `listActiveByTeam + listPinnedByHost` heuristic is the whole story here.

## 5. Key Collapses
- **9 practice-meeting raw accessors → fold into `create/get/update/remove`** (review's DI port consumes the general repository; clock/scopeId become input fields). Single biggest reduction.
- **~10 finders/listers (`findById`, `findDetailById`, `listByScope`, `listVisibleWithSignals`, `listExportableKnowledgeItems`, `listRecentByLayers`, `listTitlesByIds`, `findRetroKnowledgeItemForBet`, `findRelatedByTopic`, projection/version/status finders) → `get(id,view)` + `list(filter)`.**
- **6 promotion/lifecycle mutators (`promoteKnowledgeItem`, `archiveItem`, `flagItem`, `changeScope`, `mergeItems`, `splitItem`, `markStale`) + 2 sweeps → `transition(id,target)` + `sweep(kind)`.**
- **~15 relevance/attention/token/scoring-config exports → `rank/budget/computeScore/recomputeAttention` + one internal `loadScoringConfig`.**
- **5 search exports → `search(query,{visibility})`; 3 conflict exports → `record/findOpen`; 3 access-log exports → `record/count/reap`.**
- **Retire the per-consumer store files as public surface** (`bet-retro-store`, `portfolio-retro-store`, `git-export-store`, `route-support`, `writeback-conflict-store`, `conflict-review-store`, `promotion-transition`, `attention-score-store`) — their bodies survive as internal implementation of the seven interfaces; none warrants its own export cluster.
