# G2 — Attention Scoring Engine — Plan

Work package: `docs/work-packages/TRACK-G.md` §G2
Worktree: `/workspace/.worktrees/G2`
Depends on: G1 (`score_attention` tool stub, facilitator seeds), B1 (`knowledge_items` table).

---

## 1. Context

An attention score tells the facilitators which knowledge items deserve human eyes. G1 shipped a stub `score_attention` tool that accepts a caller-supplied score in `[0,1]` and writes it to either `knowledge_items.attentionScore` (real, 0–1) or `items.attentionScore` (integer, 0–100). The semantics of what a score *means* were deferred to G2.

G2 fills that gap: a deterministic, fast, pure function that combines the eight signals from `KNOWLEDGE_ARCHITECTURE.md` §9 into a single score in `[0,1]`, a batch recomputation entry point, and a threshold-crossing hook that drops a review `items` row into Conversations/Knowledge — which in turn fires `item_created` (the event the UI already listens to). No new domain event, no new table.

The Knowledge view's "Triage" sort-by-attention-score (`HUMAN_INTERFACE_LAYER.md` §4.4; `INFORMATION_ARCHITECTURE.md` row 298) reads `knowledge_items.attentionScore` directly — it does not need a new signal to render. The `item_created` path is how the *Conversations* view learns that a knowledge item needs a human decision.

---

## 2. Constraints (from source)

- **Existing columns are authoritative.** `knowledge_items.attentionScore REAL`, `knowledge_items.confidence REAL`, `knowledge_items.status`, `knowledge_items.updated_at`, `knowledge_items.kind`, `knowledge_items.topic`, `knowledge_items.scope_id`, `knowledge_items.meta TEXT` (JSON). No schema migration is introduced by G2.
- **`status` values are lowercase** (`captured|provisional|validated|active|stale|archived` — `types.ts`). G2 reads them; never writes them.
- **`KnowledgeKind` is a fixed union** (`pattern|anti_pattern|brief|principle|decision|failure|reflection|focus` — `types.ts`). G2's taste-sensitivity classification must map within this set — we do not introduce new kinds.
- **Events** live in `packages/shared/src/events.ts` as a closed discriminated union. G2 does not add a new event type. It relies on the existing `item_created` fired by `createItemTool`.
- **Weights in `factory_settings`** — follow the `packages/fabric/src/scoring-config.ts` pattern with prefix + key naming (we reuse the `SETTING_PREFIX` idea but with a distinct namespace).
- **Existing `relevance-scoring.ts` is the RELEVANCE scorer**, not attention. We must not conflate. G2 adds a *sibling* module — nothing in `relevance-scoring.ts` is modified.
- **Tool boundary stays stable.** `score_attention`'s public input schema (`target`, `id`, `score`) is already callable from agents. G2 does not change the schema; it adds an optional `reason` passthrough already noted in the G1 plan's open questions and leaves the caller-supplies-a-number behavior in place as the "manual override" path (see §3.7).
- **Performance budget.** 1000 items scored in < 1 second on the test runner (AC6). This rules out per-item secondary SELECTs against SQLite — cross-product repetition must be computed in a single aggregated query and fed into the scorer as context.
- **TypeScript strict.** No `any`, explicit return types on exports, no raw SQL outside migrations, no `console.log` in production code.
- **Imports cross package via workspace aliases** (`@hyperidle/db`, `@hyperidle/shared`, `@hyperidle/fabric`). No new barrel files.

---

## 3. Design

### 3.1 Module location

**Decision: `/workspace/packages/fabric/src/attention-scoring.ts`.** Co-locate with `relevance-scoring.ts` and `scoring-config.ts`.

Justification:
- **Fabric already owns knowledge-domain scoring.** `relevance-scoring.ts`, `scoring-config.ts`, `token-budget.ts`, and `role-community-map.ts` form a coherent "knowledge scoring" cluster in `packages/fabric/src/`. Attention is another view of knowledge signals (novelty vs the corpus, confidence vs the row, taste-sensitivity vs kind) — the same shape of function, the same input type `KnowledgeItem`, the same output `number`.
- **Server stays a thin wrapper.** `packages/server/` already keeps scoring logic out of itself — `create-item.ts`, `score-attention.ts`, and the routes import fabric functions. Putting the engine in `server/services/` would invert that dependency and duplicate access patterns already solved in fabric (factory-settings loader, `KnowledgeItem` repo).
- **Co-located tests.** `packages/fabric/src/__tests__/relevance-scoring.test.ts` is the reference test style (pure function, deterministic, table-driven). `attention-scoring.test.ts` sits beside it.
- **Cross-layer isolation preserved.** G1's `score_attention` skill tool (in `packages/server/src/skill-tools/`) may import from fabric to compute a score — that direction (server → fabric) is already the established dependency.

The threshold-crossing side effect (creating an `items` row and firing `item_created`) is not pure — that lives in a separate `packages/server/src/services/attention-service.ts` thin wrapper (see §3.5). The pure scorer stays in fabric.

### 3.2 The eight signals

