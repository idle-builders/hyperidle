# Relevance, Attention, and Assembly Scoring

Three scoring engines exist. They answer different questions, consume disjoint inputs, and never collapse into one number:

| Engine | Question | Consumer | Code |
|---|---|---|---|
| **`relevanceScore`** (L22) | "Of the items a user could read right now, which are most worth their attention?" | Knowledge view ranking (`packages/web/src/pages/KnowledgeList.tsx`) | `packages/fabric/src/relevance-engine.ts` + `services/relevance-service.ts` |
| **`attentionScore`** | "Which items need human judgement applied?" | needs-human triage queue | `packages/fabric/src/attention-scoring.ts` |
| **Assembly scoring** | "Which items get loaded into an agent session under the token budget?" | [Knowledge Fabric context assembly](./the-knowledge-fabric-how-knowledge-moves.md) | `packages/fabric/src/relevance-scoring.ts` + `token-budget.ts` |

`relevanceScore` and `attentionScore` are separate columns on the `knowledge_strategy_fabric` extension table (`packages/db/src/schema.ts` — O2 moved all strategy signals off `knowledge_items`). A high `relevanceScore` does not imply a high `attentionScore` — the most-accessed item in the system may be perfectly settled and need no human input.

---

## `relevanceScore` — behavioural, server-tracked

Each item's signal set is three fields (`relevance-service.ts:27-34`):

| Field | Source | Meaning |
|---|---|---|
| `lastActivityAt` | max over `knowledge_access_log` and `knowledge_edit_log` (filtered `editor='human'`) | Most recent access, edit, or human validation |
| `accessCount30d` | `COUNT(knowledge_access_log)` over the trailing 30 days | How often was it fetched recently? |
| `citationCount` | always `null` — staged (see below) | Did an agent actually use this knowledge? |

`ageDays` for the recency signal is computed from `knowledge_items.updatedAt`, and only when at least one activity signal exists — a no-data item must not get a recency-only score that looks like real relevance (`relevance-service.ts:152-177`).

### Access tracking is server-side by construction

Every `GET /api/knowledge/:id` 200 response appends one row to `knowledge_access_log` — best-effort, never breaks the read. The 30-day count is queried BEFORE the insert, so the current page-load is excluded from its own signal (AF13, `packages/server/src/routes/knowledge.ts`). What does NOT count:

- List and search responses — the user did not open any specific item.
- Knowledge Fabric bulk loads during context assembly — the fabric reads via internal repo calls, not the HTTP route, and would dominate the signal if counted.
- Agent self-report — forbidden. An agent reporting its own access is gameable, the same security shape as agent-writable `meta.impact` (see the @lore in `attention-scoring.ts`).

### The composite formula

Lives in code — `relevance-engine.ts:1-17` carries the formula and `computeRelevanceScore` implements it: weighted sum of recency (exponential half-life decay), frequency (saturating 30-day access count), and citation, normalised by the sum of participating weights. The one non-obvious semantic: **when `citationCount` is null, `w_citation` drops out of the denominator** — null-citation items are not penalized against items with `citationCount = 0`; the absent signal simply doesn't participate. This is what makes staged signal rollout possible without retroactive re-weighting.

### Citation is staged with absent values

`citationCount` / `lastCitedAt` columns exist on `knowledge_strategy_fabric` but stay `null` until a trustworthy source ships. Why staged, not shipped:

1. **No trustworthy source today.** Citation means "the agent actually used this knowledge to produce its output" — a behavioural signal. The fabric knows what it delivered into a session, but delivery is a superset of use.
2. **Self-report is gameable** — same vulnerability as agent-writable `meta.impact`.
3. **The two honest paths are research-grade**: (a) a typed harness tool `readKnowledge(id)` recorded server-side, write-restricted to the harness; (b) post-hoc trace analysis attributing knowledge use from agent reasoning. Both need their own track (L23+).
4. **Forward-compat.** The columns and the composite weight already exist; when a source ships, the value flips from null to populated with no migration churn.

While null, the impact column in the Knowledge view renders `—` (`packages/design-system/src/KnowledgeRow.tsx`).

### Binding anti-fake-zero rule

Any behavioural signal that is `null` renders `—` in the UI — never `0`, never a default, never a fake constant. An item with all signals null gets `relevanceScore = null`, not a score (fake-zero guard, `relevance-engine.ts:72-88`, tested in `relevance-engine.test.ts`). The per-kind `IMPACT_BY_KIND` constant this rule replaced was deleted in L22; the do-not-reinstate rationale lives as @lore in `attention-scoring.ts` (kind-based priors made items non-comparable and let a low-trust agent influence scores by crafting item kinds).

### Configuration: DB, never source

Seven keys in `factory_settings` under the `relevance.` prefix (`scoring-config.ts:201-211`):

```
relevance.weight.recency        = "0.4"
relevance.weight.frequency      = "0.4"
relevance.weight.citation       = "0.2"
relevance.recencyHalflifeDays   = "14"
relevance.frequencySaturation   = "5"
relevance.frequencyWindowDays   = "30"
relevance.citationSaturation    = "5"
```

