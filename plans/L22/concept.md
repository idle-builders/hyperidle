# L22 — Concept: inherited from L5, no new nouns

## Status

Concept inherited. No new primitives, no reshaped concepts. L22 is a pure implementation story consuming contracts locked by L5.

## Nouns assessed

| Noun | Classification | Authority |
|---|---|---|
| `relevanceScore` | Stable | `docs/knowledge-architecture/relevance-and-attention.md` lines 5-6, 26-47 |
| `knowledge_access_log` | Stable | Same doc lines 20-23; L5 architecture D5 |
| `recencySignal` / `frequencySignal` / `citationSignal` | Stable | Same doc lines 27-47; L5 architecture D2 |
| `attentionScore` | Stable, unchanged | Same doc line 103 |
| `factory_settings` (relevance.* keys) | Stable | Same doc lines 83-99; L5 architecture D4 |

None of the L22 acceptance criteria introduce a noun that L5 did not already define. The UI-level patterns (sort-by-URL-state, absent-signal dash rendering) are interaction conventions, not domain concepts.

## Required reading for downstream agents

Downstream `/design` and `/architecture` must read:

1. `docs/knowledge-architecture/relevance-and-attention.md` — the authoritative spec (formula, signals, anti-pattern rule, configuration, staged citation)
2. `plans/L5/architecture.md` — L5's decision log (D1-D6: citation staged, composite formula, defaults, config source, access tracking, naming)
3. `plans/L5/concept.md` — L5's concept summary
4. `plans/reviews/hardcoded-data-inventory.md` — L22-owned rows (IMPACT_BY_KIND, MOCK_KNOWLEDGE_ITEMS attentionScore + whyNow)
5. `packages/fabric/src/attention-scoring.ts` — IMPACT_BY_KIND (to delete), computeUsage (to rewrite), scoreAttention, buildAttentionContext
6. `packages/fabric/src/scoring-config.ts` — loadAttentionWeights pattern (template for loadRelevanceWeights)
7. `packages/fabric/src/relevance-scoring.ts` — existing materialization scorer (NOT the L22 user-facing one; understand boundary)
8. `packages/db/src/schema.ts` — knowledgeItems (lines 321-351), knowledgeEditLog (lines 353-368), factorySettings (lines 313-317)
9. `packages/server/src/routes/knowledge.ts` — GET /:layer/:id handler (lines 202-222, access-tracking insertion point)
10. `packages/server/src/services/attention-service.ts` — recompute methods (pattern for relevance recompute)
11. `packages/web/src/pages/KnowledgeList.tsx` — current sort by attentionScore, MOCK_KNOWLEDGE_ITEMS import
12. `packages/web/src/fixtures/knowledge-data.ts` — MockKnowledgeItem shape (attentionScore, whyNow fields to replace)
13. `packages/design-system/src/KnowledgeRow.tsx` — current props (caption, timestamp; no signal columns yet)
14. `packages/shared/src/types.ts` — KnowledgeKind, KnowledgeStatus, KnowledgeScope

## Contracts (inherited from L5, restated for reference)

- **Cardinality:** One relevanceScore per knowledge_items row. Many knowledge_access_log rows per item.
- **Closure:** The three-signal set (recency, frequency, citation) is closed by L5. Adding a fourth signal requires a spec update.
- **Mutability:** relevanceScore is recomputed, not user-editable. knowledge_access_log is append-only. Configuration weights are human-write-only in factory_settings.
- **Identity:** knowledge_access_log rows are identified by (item_id, accessed_at, accessor). relevanceScore is a derived column, not independently identified.
- **Hard rules:**
  - Absent signals render `---`, never 0 or a fake constant.
  - IMPACT_BY_KIND is deleted; it is the bug this spec fixes.
  - Agent writes to `relevance.*` factory_settings keys are rejected.
  - Materialization does NOT count as access (fabric loads via internal repo calls, not HTTP).
  - Client analytics and agent self-report are forbidden signal sources.

## Cross-references

- L5 spec: `docs/knowledge-architecture/relevance-and-attention.md`
- L5 plan: `plans/L5/architecture.md`
- Improvements: `plans/reviews/improvements-knowledge.md` #1
- Hardcoded inventory: `plans/reviews/hardcoded-data-inventory.md` (L22 rows)