From `KNOWLEDGE_ARCHITECTURE.md` §9. Each signal is a pure function producing a value in `[0,1]`. Column-level derivation is preferred over secondary queries.

| # | Signal | Source | Derivation |
|---|--------|--------|------------|
| 1 | **Novelty** | column + meta | `1 - min(1, cohortSize / COHORT_NOVELTY_CEILING)` where `cohortSize` is the count of items in the same (`layer`, `scope_id`, `topic`, `kind`) cohort, computed once per batch in `ScoringContext`. Single row → 1.0, many-duplicates cohort → 0.0. |
| 2 | **Impact** | meta + kind | Driven by `kind` and `meta.impactHint`. `principle` → 1.0, `pattern`/`anti_pattern` → 0.8, `decision` → 0.6, `failure` → 0.7, `reflection` → 0.4, `brief`/`focus` → 0.5. Caller may override via `meta.impact` (number 0–1); if present it wins. |
| 3 | **Conflict** | secondary query (batched) | From `knowledge_conflicts` where `itemId = item.id AND status = 'open'`. Computed once per batch as `Set<string>` of conflicted ids; signal is `1.0` if present, `0.0` otherwise. |
| 4 | **Repetition** | secondary query (batched) | Same-topic / same-kind count across OTHER `scope_id` values (cross-product/community repetition). Computed once per batch in the cohort aggregate. Signal = `min(1, (crossScopeCount - 1) / REPETITION_SATURATION)`. **Inverse contribution** — entering as a negative weight reduces need for human (per KA §9 "reduces need" column). |
| 5 | **Confidence** | column | `max(0, min(1, item.confidence ?? 0.5))`. **Inverse contribution** — high confidence reduces need. |
| 6 | **Taste sensitivity** | kind + topic + scope_id | Boolean gate (0 or 1) with scoring classifier (`attention-classifier.ts`, pure): taste-sensitive if `kind` ∈ `{brief, principle}` OR `topic` ∈ `{brand, voice, tone, positioning, aesthetics, customer-taste, strategy}` OR `scope_id === 'brand'` OR the assigned agent role is `brand_voice`. Brand/voice matches dominate technical details (AC2). |
| 7 | **Recency of review** | column + edit log | `recentlyReviewed` boolean computed once per batch from `knowledge_edit_log` where `editor = 'human' AND created_at > now - REVIEW_RECENCY_WINDOW`. Signal = `0` if in that set, else a monotonically increasing function of days-since-last-human-edit up to `REVIEW_RECENCY_SATURATION` (90 days by default). Matches AC3 directly. |
| 8 | **Usage frequency** | meta | From `meta.usageCount` (integer, maintained by materialization engine / query-practice tool — already populated elsewhere). Signal = `min(1, usageCount / USAGE_SATURATION)`. If missing, `0.0`. |

All constants live as module-scope `const`s named `COHORT_NOVELTY_CEILING`, `REPETITION_SATURATION`, `USAGE_SATURATION`, `REVIEW_RECENCY_WINDOW_MS`, `REVIEW_RECENCY_SATURATION_MS`, with inline rationale comments. Defaults:

```
COHORT_NOVELTY_CEILING       = 10          // 10+ identical (layer, scope, topic, kind) → novelty = 0
REPETITION_SATURATION        = 5           // 5+ other scopes with same topic/kind → repetition = 1
USAGE_SATURATION             = 20          // 20+ uses → usage signal saturates
REVIEW_RECENCY_WINDOW_MS     = 7*24h       // human edit in last 7 days → recency signal = 0
REVIEW_RECENCY_SATURATION_MS = 90*24h      // 90+ days since human edit → recency signal = 1
ATTENTION_THRESHOLD          = 0.7         // AC4
```

### 3.3 Storage of factors — compute on demand, do NOT persist per-signal

