# Relevance, Attention, and Assembly Scoring

Three scoring engines exist. They answer different questions, consume disjoint inputs, and never collapse into one number:

| Engine | Question | Consumer | Code |
|---|---|---|---|
| **`relevanceScore`** (L22) | "Of the items a user could read right now, which are most worth their attention?" | Knowledge view ranking (`layers/core-ui/src/pages/KnowledgeList.tsx`) | `layers/core-api/knowledge/src/relevance-engine.ts` + `relevance-service.ts` |
| **`attentionScore`** | "Which items need human judgement applied?" | facilitator review-item queue | `layers/core-api/knowledge/src/attention-scoring.ts` |
| **Assembly scoring** | "Which items get loaded into an agent session under the token budget?" | [Knowledge Fabric context assembly](./the-knowledge-fabric-how-knowledge-moves.md) | `layers/core-api/knowledge/src/session-knowledge-assembler.ts` + `token-budget.ts` |

`relevanceScore` and `attentionScore` are separate columns on the `knowledge_app_projection` extension table (`framework/db/src/schema.ts:1004-1021` — O2 moved all strategy signals off `knowledge_items`). A high `relevanceScore` does not imply a high `attentionScore` — the most-accessed item in the system may be perfectly settled and need no human input.

---

## `relevanceScore` — behavioural, server-tracked

Each item's signal set is three fields (`relevance-service.ts:23-30`):

| Field | Source | Meaning |
|---|---|---|
| `lastActivityAt` | max over `knowledge_access_log` and `knowledge_edit_log` (filtered `editor='human'`) | Most recent access, edit, or human validation |
| `accessCount30d` | `COUNT(knowledge_access_log)` over the trailing 30 days | How often was it fetched recently? |
| `citationCount` | always `null` — staged (see below) | Did an agent actually use this knowledge? |

`ageDays` for the recency signal is computed from `knowledge_items.updatedAt`, and only when at least one activity signal exists — a no-data item must not get a recency-only score that looks like real relevance (`relevance-service.ts:149-179`).

### Access tracking is server-side by construction

Every `GET /api/knowledge/:id` 200 response appends one row to `knowledge_access_log` — best-effort, never breaks the read. The 30-day count is queried BEFORE the insert, so the current page-load is excluded from its own signal (AF13, `layers/core-api/src/routes/knowledge.ts`). What does NOT count:

- List and search responses — the user did not open any specific item.
- Knowledge Fabric bulk loads during context assembly — the fabric reads via internal repo calls, not the HTTP route, and would dominate the signal if counted.
- Agent self-report — forbidden. An agent reporting its own access is gameable, the same security shape as agent-writable `meta.impact` (see the @lore in `attention-scoring.ts`).

### The composite formula

Lives in code — `relevance-engine.ts:1-17` carries the formula and `computeRelevanceScore` implements it: weighted sum of recency (exponential half-life decay), frequency (saturating 30-day access count), and citation, normalised by the sum of participating weights. The one non-obvious semantic: **when `citationCount` is null, `w_citation` drops out of the denominator** — null-citation items are not penalized against items with `citationCount = 0`; the absent signal simply doesn't participate. This is what makes staged signal rollout possible without retroactive re-weighting.

### Citation is staged with absent values

`citationCount` / `lastCitedAt` columns exist on `knowledge_app_projection` but stay `null` until a trustworthy source ships. Why staged, not shipped:

1. **No trustworthy source today.** Citation means "the agent actually used this knowledge to produce its output" — a behavioural signal. The fabric knows what it delivered into a session, but delivery is a superset of use.
2. **Self-report is gameable** — same vulnerability as agent-writable `meta.impact`.
3. **The two honest paths are research-grade**: (a) a typed harness tool `readKnowledge(id)` recorded server-side, write-restricted to the harness; (b) post-hoc trace analysis attributing knowledge use from agent reasoning. Both need their own track (L23+).
4. **Forward-compat.** The columns and the composite weight already exist; when a source ships, the value flips from null to populated with no migration churn.

While null, the impact column in the Knowledge view renders `—` (`framework/design-system/src/KnowledgeRow.tsx`).

### Binding anti-fake-zero rule

Any behavioural signal that is `null` renders `—` in the UI — never `0`, never a default, never a fake constant. An item with all signals null gets `relevanceScore = null`, not a score (fake-zero guard, `relevance-engine.ts:72-88`, tested in `knowledge-scoring.test.ts`). The per-kind `IMPACT_BY_KIND` constant this rule replaced was deleted in L22; the do-not-reinstate rationale lives as @lore in `attention-scoring.ts` (kind-based priors made items non-comparable and let a low-trust agent influence scores by crafting item kinds).

### Configuration: fixed constants, not tunable

These weights are fixed constants — `DEFAULT_RELEVANCE_WEIGHTS` and `DEFAULT_RELEVANCE_SHAPE` in `scoring-config.ts:109-115` — with no override path:

```
recency        = 0.4
frequency      = 0.4
citation       = 0.2
recencyHalflifeDays   = 14
frequencySaturation   = 5
frequencyWindowDays   = 30
citationSaturation    = 5
```

`loadRelevanceConfig` always returns these defaults. Changing a weight today means changing the constant and shipping a build. Rationale for the defaults: the 14-day half-life aligns with the knowledge-curation rhythm; frequency saturates at 5 accesses/30d — same shape as the attention engine's `REPETITION_SATURATION`.

---

