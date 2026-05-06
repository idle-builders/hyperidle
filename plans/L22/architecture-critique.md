# L22 Architecture Critique — Three relevance signals as first-class data

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:8 LI:9 AC:6 DM:8 N:8 MD:8 FMC:7 S:8 V:8

## Scoring Breakdown

### 1. Spec Alignment: 8/10

All 9 ACs from TRACK-L.md map to plan tasks. The 11-AC verification table (Section 10) covers the 9 plus two hygiene items (L6 inventory closure, verify green). Task ordering is logical. No scope-creep tasks are present -- every task traces to an AC or a forced dependency (schema before service before endpoint before UI).

One gap: AC says "The fabric's attention scoring is rewritten so frequency comes from real access tracking." The plan (Section 3.3) zeroes out both `computeImpact` and `computeUsage` but does NOT rewrite the `usage` signal in `scoreAttention` to read from the access log. The plan's chosen Option B keeps `usage` as a dead zero. This is arguably correct since `relevanceScore` now owns the frequency signal, but the AC literally says "frequency comes from real access tracking" in the attention scoring context. The plan should explicitly note that frequency is served by the new `relevanceScore`, not by a rewritten attention signal, and that the AC is satisfied through the new engine, not through patching the old one.

### 2. Layer Integrity: 9/10

Clean separation. The fabric package owns the pure scoring function. The server package owns the DB-touching service. The web package owns the rendering and URL state. The shared package owns the cross-boundary types. No layer reaches past its neighbor.

One minor note: `KnowledgeItemWithSignals` in `packages/shared/src/types.ts` (Section 2.2) duplicates all base fields from the DB `KnowledgeItem` type. This creates a maintenance burden -- when a column is added to `knowledge_items`, both `schema.ts` and `shared/types.ts` must be updated. The alternative (extending the DB type) would violate layer integrity (shared should not depend on db). The plan's approach is correct but the duplication should be flagged with a `@lore` comment.

### 3. API Contracts: 6/10

This is the weakest dimension. Several contract gaps:

**List endpoint response shape mismatch.** The current `GET /:layer` returns `{ layer, groups: { [topic]: { [kind]: items[] } } }`. The plan (Section 4.3) says "Fetch items as today, annotate with signals, return items with signals field attached." But the plan does not specify the response shape change. Will the grouped structure persist with signals added to each nested item? Or will a flat list be returned for Triage? The Triage tab needs a flat sorted list; the Curated tab needs grouped data. The plan does not resolve this tension.

The plan should specify: either (a) the list endpoint returns a flat array alongside the grouped structure (`{ layer, groups, items: ItemWithSignals[] }`), or (b) a query parameter (`?view=triage`) returns a flat list, or (c) the frontend extracts and flattens items from the grouped response. Option (c) is simplest and keeps the endpoint backward-compatible.

**Missing request/response shapes for modified endpoints.** Section 4.1 shows the access-log insertion code but does not specify the response shape change for `GET /:layer/:id`. Does the response now include the `signals` field on the single item? The plan's `KnowledgeItemWithSignals` type (Section 2.2) suggests yes, but this is not stated explicitly.

**Search endpoint ambiguity.** Section 7 (Route checklist) says `GET /api/knowledge/search` "Optionally annotate results with signals (or defer to list endpoint)." This should be decided, not deferred. If deferred, say "NOT annotated in L22" so the builder does not have to make that call.

### 4. Data Model Alignment: 8/10

Schema matches the L5 spec field-by-field. The `knowledge_access_log` table has the correct columns (`id`, `item_id`, `accessor_kind`, `accessor_id`, `accessed_at`). The composite index `(item_id, accessed_at)` correctly serves both recency (MAX) and frequency (COUNT with range filter) queries. FK with ON DELETE RESTRICT matches the `knowledge_edit_log` pattern and the I3 lore about audit logs outliving their subjects.

The plan correctly adds `relevanceScore`, `citationCount`, `lastCitedAt` as nullable columns on `knowledge_items`. The denormalize-only-relevanceScore decision (Option B) is sound -- freshness is the point, and the access/edit logs are small enough that per-request queries are cheap.

Migration numbering is correct: SQLite 0012 (after 0011_cost_tokens_l17), PostgreSQL 0010 (after 0009_cost_tokens_l17).

One issue: the plan's schema (Section 1.1) uses `onDelete: "restrict"` on the FK, matching the edit-log pattern. Good. But the plan does not specify an index on `knowledge_items.relevanceScore` for sorting. The list endpoint will sort by `relevanceScore` descending (per the design), and without an index the sort is a full-table scan. For small tables (<1000 items) this is fine, but the plan should note why no index is needed (table size) or add one.