Not storing per-signal values in `meta`. Reasons:
- **Determinism is per-call.** AC5 says same inputs → same output; it does not say "same snapshot". Persisting signals would invite stale-signal bugs (novelty computed against yesterday's corpus).
- **Batch performance already fits.** With batched secondary queries, 1000 items score in the time of (a) one pass over the array + (b) three aggregate SQL queries (conflicts set, cohort counts, recent-human-edit set). See §3.4 — measured mentally at well under the 1 s budget on SQLite in WAL mode. Persisting signals would add 1000 writes per recompute — slower, not faster.
- **Schema stays clean.** No new columns. No new `meta` keys that two engines would race to maintain.

What DOES get persisted is the final `attentionScore` via the existing `score_attention` tool (G1) or a new `recomputeAttention(db, knowledgeItemId)` function (§3.5). That column is already indexed (`ki_attention_desc_idx`), which is all the Knowledge view needs.

### 3.4 Public API shapes

```ts
// packages/fabric/src/attention-scoring.ts

export interface AttentionWeights {
  readonly novelty: number;
  readonly impact: number;
  readonly conflict: number;
  readonly repetition: number;      // applied as NEGATIVE contribution (reduces need)
  readonly confidence: number;       // applied as NEGATIVE contribution (reduces need)
  readonly tasteSensitivity: number;
  readonly recency: number;
  readonly usage: number;
}

export interface AttentionScoringContext {
  /** Current time for deterministic recency calculations. */
  readonly now: number;
  /** Items in the same (layer, scope_id, topic, kind) cohort, keyed for cohort novelty. */
  readonly cohortSizeByKey: ReadonlyMap<string, number>;
  /** Same (layer, topic, kind) across other scopes — for repetition signal. */
  readonly crossScopeCountByKey: ReadonlyMap<string, number>;
  /** Ids with an open knowledge_conflicts row. */
  readonly conflictedIds: ReadonlySet<string>;
  /** Ids edited by a human within REVIEW_RECENCY_WINDOW_MS. */
  readonly recentlyHumanEditedIds: ReadonlySet<string>;
  /** Per-id most recent human edit timestamp (ms epoch). Missing → never. */
  readonly lastHumanEditAt: ReadonlyMap<string, number>;
  /** Optional per-item role hint; empty map if not provided. */
  readonly roleByItemId: ReadonlyMap<string, AgentRole>;
}

/** Score a single knowledge item. Pure. Always produces a value in [0, 1]. */
export function scoreAttention(
  item: KnowledgeItem,
  context: AttentionScoringContext,
  weights: AttentionWeights,
): number;

/** Score an array of items in one pass, sharing context. */
export function scoreAttentionBatch(
  items: readonly KnowledgeItem[],
  context: AttentionScoringContext,
  weights: AttentionWeights,
): ReadonlyArray<{ id: string; score: number; prior: number | null }>;

/** Build a ScoringContext for a given set of items with one SQL pass each.
 *  Lives in attention-scoring.ts; reads-only — does NOT mutate knowledge_items. */
export function buildAttentionContext(
  db: HyperIdleDb,
  items: readonly KnowledgeItem[],
  now?: number,
): AttentionScoringContext;
```

**Why inverse contributions, not subtracted weights?** The public weights are all non-negative like `scoring-config.ts`. Inversion happens inside the scorer by computing `(1 - confidence) * weights.confidence` and `(1 - repetitionSignal) * weights.repetition` — the weight stays a positive knob tuners can reason about ("how much does confidence dampen attention?"). Output is clamped to `[0, 1]` before return.

**Weighted sum formula** (normalizes like `relevance-scoring.ts` so weights can be rebalanced without rescaling):

```
weighted =
  novelty              * w.novelty        +
  impact               * w.impact         +
  conflict             * w.conflict       +
  (1 - repetition)     * w.repetition     +   // inverted
  (1 - confidence)     * w.confidence     +   // inverted
  tasteSensitivity     * w.tasteSensitivity +
  recency              * w.recency        +
  usage                * w.usage

totalWeight = sum of all weight values
score = totalWeight === 0 ? 0 : clamp01(weighted / totalWeight)
```

Returned as a real number in `[0,1]`, rounded to 6 decimal places (deterministic across platforms; a `Number.EPSILON` jitter is not acceptable under AC5).

### 3.5 Recomputation service (server layer)

**Decision: thin wrapper in `packages/server/src/services/attention-service.ts`** (new file) — the impure side (DB read, DB write of `attentionScore`, threshold crossing side-effect).

```ts
// packages/server/src/services/attention-service.ts

export interface AttentionService {
  /** Recompute one item's score; persist to knowledge_items.attentionScore;
   *  return { prior, current, crossedThreshold }. */
  recomputeOne(knowledgeItemId: string): Promise<{
    knowledgeItemId: string;
    prior: number | null;
    current: number;
    crossedThreshold: boolean;
  }>;

  /** Recompute a batch of items (single context build; single UPDATE per item). */
  recomputeMany(knowledgeItemIds: readonly string[]): Promise<ReadonlyArray<{
    knowledgeItemId: string;
    prior: number | null;
    current: number;
    crossedThreshold: boolean;
  }>>;

  /** Recompute every item whose scope matches a predicate — used by the
   *  facilitator's scheduled routine in G4. */
  recomputeScope(filter: {
    layer?: KnowledgeLayer;
    scopeId?: string;
    status?: KnowledgeStatus;
  }): Promise<RecomputeSummary>;
}

export function buildAttentionService(deps: {
  db: HyperIdleDb;
  eventBus: EventBus;
  /** Test seam: factory-settings loader. Defaults to loadAttentionWeights. */
  loadWeights?: (db: HyperIdleDb) => AttentionWeights;
  /** Test seam: Date.now() injection for determinism tests. */
  now?: () => number;
}): AttentionService;
```

On "crossedThreshold" (prior < 0.7 ≤ current), the service creates an `items` row via the existing `create_item` semantics (we extract the insert + `item_created` emit logic into a shared helper `createReviewItemForKnowledge(db, eventBus, knowledgeItem)` in the same service file — see §3.6) and fires `item_created`.

The "prior" comparison uses the stored column value before the UPDATE. A null prior counts as `0` (never crossed before). This makes the threshold crossing monotonic per recomputation pass; repeatedly recomputing a stably-high item does NOT fire repeatedly because the prior after the first write is already ≥ 0.7.

### 3.6 Event emission on threshold crossing — answering AC4

**Decision: emit the existing `item_created` event by creating a new `items` row** (not a new domain event).

Rationale:
- `ItemCreatedEvent` is a broadcast to the UI that a human-visible item has appeared. That's precisely what "this knowledge item needs attention" means — a review card needs to surface in Conversations (per `HUMAN_INTERFACE_LAYER.md` §4.1 "Conversations is where agents bring things that need eyes").
- The Knowledge view's "Triage" sort already reads `knowledge_items.attentionScore` directly (HIL §4.4, IA row 298). It does NOT need a separate `knowledge_attention_crossed` event — its data source is the indexed column.
- Introducing a new event type would require: extending the closed `DomainEvent` union, updating every wildcard subscriber, teaching the UI a new handler. None of that earns its keep.
- The existing `create-item.ts` has the exact shape — we reuse it instead of duplicating the insert logic.

Concretely, when the service detects a threshold crossing:

```
1. Insert a row into `items`:
     sourceAgentId:   null  (system-generated)
     layer:           knowledgeItem.layer
     verb:            'review'
     kind:            'knowledge'
     title:           "Knowledge item needs attention: " + knowledgeItem.title
     body:            short summary + first 500 chars of knowledgeItem.body
     riskTier:        'medium' if knowledgeItem has open conflict else 'low'
     attentionScore:  Math.round(current * 100)
     reasoning:       JSON { signals: {novelty,...}, threshold: 0.7 }
     threadId:        newly-created thread with kind='review' (following create_item.ts behavior)
     createdAt:       now
2. Emit ItemCreatedEvent { type, streamId, itemId, conversationId: threadId, kind: 'knowledge', timestamp }
3. The Knowledge view is updated by the existing WebSocket push on `knowledge_item_updated`
   from knowledge-repository.ts — fired naturally as part of updating attentionScore? NO —
   attentionScore writes via our path do NOT flow through repository.update(). So the service
   ALSO emits a `knowledge_updated` DomainEvent (already in the events union:
   KnowledgeUpdatedEvent { itemId, action: 'attention_recomputed' }).
```

### CONFUSION: `knowledge_updated` delivery

`packages/shared/src/events.ts` has `KnowledgeUpdatedEvent { itemId, action, timestamp }` on the domain bus. `packages/fabric/src/events.ts` has a SEPARATE in-process `knowledgeEvents` emitter with its own `KnowledgeItemUpdatedEvent { itemId, version }`. The repository writes only to the latter. The UI WebSocket push reads from... TBD — the routes subscribe to the domain event bus.

Options:
A) Emit the domain `KnowledgeUpdatedEvent` from the attention service whenever `attentionScore` changes — consequences: Triage view stays fresh, but decouples from the repository convention (which emits only the in-process event).
B) Route through `knowledge-repository.update(item.id, { attentionScore }, item.version)` — consequences: version bumps on every score recomputation, which pollutes the edit log and invalidates the `score_attention` G1 convention ("status/score updates do NOT bump version" per the lore comment).
C) Emit BOTH the in-process `knowledgeEvents.emit(UPDATED, ...)` AND the domain `KnowledgeUpdatedEvent` — consequences: matches what create/update/delete paths already do in the repo pattern; one extra call.