Source constants (`DEFAULT_RELEVANCE_CONFIG`) are bootstrap fallback only; invalid values fall back to defaults (defense in depth — a bad write can never silently break the engine). Tuning takes effect on the next batch: no rebuild, no env vars. Rationale for the defaults: the 14-day half-life aligns with the weekly knowledge-curation rhythm; frequency saturates at 5 accesses/30d — same shape as the attention engine's `REPETITION_SATURATION`.

**Known gap:** the spec's mandate that the settings write endpoint reject agent writes to `relevance.*` keys was never implemented. Currently vacuous — no endpoint writes those `factory_settings` keys at all (settings PATCH writes `server_config`) — but the moment one appears, human-write-only must be enforced.

---

## `attentionScore` — facilitator queue

When an item's score crosses the threshold, it enters the needs-human triage surface (`GET /api/knowledge/triage-count`, status `needs_human`). Low score → the [facilitator](./facilitators.md) handles it autonomously. The score is a weighted sum (`scoreAttention`, `attention-scoring.ts`; default weights `DEFAULT_ATTENTION_WEIGHTS` in `scoring-config.ts:112-121`, tunable via `factory_settings` `attention.weight.*`):

| Signal | Why it matters | Default weight |
|---|---|---|
| **Novelty** | Have we seen this pattern before? New patterns carry more information. Cohort of 10+ identical (layer, scope, topic, kind) items → novelty saturates at 0. | 0.20 |
| **Impact** | If wrong, how much is affected? **Hardcoded 0 since L22** (per-kind priors deleted); the weight remains for a future trustworthy source. | 0.20 |
| **Conflict** | Open `knowledge_conflicts` row → contradiction forces a choice. | 0.15 |
| **Repetition** | Shown up independently in 5+ other scopes → saturates; reduces need for human review. | 0.10 |
| **Confidence** | High confidence reduces need. | 0.10 |
| **Taste sensitivity** | Brand voice, aesthetics, strategic framing — things agents can't generate. | 0.15 |
| **Recency of review** | Human edit within 7 days → 0; 90+ days without → 1. | 0.05 |
| **Usage frequency** | **Hardcoded 0 until a trustworthy reference-count source exists** (L23+). | 0.05 |

Both scores read `knowledge_edit_log`, but they are computed and stored separately because they answer different questions and have different consumers.

The facilitator also chooses *what kind* of feedback to ask for:

| Signal | Question to ask |
|---|---|
| Novelty + high impact | "Is this pattern real? Should we make it a rule?" (validation) |
| Conflict | "A and B contradict. Which applies when?" (resolution) |
| Stale but popular | "This is old but still referenced. Still true?" (refresh) |
| Taste-sensitive | "Does this feel right for our brand/customer?" (judgment) |
| Cross-layer promotion | "Should this practice become a team-wide principle?" (elevation) |

This last column is the real point. Most agent systems either dump everything on humans (inbox hell) or auto-act on everything (drift). The facilitator's job is to ask the *right kind of question* about the *right item* at the *right time* — that's the work that converts information into knowledge.

---

## Assembly scoring and the context budget

Not all knowledge loads into every session. The [Knowledge Fabric](./the-knowledge-fabric-how-knowledge-moves.md) scores candidate items per session and enforces a token budget.

### Scoring factors

Default weights (`DEFAULT_WEIGHTS`, `scoring-config.ts:24-31`; overridable per-key via `factory_settings` `scoring.weight.*`):

| Factor | Default weight | Semantics |
|---|---|---|
| Tag match | 0.35 | Item tags vs task tags |
| Role match | 0.15 | Item role vs agent role |
| Recency | 0.15 | 30-day linear decay from `updatedAt` |
| Confidence | 0.10 | Stored `confidence` in [0,1] |
| Layer proximity | 0.15 | session (L0) 1.0 → L1 0.9 → L2 0.7 → L3 0.5 → L4 0.3 — layer definitions in [the-five-layers](./the-five-layers.md) |
| attentionScore | 0.10 | Feeds the attention engine's output in; null → neutral 0.5 |

Score is normalised to 0–100 (`scoreItem`, `relevance-scoring.ts`). Note the factor set is distinct from the L22 relevanceScore signals — usage frequency is NOT an assembly factor.

### Budget enforcement

Constants in `scoring-config.ts:33-44`:

```
CONTEXT_WINDOW_TOKENS      = 200,000
KNOWLEDGE_ALLOCATION_RATIO = 0.2   → DEFAULT_KNOWLEDGE_BUDGET = 40,000 tokens

BUDGET_ALLOCATION:
  task     0.4   (tool calls, reasoning, code)
  session  0.3   (task state, handoffs, bet context)
  general  0.2   (L2+L3 practices, product docs)
  factory  0.1   (L4 context)
```

`enforceBudget` (`token-budget.ts:30-71`) fills greedily by score descending — with one exception: **L4 items are always included first, non-negotiable, even over budget**. The budget is generous by design; the real filter is relevance. The cap exists to prevent degenerate cases (a scope with thousands of items) from blowing up session costs.