### 5. Naming: 8/10

Names are honest and distinct. `relevance-engine.ts` vs `relevance-scoring.ts` is the right distinction (user-facing vs materialization scorer), and the plan explicitly calls out the naming boundary with a `@lore` comment requirement. `computeRelevanceScore` is unambiguous. `RelevanceWeights`, `RelevanceShapeConstants`, `RelevanceConfig` follow the established pattern from `AttentionWeights`.

`RelevanceService` (Section 4.2) is a service name, which is generic, but it follows the established `attention-service.ts` pattern. Acceptable.

The `KnowledgeAccessorKind` type ("human" | "agent") is a closed enum matching the spec's closed vocabulary.

### 6. Module Depth: 8/10

Good depth. The `computeRelevanceScore` function is pure and hides the formula complexity behind a simple `(input, config) => number | null` interface. The `RelevanceService` has two methods (`computeSignals`, `recomputeScores`) that serve distinct consumers (list enrichment and batch refresh). The config loader follows the established `loadAttentionWeights` pattern -- same interface shape, same defense-in-depth.

The `KnowledgeItemWithSignals` type (Section 2.2) is broad -- it redeclares every DB field. This is interface surface that could be narrower (e.g., `KnowledgeItem & { signals: KnowledgeRelevanceSignals }`), but the plan explains the layer-integrity reasoning.

### 7. Failure-Mode Coverage: 7/10

Security block (Section 8) is thorough. Rate-limiting on access-log creation is addressed (global API limit is sufficient). Agent write guard on `relevance.*` settings is addressed. Accessor identity from auth context (not request body) prevents spoofing.

Gaps:

**`lastValidatedAt` derivation mismatch.** The L5 spec (line 18) says `lastValidatedAt` comes from `knowledge_edit_log filtered to editor='facilitator' OR status transitions into validated`. The plan (Section 4.2) says `editor = "human" or "facilitator" edits`. But the existing codebase (`attention-scoring.ts:306`) filters on `editor='human'` only -- no `facilitator` value exists in the current editor vocabulary. The plan should specify which editor values count as "validation" events and note whether `facilitator` is already a valid editor value or needs to be added. If only `human` exists today, the plan should use `human` and note the `facilitator` value as a future-compat item.

**Synchronous write failure.** Section 4.1 chooses synchronous access-log insertion. If the INSERT fails (e.g., FK constraint violation on a deleted item racing with the GET), the handler will throw and return a 500 to the user even though the item was successfully fetched. The plan should specify: either (a) wrap the INSERT in a try-catch and swallow failures (the access log is non-essential -- the user should still see their item), or (b) accept the failure. Option (a) is better and is one line of code.

**`computeSignals` with empty input.** The plan does not specify behavior when `itemIds` is empty. The batch queries would return empty results, which is fine, but the builder should handle this edge case explicitly to avoid unnecessary DB round-trips.

### 8. Simplicity / Over-Engineering Risk: 8/10

The plan is lean. No feature flags, no abstract base classes, no plugin points. The design-it-twice sections are genuine:
- Section 1.3 (denormalized signals vs computed-at-query) has real trade-offs. Option B wins on freshness.
- Section 3.3 (remove vs zero AttentionWeights) has real trade-offs. Option B (zero) is the simpler migration.

Both chosen options favor simplicity. The plan resists the urge to generalize (no generic "signal framework", no observer pattern for recompute triggers).

One minor concern: `KnowledgeItemWithSignals` (Section 2.2) manually lists all DB fields rather than using an intersection or Omit type. This is verbose but avoids a cross-package dependency. Acceptable.

### 9. Verifiability: 8/10

Each AC has a concrete verification method with assertion specifics:
- AC-1: create item, fetch 3 times, assert 3 access-log rows + correct signals.
- AC-4: golden fixtures with 5 input combinations to 6 decimal places.
- AC-8: assert null inputs return null score, not 0.

Protected-tests list (Section 9) is populated and distinguishes between frozen tests and tests that will need updates. The modified-tests list correctly identifies `attention-scoring.test.ts` (golden values change), `scoring-config.test.ts` (new loader tests), and `knowledge-data.test.ts` (fixture shape).

One concern: AC-7 ("sort changes re-order the list") has a weak E2E verification: "Assert they may differ (if test data has different orderings). At minimum, assert the sort button state changes." The "may differ" hedge means the test could pass even if sorting is broken, if the test data happens to have the same order for all sorts. The verification should seed data with deliberately different orderings so the assertion is deterministic.