**Proceeding with (C).** The repository's in-process emitter fires `knowledge_item_updated` for subscribers that care about content versions; the domain event fires for WebSocket / UI listeners. This matches the pattern observed in `knowledge-repository.create()` (line 104–109) which only emits the in-process one but is called in contexts that then fire a domain event downstream. The attention service owns both emissions because it is neither a content edit nor a repository op. Flag for review.

### 3.7 Integration with `score_attention` tool (G1)

**Decision: keep G1's tool as a MANUAL OVERRIDE path. Do not rewrite it to wrap the engine.**

Rationale:
- G1's tool currently persists a caller-supplied `score`. That is the right shape for a human or a privileged facilitator to *pin* a score (e.g. to escalate a stale item that the engine would not yet surface, or to silence a noisy one). The UX need for "manual override" is concrete.
- The engine runs on its own recompute cycle (G4 Knowledge Decay Check + on-demand via `attentionService.recomputeOne`). Wrapping the tool would conflate "this agent knows a specific score is right" with "please run the whole engine from this caller".
- We add a new OPTIONAL flag to the tool input: `mode?: 'override' | 'recompute'` defaulting to `'override'` (current behavior). When `mode === 'recompute'`, the tool calls `attentionService.recomputeOne(id)` and IGNORES the `score` argument (the caller still must pass a score to pass Zod validation; the service computes the real one). This keeps the input schema backward compatible while giving agents a tool-call-only path into the engine.

Alternative considered and REJECTED: add a separate `recompute_attention` tool. Rejected because facilitators already reason about `score_attention`; a second tool fragments the mental model. The `mode` flag is discoverable via tool description.

**Tool description update** (replaces the G1 placeholder):