## `attentionScore` — facilitator queue

When an item's score crosses the threshold upward (prior `< 0.7`, current `>= 0.7`), a review item is created directly (`createReviewItem`, `layers/core-api/knowledge/src/review-item-factory.ts`) — there is no intermediate status change on the knowledge item itself; `needs_human` is gone from the status vocabulary, and `attentionScore` alone drives the crossing. `GET /api/knowledge/triage-count` counts `proposed` items visible to the requester, a distinct surface from the attention-driven review queue. Low score → the [facilitator](./facilitators.md) handles it autonomously. The score is a weighted sum (`scoreAttention`, `attention-scoring.ts`; weights `DEFAULT_ATTENTION_WEIGHTS` in `scoring-config.ts`). These are fixed constants, not DB-tunable:

| Signal | Why it matters | Default weight |
|---|---|---|
| **Novelty** | Have we seen this pattern before? New patterns carry more information. Cohort of 10+ items sharing the same `(parentKind, parentId, scope_id)` — i.e. siblings, in the same scope — → novelty saturates at 0 (`COHORT_NOVELTY_CEILING`, `attention-scoring.ts`). | 0.20 |
| **Impact** | If wrong, how much is affected? **Hardcoded 0 since L22** (per-kind priors deleted); the weight remains for a future trustworthy source. | 0.20 |
| **Conflict** | Open `knowledge_conflicts` row → contradiction forces a choice. | 0.15 |
| **Repetition** | The same `(parentKind, parentId)` pair shown up independently under 5+ other distinct `scope_id` values → saturates; reduces need for human review (`REPETITION_SATURATION`, `attention-scoring.ts`). | 0.10 |
| **Confidence** | High confidence reduces need. | 0.10 |
| **Taste sensitivity** | Brand voice, aesthetics, strategic framing — things agents can't generate. | 0.15 |
| **Recency of review** | Human edit within 7 days → 0; 90+ days without → 1. | 0.05 |
| **Usage frequency** | **Hardcoded 0 until a trustworthy reference-count source exists** (L23+). | 0.05 |

**Cohort identity changed shape, not meaning.** It used to be `(layer, scope_id, topic, kind)` — four flat vocabulary fields, three of which (`layer`, `topic`, `kind`) are deleted. The sibling set — same tree parent, same scope — replaces it: "novel" now means "no sibling under this parent has already said this," and "repeated" means "the same parent's content keeps reappearing across different scopes." Both auto-promotion (below) and the weekly stale sweep use the same sibling grouping.

Both scores read `knowledge_edit_log`, but they are computed and stored separately because they answer different questions and have different consumers.

The facilitator also chooses *what kind* of feedback to ask for:

| Signal | Question to ask |
|---|---|
| Novelty + high impact | "Is this pattern real? Should we make it a rule?" (validation) |
| Conflict | "A and B contradict. Which applies when?" (resolution) |
| Stale but popular | "This is old but still referenced. Still true?" (refresh) |
| Taste-sensitive | "Does this feel right for our brand/customer?" (judgment) |
| Cross-scope promotion | "Should this team's pattern become factory-wide?" (elevation) |

This last column is the real point. Most agent systems either dump everything on humans (inbox hell) or auto-act on everything (drift). The facilitator's job is to ask the *right kind of question* about the *right item* at the *right time* — that's the work that converts information into knowledge.

---

## Assembly scoring and the context budget

Not all knowledge loads into every session. The [Knowledge Fabric](./the-knowledge-fabric-how-knowledge-moves.md) scores candidate items per session and enforces a token budget.

### Scoring factors

Weights (`DEFAULT_WEIGHTS`, `scoring-config.ts:26-31`) are fixed constants, not DB-tunable:

| Factor | Default weight | Semantics |
|---|---|---|
| Tag match | 0.55 | Item title + `meta.tags` vs task tags |
| Recency | 0.20 | 30-day linear decay from `updatedAt` |
| Confidence | 0.15 | Stored `confidence` in [0,1] |
| attentionScore | 0.10 | Feeds the attention engine's output in; null → neutral 0.5 |

Score is normalised to 0–100 (`scoreItem`, `session-knowledge-assembler.ts`). Note the factor set is distinct from the L22 relevanceScore signals — usage frequency is NOT an assembly factor.

**Role match and layer proximity are deleted, not replaced.** `roleMatch` scored against a role→community map that never actually matched seeded data in practice — the fuzzy substring fallback did all the work — and `layerProximity` scored the now-deleted layer ladder. What an agent receives is answered entirely by scope (factory + its team + its own — see [the-canonical-store.md](./the-canonical-store.md#scope-kernel)); there is no subtree-proximity weight standing in for it.

### Budget enforcement

Constants in `scoring-config.ts:33-35`:

```
CONTEXT_WINDOW_TOKENS      = 200,000
KNOWLEDGE_ALLOCATION_RATIO = 0.2   → DEFAULT_KNOWLEDGE_BUDGET = 40,000 tokens
```

`enforceBudget` (`token-budget.ts:30-71`) fills greedily by score descending against that single flat budget — with one exception: **factory-scoped items are always included first, non-negotiable, even over budget** (`scopeKind === 'factory'` — the same "everyone always gets this" rule the old `layer === 'L4'` check used to express). There is no further zone-level split — that's the whole allocation. The budget is generous by design; the real filter is relevance. The cap exists to prevent degenerate cases (a scope with thousands of items) from blowing up session costs.