---

## CRITICAL
(none)

## WARNING

- [plan Section 4.3] **List endpoint response shape undefined.** The current `GET /:layer` returns `{ layer, groups: { [topic]: { [kind]: items[] } } }` (see `knowledge.ts:182-200`). The plan says "annotate response items with computed signals" but does not specify how the grouped response structure is adapted for the Triage tab's need for a flat sorted list. The builder must decide: return a parallel flat array, add a query param, or flatten client-side. Fix: Add a paragraph to Section 4.3 specifying the approach. Recommendation: return an additional `items` field alongside `groups` in the response (`{ layer, groups, items: KnowledgeItemWithSignals[] }`) so Triage reads `items` and Curated reads `groups`. Alternatively, the Triage tab can fetch `GET /:layer` and flatten the groups client-side, but that should be stated explicitly.

- [plan Section 4.2] **`lastValidatedAt` editor filter ambiguity.** The spec says `editor='facilitator' OR status transitions into validated`. The plan says `editor = "human" or "facilitator" edits`. The codebase uses `editor='human'` (attention-scoring.ts:306); the value `facilitator` does not appear in any existing data. Fix: Specify the exact SQL filter. If `facilitator` is not yet a valid editor value, use `editor='human'` for L22 and add a `@lore` noting that facilitator-agent validation events will use a different editor value when that role is wired. Alternatively, filter `editType IN ('validated', 'status_change')` if the edit_type column carries that information.

- [plan Section 4.1] **Synchronous INSERT failure path unspecified.** The access-log INSERT after a successful item fetch could fail (e.g., race with item deletion). The plan should specify that the INSERT is wrapped in a try-catch with the failure swallowed (access log is non-essential -- the user must still receive the 200 with the item). Fix: Add one sentence: "The INSERT is wrapped in try-catch; failures are logged but do not affect the response."

## SUGGESTION

- [plan Section 10, AC-7] **Weak sort E2E assertion.** The current verification says "Assert they may differ." Seed two items with distinct `lastActivityAt` and `accessCount30d` values so that relevance sort and recency sort produce provably different orderings. Then assert the first item title changes between sorts.

- [plan Section 1.2] **Missing index on `relevance_score`.** The Triage tab sorts items by `relevanceScore` descending. For the current corpus (<1000 items) this is trivially fast, but consider adding `CREATE INDEX "ki_relevance_desc_idx" ON "knowledge_items" ("relevance_score")` to the migration for consistency with the existing `ki_attention_desc_idx` on `attentionScore`. This costs nothing and prevents a future performance discovery.

- [plan Section 2.2] **`KnowledgeItemWithSignals` field duplication.** The type manually redeclares all DB columns from `KnowledgeItem`. Add a `@lore` comment noting that this is intentional to avoid a shared-to-db dependency, and that when fields are added to `knowledge_items`, both types must be updated in lockstep.

- [plan Section 7] **Search endpoint decision deferred.** "Optionally annotate results with signals (or defer to list endpoint)" is a decision the builder should not make. Fix: State "GET /search does NOT return signals in L22. Signal enrichment on search results is a follow-up."

- [plan Section 5.4] **`setSearchParams` destructuring.** The current `KnowledgeList.tsx` uses `const [searchParams] = useSearchParams()` (read-only). The plan's sort handler requires `const [searchParams, setSearchParams] = useSearchParams()`. This is trivial but worth noting so the builder does not miss the second destructured element.

## What's Working Well

- **The denormalize-only-relevanceScore decision (Section 1.3) is genuinely well-reasoned.** The two options have real trade-offs, Option B is the right call for a freshness-first feature, and the ~20ms cost estimate is grounded. This is what design-it-twice should look like.

- **The protected-tests / modified-tests split (Section 9) is unusually precise.** Most plans either omit this entirely or list everything as protected. This plan correctly identifies that `attention-scoring.test.ts` golden values will change (because `computeImpact` is deleted) while `attention-context.test.ts` is frozen (the context builder is unchanged). This level of specificity prevents the builder from accidentally weakening existing test contracts.

## Verdict

Score 7/10. Meets the threshold to advance. The three WARNINGs are specification-level gaps that can be fixed in the plan with 2-3 additional paragraphs, not structural redesigns. The plan's core decisions (Option B denormalization, Option B attention-weight zeroing, synchronous access tracking, client-side sorting) are all sound. The list-endpoint response shape (WARNING 1) is the most important gap to clarify before the builder starts T7/T9.