> Set an attention score on an item or knowledge_item. Two modes: `override` (default; uses the provided score directly — G1 behavior) and `recompute` (runs the attention engine; ignores the provided score). Override is for manual pinning; recompute is for facilitator-triggered refresh.

**Implementation note.** The tool file adds one branch: if `mode === 'recompute' && target === 'knowledge_item'`, call the service and return `ok({ target, id, score: current })`. If `mode === 'recompute' && target === 'item'`, return `err('INVALID_INPUT', 'recompute only supported for knowledge_item')` — `items.attentionScore` is not what the engine computes.

### 3.8 Weights — `factory_settings` pattern

Follow `scoring-config.ts` exactly. A new helper `loadAttentionWeights(db): AttentionWeights` in `scoring-config.ts` (extended, not a new file — the file is only 75 lines and the pattern is identical). Keys:

```
attention.weight.novelty           default 0.20
attention.weight.impact            default 0.25
attention.weight.conflict          default 0.20
attention.weight.repetition        default 0.10   (inverse)
attention.weight.confidence        default 0.10   (inverse)
attention.weight.tasteSensitivity  default 0.25
attention.weight.recency           default 0.10
attention.weight.usage             default 0.05
```

Weight defaults sum to 1.25 intentionally — the scorer normalizes by totalWeight (per §3.4), so the absolute sum doesn't matter. The ratios are what matter. The mix above is tuned to satisfy AC1 (conflict contributes significantly), AC2 (taste sensitivity + impact dominate), AC3 (recency is bounded but present). The validation table in §4 proves each ratio earns its keep.

`loadAttentionWeights` runs the same range check as `loadScoringWeights` (`0 <= parsed <= 1`) but normalization will still produce a valid output for any non-negative settings.

### 3.9 The taste-sensitivity classifier

Pure function, its own file for testability and future tuning:

```ts
// packages/fabric/src/attention-classifier.ts

export function isTasteSensitive(item: KnowledgeItem): boolean {
  // 1. kind gate — briefs and principles are always human-voice
  if (item.kind === 'brief' || item.kind === 'principle') return true;
  // 2. topic gate — brand/voice/aesthetics/strategy topics
  if (item.topic && TASTE_TOPICS.has(item.topic.toLowerCase())) return true;
  // 3. scope gate — explicit brand scope
  if (item.scopeId === 'brand') return true;
  return false;
}

const TASTE_TOPICS = new Set([
  'brand', 'voice', 'tone', 'positioning',
  'aesthetics', 'copy', 'customer-taste', 'strategy',
]);
```

A separate test fixture (`attention-classifier.test.ts`) covers:
- Brief kind → true
- Pattern kind with topic='brand' → true
- Pattern kind with topic='auth' → false (technical detail — AC2 binding)
- Principle kind regardless of topic → true

This satisfies AC2 directly: the brand-voice `tasteSensitivity=1` with weight 0.25 contributes 0.25 to the numerator, while the technical-pattern `tasteSensitivity=0` contributes 0. Holding other signals equal, taste-sensitive items score higher.

### 3.10 Repetition / novelty context building

The context is built ONCE per `recomputeMany` / `recomputeScope` call, not per item. This is the key to AC6.

Single batched SQL (three aggregate queries for the entire batch):

```sql
-- (1) conflict ids
SELECT item_id FROM knowledge_conflicts
 WHERE status = 'open' AND item_id IN (:ids);

-- (2) cohort sizes — items in the SAME (layer, scope_id, topic, kind)
SELECT layer, scope_id, topic, kind, COUNT(*) AS n
  FROM knowledge_items
 WHERE status != 'archived'
   AND (layer, coalesce(scope_id,''), coalesce(topic,''), kind) IN (<distinct cohorts of batch>)
 GROUP BY layer, scope_id, topic, kind;

-- (3) cross-scope repetition — same (layer, topic, kind) across OTHER scopes
SELECT layer, topic, kind, COUNT(DISTINCT scope_id) AS nscopes
  FROM knowledge_items
 WHERE status != 'archived'
   AND scope_id IS NOT NULL
   AND (layer, coalesce(topic,''), kind) IN (<distinct (layer,topic,kind) of batch>)
 GROUP BY layer, topic, kind;

-- (4) recent human edits
SELECT item_id, MAX(created_at) AS last_at
  FROM knowledge_edit_log
 WHERE editor = 'human' AND item_id IN (:ids)
 GROUP BY item_id;
```

All four run via Drizzle's builder (never raw SQL — per the TypeScript rules). Drizzle's `sql` tag is used for the `coalesce` composition where necessary. `⚠️ UNVERIFIED`: whether Drizzle's SQLite adapter supports tuple-`IN` on composite keys — if not, the cohort query falls back to OR-composed `and(eq(), eq())` conditions. Test in implementation; the worst case is 1 query per distinct cohort, still bounded at O(distinct cohorts) not O(items).

These four queries together yield the four `ReadonlyMap`/`ReadonlySet` structures of `AttentionScoringContext`. Then the scorer runs as pure JS over the item list — a tight loop over the batch.

### 3.11 Data flow diagram

```
                   ┌────────────────────────────────────────┐
                   │  attentionService.recomputeMany(ids)    │
                   └───────────────────┬────────────────────┘
                                       │
              ┌────────────────────────┼───────────────────────────┐
              ▼                        ▼                           ▼
   SELECT knowledge_items   loadAttentionWeights(db)   buildAttentionContext(db, items)
   WHERE id IN (:ids)              │                   4 aggregate queries
              │                    │                           │
              └─────────┬──────────┴──────────────┬────────────┘
                        ▼                         ▼
                  scoreAttentionBatch(items, context, weights)     ← pure
                        │
                        ▼
            for each (id, prior, current):
              UPDATE knowledge_items SET attention_score=:current, updated_at=:now
              knowledgeEvents.emit(UPDATED, {itemId, version})
              eventBus.emit(KnowledgeUpdatedEvent {action: 'attention_recomputed'})
              if prior < 0.7 <= current:
                createReviewItemForKnowledge(...)    ← creates `items` row
                eventBus.emit(ItemCreatedEvent)       ← AC4 binding
```

---

## 4. Tests (red phase — commit failing first)

### 4.1 `packages/fabric/src/__tests__/attention-classifier.test.ts` — NEW

1. `'classifies kind=brief as taste-sensitive'`
2. `'classifies kind=principle as taste-sensitive regardless of topic'`
3. `'classifies kind=pattern with topic=brand as taste-sensitive'` — AC2 binding
4. `'classifies kind=pattern with topic=auth as NOT taste-sensitive'` — AC2 binding
5. `'treats topic comparisons case-insensitively'`

### 4.2 `packages/fabric/src/__tests__/attention-scoring.test.ts` — NEW

Pure function tests. No DB. Build a tiny `AttentionScoringContext` by hand in each test.

1. `'AC5: deterministic — same inputs → identical output across 100 invocations'` — call `scoreAttention` 100× on the same inputs; all results `===`.
2. `'score is in [0, 1] for all weight permutations'` — fuzz with 20 random weights × 20 random items (seeded RNG for determinism).
3. `'AC1: an item with conflictedIds.has(id) scores STRICTLY higher than one without, all else equal'` — two items identical except one has an open conflict; assert `conflictedScore > nonConflictedScore`.
4. `'AC2: taste-sensitive item scores STRICTLY higher than technical-detail item, all else equal'` — item A: `kind='pattern', topic='brand'`; item B: `kind='pattern', topic='auth'`; same recency, confidence, usage; assert `A > B`.
5. `'AC3: recentlyHumanEditedIds.has(id) scores STRICTLY lower than never-reviewed, all else equal'`.
6. `'cross-scope repetition reduces score'` — high repetition count vs low → former scores lower.
7. `'high confidence reduces score'` — confidence=0.95 vs confidence=0.1, same everything else → former scores lower.
8. `'high novelty increases score'` — cohortSize=1 vs cohortSize=10 → former higher.
9. `'totalWeight=0 returns 0 without crashing'`.
10. `'handles null knowledge_items.confidence as neutral 0.5'`.
11. `'AC6: scoring 1000 synthetic items completes in <1000ms'` — Vitest `performance.now()` measurement; build context once (not per item) inside the fixture to exercise the intended use.

### 4.3 `packages/fabric/src/__tests__/attention-context.test.ts` — NEW

Uses real SQLite via `createTestDb()`. Validates the four aggregate queries.

1. `'buildAttentionContext returns conflictedIds matching open knowledge_conflicts'`
2. `'buildAttentionContext returns cohort sizes matching group-by on (layer, scope_id, topic, kind)'`
3. `'buildAttentionContext returns crossScopeCount of distinct scopes per (layer, topic, kind), excluding null scope_id'`
4. `'buildAttentionContext filters status=archived out of both cohort and cross-scope counts'`
5. `'buildAttentionContext reads human edits from knowledge_edit_log within the recency window'`

### 4.4 `packages/server/src/__tests__/attention-service.test.ts` — NEW

Integration — real DB, real event bus, mocked time.

1. `'recomputeOne persists the new score on knowledge_items.attentionScore and does NOT bump version'` — AC5 storage contract.
2. `'recomputeOne fires ItemCreatedEvent on prior<0.7 & current>=0.7'` — AC4 binding. Seed an item at `attentionScore=0.3`, surround with conflict + taste signals to push score over 0.7; call; assert `items` has one new row with `kind='knowledge'`, `verb='review'` AND event bus received one `item_created`.
3. `'recomputeOne does NOT fire ItemCreatedEvent when prior was already >= 0.7'` — idempotent surfacing.
4. `'recomputeOne does NOT fire when prior<0.7 stays below 0.7'`.
5. `'recomputeMany: 1000 items completes in <1s'` — AC6 binding, full path including SQL.
6. `'recomputeMany emits exactly one ItemCreatedEvent per item that crosses the threshold'`.
7. `'recomputeMany emits KnowledgeUpdatedEvent for every item, action=attention_recomputed'` — Triage view binding.
8. `'recomputeScope({layer:L3, scopeId:build}) updates only L3/build items'`.
9. `'respects weights loaded from factory_settings'` — insert weight rows that zero novelty + taste, assert score computed only from conflict/repetition/confidence.

### 4.5 `packages/server/src/skill-tools/__tests__/score-attention.test.ts` — EXTEND G1 suite

Add three cases:

1. `"mode: 'override' (default) keeps G1 behavior (uses provided score verbatim)"` — regression guard.
2. `"mode: 'recompute' with target=knowledge_item invokes the engine and ignores the provided score"`.
3. `"mode: 'recompute' with target=item returns INVALID_INPUT"`.

### 4.6 `packages/fabric/src/__tests__/scoring-config.test.ts` — NEW (or extend if exists)

1. `'loadAttentionWeights returns defaults when no settings rows exist'`.
2. `'loadAttentionWeights overrides per-key from factory_settings'`.
3. `'loadAttentionWeights ignores out-of-range values (< 0, > 1, NaN)'`.

### 4.7 Test → AC evidence table

| AC | File | Test name |
|----|------|-----------|
| 1 — conflict scores higher | `attention-scoring.test.ts` | `AC1: an item with conflictedIds.has(id) scores STRICTLY higher…` |
| 2 — brand-voice scores higher than technical | `attention-scoring.test.ts` + `attention-classifier.test.ts` | `AC2: taste-sensitive item scores STRICTLY higher…` + `classifies kind=pattern with topic=brand…` + `…with topic=auth as NOT…` |
| 3 — recently-reviewed scores lower | `attention-scoring.test.ts` | `AC3: recentlyHumanEditedIds.has(id) scores STRICTLY lower…` |
| 4 — 0.7 crossing fires `item_created` | `attention-service.test.ts` | `recomputeOne fires ItemCreatedEvent on prior<0.7 & current>=0.7` |
| 5 — deterministic | `attention-scoring.test.ts` | `AC5: deterministic — same inputs → identical output across 100 invocations` |
| 6 — 1000 items in <1s | `attention-scoring.test.ts` + `attention-service.test.ts` | `AC6: scoring 1000 synthetic items completes in <1000ms` + `recomputeMany: 1000 items completes in <1s` |

Every acceptance criterion has at least one test; AC1, AC2, AC3, AC6 are covered at two levels (pure function + integration).

---

## 5. Implementation order (TDD)

1. Write all tests in §4.1–4.6. Red.
2. Implement `packages/fabric/src/attention-classifier.ts` → §4.1 green.
3. Extend `packages/fabric/src/scoring-config.ts` with `loadAttentionWeights` + the 8 `AttentionWeights` defaults → §4.6 green.
4. Implement `packages/fabric/src/attention-scoring.ts` — the pure `scoreAttention` / `scoreAttentionBatch` + `buildAttentionContext` → §4.2 green. §4.3 green.
5. Extend `packages/fabric/src/index.ts` barrel to re-export the public symbols: `scoreAttention`, `scoreAttentionBatch`, `buildAttentionContext`, `loadAttentionWeights`, `isTasteSensitive`, types `AttentionWeights`, `AttentionScoringContext`, `ATTENTION_THRESHOLD`.
6. Implement `packages/server/src/services/attention-service.ts` + the shared `createReviewItemForKnowledge` helper → §4.4 green.
7. Update `packages/server/src/skill-tools/score-attention.ts` with the `mode` flag → §4.5 green (G1 regression tests still green).
8. Benchmark in §4.2 #11 and §4.4 #5 — if either fails the <1s budget, profile with `console.time` scoped locally (delete before commit), look for O(n²) in the cohort-key building or per-item Drizzle calls.
9. Run `bun run check && bun run lint && bun run test` — green.
10. `/lore` the non-obvious choices (manual-override mode preserved; `item_created` reuse vs new event; repetition inverted).

---

## 6. Data model changes

**None.** All eight signals derive from existing columns and existing tables:

| Signal | Source |
|--------|--------|
| Novelty | `knowledge_items` cohort aggregate |
| Impact | `knowledge_items.kind` + optional `meta.impact` (JSON string already typed as TEXT) |
| Conflict | `knowledge_conflicts` (B5) |
| Repetition | `knowledge_items` cross-scope aggregate |
| Confidence | `knowledge_items.confidence` |
| Taste sensitivity | `knowledge_items.kind` / `topic` / `scope_id` |
| Recency of review | `knowledge_edit_log` (existing) |
| Usage frequency | `knowledge_items.meta.usageCount` (JSON) |

No new table. No new column. No new migration.

---

## 7. Risks and trade-offs

### 7.1 AC6 performance budget

- **Risk.** 1000 items × 4 aggregate queries = ~4 round-trips on SQLite; should be well under 1s in WAL mode, but a regression test catches slippage.
- **Mitigation.** §4.2 #11 and §4.4 #5 both exercise the 1000-item path. If either regresses, the likely culprit is building `cohortSizeByKey` via per-item SELECTs instead of one aggregate — the code structure makes that hard to get wrong but the test is cheap to keep.

### 7.2 Threshold-crossing duplicate emissions

- **Risk.** Recomputing an item whose score stays above 0.7 could re-emit `item_created` if we compared to a stale in-memory prior.
- **Mitigation.** The prior is read from the `knowledge_items.attentionScore` column immediately before the UPDATE, in a single transaction. Tests §4.4 #3 and #4 pin this.

### 7.3 `item_created` reuse vs new event

- **Trade-off.** Reusing `item_created` keeps the event union closed and the UI simple. The cost is a slight overloading — `item_created` now fires both from agents explicitly creating review items and from the attention engine. The `items.sourceAgentId` being null for engine-created rows plus `verb='review'` disambiguates at read time.
- **Alternative rejected.** A new `knowledge_attention_crossed` event would be cleaner but requires ripple changes — see CONFUSION block resolution in §3.6.

### 7.4 Repetition and confidence as inverse signals

- **Trade-off.** Inverting them inside the formula (`(1 - value) * weight`) makes the weights all positive at the public boundary. The engineer cost: reviewers must remember to read "repetition weight" as "how much does repetition dampen attention". We document this inline in the weight keys' JSDoc and in the `AttentionWeights` interface.

### 7.5 Taste-sensitivity hard-coded topic list

- **Trade-off.** `TASTE_TOPICS = {brand, voice, tone, positioning, aesthetics, copy, customer-taste, strategy}` is an opinion, not a universal truth. When topic taxonomy evolves, this drifts.
- **Mitigation.** The classifier is a single pure function in its own file. A future story can promote it to a `factory_settings` list or a per-product override. For G2 the hard-coded set is AC-binding and fast.

### 7.6 Persisting final score but not signals

- **Trade-off.** We lose explainability at rest — "why did this score 0.82?" requires rerunning the engine. We gain zero drift and simpler schema.
- **Mitigation.** When a threshold crossing creates a review item, the service writes `reasoning: JSON { signals: {...}, threshold }` onto the `items` row. That's exactly when explainability matters (human is about to decide). For non-crossing recomputes, we accept opacity.

### 7.7 Interaction with G4 scheduled recompute

- G4 Knowledge Decay Check fires daily. It will call `attentionService.recomputeScope({status: 'active'})` (or similar). G2 ships the capability; G4 wires the trigger. The service is designed for that caller shape.

### 7.8 Tool mode flag vs separate tool

- **Trade-off.** The `mode` flag makes `score_attention` do two things. A separate `recompute_attention` tool would be cleaner.
- **Mitigation.** The description makes both modes discoverable; agents pass a single tool through policy and onboarding; refactoring to two tools later is trivial (split into two `ToolDefinition`s in one file).

---

## 8. Open questions (non-blocking; defaults chosen)

1. **Does `meta.usageCount` exist today?** The KA doc references "usage frequency" but no current code writes it. **Default:** if missing, usage signal is `0`. The materialization engine in G4 / L6-tracking (future) will populate it. Not a G2 blocker.
2. **Should the Knowledge view subscribe to a new `attention_recomputed` event instead of `knowledge_updated`?** **Default:** reuse `knowledge_updated` with `action: 'attention_recomputed'`. The `action` discriminator is already the extension point (see `KnowledgeUpdatedEvent.action: string`).
3. **Do we surface threshold-crossing items ONLY in Conversations, or also in Rail?** The review item will be routed via `routeItem({kind:'knowledge', riskTier})` — `low` → `knowledge` view; `medium` → `conversations`. This is the existing routing and matches the UX spec. No G2 change needed.
4. **Should the "recently reviewed" detector also count agent edits that include a human-authored `updated_by`?** **Default:** strict `editor = 'human'` match on the edit log — matches the "human looked at this" semantics in KA §9. Agent-originated edits don't reset recency.

---

## 9. Files touched

Created:
- `/workspace/packages/fabric/src/attention-scoring.ts`
- `/workspace/packages/fabric/src/attention-classifier.ts`
- `/workspace/packages/fabric/src/__tests__/attention-scoring.test.ts`
- `/workspace/packages/fabric/src/__tests__/attention-classifier.test.ts`
- `/workspace/packages/fabric/src/__tests__/attention-context.test.ts`
- `/workspace/packages/fabric/src/__tests__/scoring-config.test.ts` (may already exist — if so, extend)
- `/workspace/packages/server/src/services/attention-service.ts`
- `/workspace/packages/server/src/__tests__/attention-service.test.ts`

Modified:
- `/workspace/packages/fabric/src/scoring-config.ts` (add `loadAttentionWeights`, `AttentionWeights`, defaults, `ATTENTION_THRESHOLD`)
- `/workspace/packages/fabric/src/index.ts` (re-exports)
- `/workspace/packages/server/src/skill-tools/score-attention.ts` (add `mode` flag + branch)
- `/workspace/packages/server/src/skill-tools/__tests__/score-attention.test.ts` (three new cases)

No schema migration. No new event. No change to the `DomainEvent` union. No change to the 19-component UI budget (UI reads the same `attention_score` column it already did).
