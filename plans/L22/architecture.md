# L22 — Architecture: Three relevance signals as first-class data

> Concept input: `plans/L22/concept.md` (inherited from L5, no new nouns).
> Design input: `plans/L22/design/approved.md` (inline signal triad on KnowledgeRow, sort controls with URL state).
> Authoritative spec: `docs/knowledge-architecture/relevance-and-attention.md`.
> L5 decision log: `plans/L5/architecture.md` (D1-D6).

---

## Required reading

The builder must read these files before implementing:

1. `docs/knowledge-architecture/relevance-and-attention.md` — the authoritative spec
2. `plans/L5/architecture.md` — D1-D6 decision log
3. `plans/L22/design/approved.md` — visual contract
4. `packages/db/src/schema.ts` lines 321-368 — knowledgeItems, knowledgeEditLog
5. `packages/db/src/schema.pg.ts` lines 299-366 — PostgreSQL equivalents
6. `packages/fabric/src/attention-scoring.ts` — IMPACT_BY_KIND (lines 41-50), computeUsage (lines 110-112), scoreAttention (lines 156-192), buildAttentionContext (lines 220-333)
7. `packages/fabric/src/scoring-config.ts` — loadAttentionWeights (lines 144-172), AttentionWeights interface (lines 87-98)
8. `packages/fabric/src/relevance-scoring.ts` — existing materialization scorer (boundary: this is NOT the L22 user-facing score)
9. `packages/server/src/routes/knowledge.ts` — GET /:layer/:id (lines 202-222)
10. `packages/server/src/services/attention-service.ts` — recompute pattern
11. `packages/web/src/pages/KnowledgeList.tsx` — current Triage tab
12. `packages/web/src/fixtures/knowledge-data.ts` — MockKnowledgeItem shape
13. `packages/design-system/src/KnowledgeRow.tsx` — current props
14. `packages/design-system/html/KnowledgeRow.html` — HTML reference

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `knowledge_access_log` table exists | Does not exist | T1: create via migration |
| `relevanceScore` column on `knowledge_items` | Does not exist; only `attentionScore` | T1: add column via migration |
| `citationCount` / `lastCitedAt` columns | Do not exist | T1: add nullable columns via migration |
| `factory_settings` table under `relevance.*` | Table exists (`packages/db/src/schema.ts:313-317`); no `relevance.*` keys | T3: seed default values; loader reads them |
| `IMPACT_BY_KIND` at `attention-scoring.ts:41-50` | Exists exactly as spec describes | T4: delete the constant and `computeImpact` function |
| `computeUsage` at `attention-scoring.ts:110-112` | Returns literal 0 | T4: delete function (relevance replaces it) |
| `GET /api/knowledge/:layer/:id` at `knowledge.ts:202-222` | Exists, returns 200 with item | T5: add access-log append after 200 response |
| KnowledgeRow caption prop | Exists (`caption?: string`) | T8: add optional `signals` prop; deprecate whyNow usage |
| KnowledgeList sorts by `attentionScore` | Sorts `MOCK_KNOWLEDGE_ITEMS` by `.attentionScore` (line 93) | T9: replace with real API data sorted by `relevanceScore` |
| `packages/web/src/fixtures/knowledge-data.ts` `whyNow` field | Exists on `MockKnowledgeItem` | T9: field no longer consumed by Triage tab |
| PostgreSQL schema mirrors SQLite | Yes, `schema.pg.ts` mirrors `schema.ts` for knowledge tables | T1: add to both schemas |

---

## 1. Schema changes

### 1.1 New table: `knowledge_access_log`

Append-only log of detail-view fetches. One row per `GET /api/knowledge/:layer/:id` 200 response.

**SQLite** (`packages/db/src/schema.ts`):

```ts
export const knowledgeAccessLog = sqliteTable(
  "knowledge_access_log",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "restrict" }),
    accessorKind: text("accessor_kind").notNull(), // "human" | "agent"
    accessorId: text("accessor_id").notNull(),
    accessedAt: text("accessed_at").notNull(), // ISO 8601
  },
  (table) => [
    index("kal_item_accessed_idx").on(table.itemId, table.accessedAt),
  ],
);
```

**PostgreSQL** (`packages/db/src/schema.pg.ts`): identical structure using `pgTable`.

**Index rationale:** The composite index `(item_id, accessed_at)` serves both queries L22 needs:
- `MAX(accessed_at) WHERE item_id = ?` (recency) — index seek
- `COUNT(*) WHERE item_id = ? AND accessed_at >= ?` (30-day frequency) — index range scan

### 1.2 New columns on `knowledge_items`

Add `relevanceScore` as a denormalized real column. The other signals (`lastValidatedAt`, `lastEditedAt`, `lastAccessedAt`, `accessCount30d`, `citationCount`, `lastCitedAt`) are computed at query time from their source tables, NOT stored as columns. Rationale: storing derived values creates staleness; the access log and edit log are the sources of truth. Only `relevanceScore` is denormalized because it is the sort key and recomputing it for every list query would require joining across three tables.

**Add to both `schema.ts` and `schema.pg.ts`:**

```ts
// On knowledgeItems table definition:
relevanceScore: real("relevance_score"),   // [0, 1] composite, recomputed by batch
citationCount: integer("citation_count"),  // nullable; null = staged/absent
lastCitedAt: text("last_cited_at"),        // nullable; null = staged/absent
```

**Migration (SQLite):** `packages/db/drizzle/0012_knowledge_access_log_l22.sql`

```sql
-- knowledge_access_log table
CREATE TABLE "knowledge_access_log" (
  "id" text PRIMARY KEY NOT NULL,
  "item_id" text NOT NULL REFERENCES "knowledge_items"("id") ON DELETE RESTRICT,
  "accessor_kind" text NOT NULL,
  "accessor_id" text NOT NULL,
  "accessed_at" text NOT NULL
);
CREATE INDEX "kal_item_accessed_idx" ON "knowledge_access_log" ("item_id", "accessed_at");

-- New columns on knowledge_items
ALTER TABLE "knowledge_items" ADD COLUMN "relevance_score" real;
ALTER TABLE "knowledge_items" ADD COLUMN "citation_count" integer;
ALTER TABLE "knowledge_items" ADD COLUMN "last_cited_at" text;
```

**Migration (PostgreSQL):** `packages/db/drizzle-pg/0010_knowledge_access_log_l22.sql` — same SQL (both use text/real/integer types).

### 1.3 Design-it-twice: denormalized signals vs computed-at-query

**Option A: Denormalize all signals as columns on knowledge_items.**
- Pro: simple SELECT for the list endpoint, no joins.
- Con: six new columns that go stale, require a recompute batch to keep current, and duplicate data from knowledge_edit_log and knowledge_access_log. Migration adds more columns.

**Option B (chosen): Denormalize only `relevanceScore`; compute individual signals at query time.**
- Pro: recency and frequency are always fresh (derived from source tables). Only the composite needs recompute.
- Con: the list endpoint needs a slightly more complex query (subqueries or a server-side post-processing step to annotate each item with its signals).
- Resolution: the server annotates items with computed signals in the list handler, not via SQL joins. This keeps the query simple and the types clean. The signal computation is cheap (one grouped query per signal across the batch of items).

**Trade-off:** Option B adds ~20ms to a list response for 100 items (two small aggregate queries). Option A saves that but creates staleness. Option B wins because freshness is the entire point of the feature.

---

## 2. Shared types

### 2.1 `packages/shared/src/types.ts`

Add the relevance signal types:

```ts
/** Accessor kind for knowledge_access_log */
export type KnowledgeAccessorKind = "human" | "agent";

/** Relevance signals rendered on each Knowledge row */
export interface KnowledgeRelevanceSignals {
  /** Most recent of lastValidatedAt, lastEditedAt, lastAccessedAt (ISO). null = no data */
  readonly lastActivityAt: string | null;
  /** Access count in trailing 30-day window. null = no data */
  readonly accessCount30d: number | null;
  /** Citation count. null = staged (always null in L22) */
  readonly citationCount: number | null;
  /** Composite relevance score [0, 1]. null = not yet computed */
  readonly relevanceScore: number | null;
}

/** Sort options for the Knowledge Triage view */
export const KNOWLEDGE_SORT_OPTIONS = ["relevance", "recency", "frequency"] as const;
export type KnowledgeSortOption = (typeof KNOWLEDGE_SORT_OPTIONS)[number];
```

### 2.2 `packages/shared/src/types.ts` — API response shape

```ts
/** Knowledge item with relevance signals, returned by list/detail endpoints */
export interface KnowledgeItemWithSignals {
  /** The base knowledge item fields (from DB row) */
  readonly id: string;
  readonly layer: string;
  readonly scopeId: string | null;
  readonly kind: string;
  readonly topic: string | null;
  readonly title: string;
  readonly body: string;
  readonly format: string;
  readonly status: string;
  readonly attentionScore: number | null;
  readonly relevanceScore: number | null;
  readonly confidence: number | null;
  readonly version: number;
  readonly updatedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly meta: string | null;
  readonly citationCount: number | null;
  readonly lastCitedAt: string | null;
  /** Computed signals (not stored on the row) */
  readonly signals: KnowledgeRelevanceSignals;
}
```

---

## 3. Fabric: relevance scoring engine

### 3.1 New file: `packages/fabric/src/relevance-engine.ts`

This is the user-facing relevance scorer. It is distinct from the existing `relevance-scoring.ts` (which is the materialization scorer for session context building). The naming distinction: `relevance-engine.ts` = user-facing L22 composite; `relevance-scoring.ts` = internal fabric materialization scorer.

```ts
/** Relevance weights loaded from factory_settings */
export interface RelevanceWeights {
  readonly recency: number;
  readonly frequency: number;
  readonly citation: number;
}

/** Relevance shape constants loaded from factory_settings */
export interface RelevanceShapeConstants {
  readonly recencyHalflifeDays: number;
  readonly frequencySaturation: number;
  readonly frequencyWindowDays: number;
  readonly citationSaturation: number;
}

export interface RelevanceConfig {
  readonly weights: RelevanceWeights;
  readonly shape: RelevanceShapeConstants;
}

export interface RelevanceInput {
  /** Days since max(lastValidatedAt, lastEditedAt, lastAccessedAt). null = no data. */
  readonly ageDays: number | null;
  /** Access count in the trailing frequencyWindowDays. null = no data. */
  readonly accessCount: number | null;
  /** Citation count. null = staged. */
  readonly citationCount: number | null;
}

/**
 * Compute the composite relevance score per L5 spec.
 *
 * Formula:
 *   relevance = (w_r * recency + w_f * frequency + w_c * citation) / denominator
 *
 * Where:
 *   recency     = exp(-ln(2) * ageDays / halflife)
 *   frequency   = clamp01(accessCount / saturation)
 *   citation    = citationCount != null ? clamp01(citationCount / saturation) : 0
 *   denominator = w_r + w_f + (citationCount != null ? w_c : 0)
 *
 * Returns [0, 1] rounded to 6 decimals, or null if all inputs are null.
 */
export function computeRelevanceScore(
  input: RelevanceInput,
  config: RelevanceConfig,
): number | null;
```

The implementation is pure (no DB access), deterministic, and testable with golden fixtures.

### 3.2 `packages/fabric/src/scoring-config.ts` — add `loadRelevanceWeights`

Following the exact pattern of `loadAttentionWeights` (lines 144-172):

```ts
const DEFAULT_RELEVANCE_WEIGHTS: RelevanceWeights = {
  recency: 0.4,
  frequency: 0.4,
  citation: 0.2,
};

const DEFAULT_RELEVANCE_SHAPE: RelevanceShapeConstants = {
  recencyHalflifeDays: 14,
  frequencySaturation: 5,
  frequencyWindowDays: 30,
  citationSaturation: 5,
};

const RELEVANCE_SETTING_PREFIX = "relevance.";

export function loadRelevanceConfig(db: HyperIdleDb): RelevanceConfig;
```

The loader reads `relevance.weight.recency`, `relevance.weight.frequency`, `relevance.weight.citation`, `relevance.recencyHalflifeDays`, `relevance.frequencySaturation`, `relevance.frequencyWindowDays`, `relevance.citationSaturation` from `factory_settings`. Falls back to defaults. Rejects non-finite and negative values (defense-in-depth, matching the attention weights pattern).

### 3.3 `packages/fabric/src/attention-scoring.ts` — deletions

Delete:
- `IMPACT_BY_KIND` constant (lines 41-50)
- `computeImpact` function (lines 94-97)
- `computeUsage` function (lines 110-112)

Update `scoreAttention`:
- Replace `computeImpact(item)` call (line 162) with a fixed `0` (the `impact` weight in AttentionWeights still exists but the signal is now always 0, matching the prior `computeUsage` behavior). Alternatively, set `weights.impact` to 0 in the default weights. The cleaner choice: remove the `impact` and `usage` dimensions from AttentionWeights entirely and renormalize.

**Design-it-twice: remove impact/usage from AttentionWeights or zero them?**

**Option A: Remove from AttentionWeights interface.**
- Pro: clean; no dead weight in the type.
- Con: breaking change to the interface; any existing factory_settings rows for `attention.weight.impact` and `attention.weight.usage` become orphaned. Tests that assert 8-signal attention weights break. Migration cost is ~20 lines of test updates.

**Option B (chosen): Keep the fields in AttentionWeights, set `computeImpact` to return 0, delete `IMPACT_BY_KIND`.**
- Pro: non-breaking; `attention.weight.impact` remains tunable for future use; existing tests pass with minimal changes.
- Con: two dead signals in the interface. But `computeUsage` already returns 0 today, so this pattern is established.
- Resolution: delete `IMPACT_BY_KIND` and `computeImpact`; inline `0` for both impact and usage signals in `scoreAttention`. The `@lore` comment on computeUsage already explains why. Update it to also cover the impact deletion: "impact was a per-kind fake constant (IMPACT_BY_KIND); deleted in L22 per L5 anti-pattern rule. Until a trustworthy citation source exists, both impact and usage contribute 0."

### 3.4 `packages/fabric/src/index.ts` — exports

Add:
```ts
export type { RelevanceConfig, RelevanceInput, RelevanceWeights, RelevanceShapeConstants } from "./relevance-engine.js";
export { computeRelevanceScore } from "./relevance-engine.js";
export { loadRelevanceConfig } from "./scoring-config.js";
```

---

## 4. Server: access tracking and signal computation

### 4.1 Access-log insertion: `packages/server/src/routes/knowledge.ts`

In the `GET /:layer/:id` handler (lines 202-222), after the 200 response is determined but before returning:

```ts
router.get("/:layer/:id", (c) => {
  const layer = c.get("layer");
  const id = c.req.param("id");

  const item = db
    .select()
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.layer, layer)))
    .get();

  if (!item) {
    // ... 404
  }

  // L22: append access log (synchronous — simpler, test-observable)
  const accessorKind = resolveAccessorKind(c); // from auth context
  const accessorId = resolveAccessorId(c);     // from auth context
  db.insert(knowledgeAccessLog)
    .values({
      id: crypto.randomUUID(),
      itemId: id,
      accessorKind,
      accessorId,
      accessedAt: new Date().toISOString(),
    })
    .run();

  return c.json(item);
});
```

**Synchronous write:** The L5 spec allows fire-and-forget but notes "synchronous is the simpler choice" if the test fixture needs to assert immediately. We choose synchronous: the access log write is a single INSERT into an append-only table; the latency cost is negligible for a detail-view handler that already does a SELECT.

**Accessor resolution:** The auth context is not yet wired in the knowledge routes (no middleware extracts the caller identity). For L22, the accessor defaults to `{ kind: "human", id: "anonymous" }` when no auth context is available. A `@lore` comment notes that the real accessor comes from the auth middleware (out of L22 scope). The important thing is that the access-log row exists and the signals compute from it.

### 4.2 Signal computation service: `packages/server/src/services/relevance-service.ts`

New service that computes relevance signals for a batch of knowledge items. The service does NOT store individual signals on the row; it computes them fresh from the source tables.

```ts
export interface RelevanceService {
  /** Compute signals for a batch of item IDs. Returns a Map<itemId, signals>. */
  computeSignals(itemIds: readonly string[], now?: number): Map<string, KnowledgeRelevanceSignals>;

  /** Recompute and store relevanceScore for a batch of items. */
  recomputeScores(itemIds: readonly string[]): Promise<void>;
}
```

The `computeSignals` method:
1. Queries `knowledge_edit_log` for `lastValidatedAt` (editor = "human" or "facilitator" edits) and `lastEditedAt` (any editor) per item.
2. Queries `knowledge_access_log` for `lastAccessedAt` (MAX) and `accessCount30d` (COUNT WHERE accessed_at >= now - 30d) per item.
3. Reads `citationCount` from the `knowledge_items` row (null = staged).
4. Computes `lastActivityAt` as max of the three timestamps.
5. Returns the signal struct per item.

The `recomputeScores` method:
1. Calls `computeSignals` for the batch.
2. Loads relevance config via `loadRelevanceConfig`.
3. For each item, computes `computeRelevanceScore` from the signals.
4. Writes the `relevanceScore` column on each `knowledge_items` row.

### 4.3 List endpoint enrichment

The existing `GET /:layer` handler returns items without signals. L22 modifies it to:
1. Fetch items as today.
2. Call `relevanceService.computeSignals(itemIds)` to annotate.
3. Return items with a `signals` field attached.

This keeps the endpoint shape backward-compatible (the extra `signals` field is additive).

### 4.4 Relevance recompute trigger

When does `relevanceScore` get recomputed? Two paths:

1. **On access-log insertion** (in the GET /:layer/:id handler): after appending the access-log row, trigger a recompute for that single item. This ensures the relevanceScore stays fresh after each access. The recompute is synchronous (single item, cheap).

2. **Batch recompute** (same pattern as `attention-service.ts:recomputeScope`): a `recomputeRelevance` method on the relevance service that takes a filter and recomputes scores for all matching items. This is used by routines/admin for bulk refresh.

### 4.5 Settings write guard

The existing factory_settings write endpoint (if one exists) must reject agent writes to keys under the `relevance.` prefix. This mirrors the `attention.weight.*` guard documented in `scoring-config.ts` lore.

If no settings write endpoint exists yet, this is documented as a constraint for the future story that adds one.

---

## 5. Web: signal rendering and sort controls

### 5.1 `packages/design-system/src/KnowledgeRow.tsx` — new `signals` prop

Per the approved design:

```ts
export interface KnowledgeRowSignals {
  /** Relative time since last activity, e.g. "2d", "3h". null = absent */
  recency: string | null;
  /** Access count in 30d window. null = absent */
  frequency: number | null;
  /** Citation count. null = staged/absent */
  citation: number | null;
}

export interface KnowledgeRowProps {
  // ... existing props unchanged
  /** L22: relevance signals. When provided, renders signal triad. */
  signals?: KnowledgeRowSignals;
}
```

When `signals` is provided, render the signal triad between the body and the timestamp. When absent, render as today (backward-compatible).

**Signal triad markup:**

```tsx
{signals && (
  <div className="flex items-center gap-[8px] shrink-0" data-testid="knowledge-signals">
    <SignalValue label="recency" value={signals.recency} />
    <SignalValue label="freq" value={signals.frequency != null ? String(signals.frequency) : null} />
    <SignalValue label="impact" value={signals.citation != null ? String(signals.citation) : null} />
  </div>
)}
```

`SignalValue` is a local inline component (not a DS export — it is internal to KnowledgeRow):

```tsx
function SignalValue({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="inline-flex items-center gap-[4px]">
      <span className="text-[11px] font-[var(--mono)] text-[var(--text-lo)] uppercase tracking-[var(--tracking-caps)]">
        {label}
      </span>
      <span
        className={`text-[12px] font-[var(--mono)] ${value != null ? "text-[var(--text-mid)]" : "text-[var(--text-lo)]"}`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value ?? "—"}
      </span>
    </span>
  );
}
```

The em dash (U+2014) is the absent-data marker.

### 5.2 `packages/design-system/html/KnowledgeRow.html` — update reference

Add the signal triad variant to the HTML reference. This is mandatory per the visual-parity rule.

### 5.3 `packages/design-system/src/KnowledgeRow.stories.tsx` — add signal stories

Add stories for: signals with all values, signals with mixed values, signals with all absent.

### 5.4 `packages/web/src/pages/KnowledgeList.tsx` — sort controls + real data

Replace `MOCK_KNOWLEDGE_ITEMS` with real API data. Add sort controls to the Triage tab.

**Sort state from URL:**

```ts
function deriveSort(searchParams: URLSearchParams): KnowledgeSortOption {
  const raw = searchParams.get("sort");
  return KNOWLEDGE_SORT_OPTIONS.includes(raw as KnowledgeSortOption)
    ? (raw as KnowledgeSortOption)
    : "relevance";
}
```

**Sort controls markup (above the Triage list):**

```tsx
<div className="flex items-center gap-[8px]" data-testid="knowledge-sort-controls">
  <span className="text-[11px] font-[var(--mono)] text-[var(--text-lo)] uppercase tracking-[var(--tracking-caps)]">
    Sort by
  </span>
  {KNOWLEDGE_SORT_OPTIONS.map((opt) => (
    <button
      key={opt}
      type="button"
      className={sort === opt ? "btn btn-xs btn-neutral" : "btn btn-xs btn-ghost"}
      onClick={() => handleSortChange(opt)}
    >
      {opt === "relevance" ? "Relevance" : opt === "recency" ? "Recency" : "Frequency"}
    </button>
  ))}
</div>
```

**Sort handler:**

```ts
function handleSortChange(newSort: KnowledgeSortOption) {
  const next = new URLSearchParams(searchParams);
  if (newSort === "relevance") {
    next.delete("sort");
  } else {
    next.set("sort", newSort);
  }
  setSearchParams(next, { replace: true });
}
```

**Client-side sort:** The items are fetched once from the API with signals attached. Sorting is client-side:
- `relevance`: sort by `signals.relevanceScore` descending (nulls last)
- `recency`: sort by `signals.lastActivityAt` descending (nulls last)
- `frequency`: sort by `signals.accessCount30d` descending (nulls last)

### 5.5 Relative time formatter: `packages/web/src/utils/relative-time.ts`

A small pure function that converts an ISO timestamp to a compact relative string:

```ts
export function relativeTime(isoDate: string, now?: number): string;
// "3h" | "2d" | "1w" | "2mo" | "1y"
```

This lives in `packages/web` (client-only). The server returns ISO timestamps; the client formats them.

---

## 6. Hardcoded data removal

### L6 inventory rows owned by L22

| Inventory row | Action |
|---|---|
| `fabric/attention-scoring.ts` IMPACT_BY_KIND + time constants | Delete IMPACT_BY_KIND. Time constants (COHORT_NOVELTY_CEILING, REPETITION_SATURATION, etc.) stay — they belong to attentionScore, not relevanceScore. |
| `knowledge-data.ts` MOCK_KNOWLEDGE_ITEMS attentionScore + whyNow fields | The fixture still carries these fields for backward compat with Curated tab and tests. The Triage tab no longer reads from fixtures (reads from API). Mark the inventory row as closed for the Triage code path. |

### whyNow removal

The `whyNow` field on `MockKnowledgeItem` and the `truncateReason` function in KnowledgeList are dead code after L22 — the Triage tab renders signal values instead. Remove:
- `whyNow` from `MockKnowledgeItem` interface (or leave for Curated backward compat)
- `truncateReason` function from `KnowledgeList.tsx`
- `caption={truncateReason(item.whyNow)}` from the Triage KnowledgeRow render

---

## 7. Route checklist

| Route | File | Change |
|---|---|---|
| `GET /api/knowledge/:layer/:id` | `packages/server/src/routes/knowledge.ts:202-222` | Add access-log append + single-item relevance recompute |
| `GET /api/knowledge/:layer` | `packages/server/src/routes/knowledge.ts:182-200` | Annotate response items with computed signals |
| `GET /api/knowledge/search` | `packages/server/src/routes/knowledge.ts:138-171` | Optionally annotate results with signals (or defer to list endpoint) |

No new routes. The access log is populated as a side effect of the existing detail endpoint.

---

## 8. Security and abuse cases

| Vector | Applicable? | Mitigation |
|---|---|---|
| **Rate-limit on access-log creation** | Yes — every GET /:layer/:id creates a row | The access log is append-only and per-request. Existing rate limiting on the API applies. The 30-day frequency window naturally bounds the signal. No per-item rate limit needed beyond the global API rate limit. |
| **Agent-authored field trust** | Yes — `accessorKind` and `accessorId` come from auth context | The handler resolves accessor from the auth context, not from request body. Agents cannot self-report a different accessor. |
| **Agent writes to relevance.* settings** | Yes — gameable | The `relevance.*` prefix must be rejected for agent writes in the factory_settings write endpoint (same pattern as `attention.weight.*`). If no write endpoint exists yet, this is a documented constraint. |
| **Access-log DoS (bulk item fetches)** | Low risk | The access log is bounded by the rate of detail fetches, which is bounded by the global API rate limit. The log is append-only with no cascading effects. Periodic cleanup (e.g., archive rows older than 90 days) is a future optimization, not L22 scope. |
| **Path traversal / SSRF** | N/A | No user-controlled paths or outbound URLs. |
| **Secret handling** | N/A | No new credentials or secrets. |

---

## 9. Protected tests

Tests that MUST NOT have their assertions changed (their current behavior is correct):

```
protectedTests:
  - packages/fabric/src/__tests__/attention-classifier.test.ts
  - packages/fabric/src/__tests__/attention-context.test.ts
  - packages/fabric/src/__tests__/relevance-scoring.test.ts
  - packages/server/src/__tests__/knowledge.test.ts
  - packages/server/src/routes/__tests__/knowledge.validation.test.ts
  - packages/web/e2e/knowledge.spec.ts
  - packages/web/e2e/knowledge-detail.spec.ts
```

Tests that WILL need updates (their assertions reference deleted/changed symbols):

```
modifiedTests:
  - packages/fabric/src/__tests__/attention-scoring.test.ts  # IMPACT_BY_KIND deletion
  - packages/fabric/src/__tests__/scoring-config.test.ts     # add loadRelevanceConfig tests
  - packages/web/src/__tests__/knowledge-data.test.ts        # fixture shape change
```

---

## 10. Acceptance criteria with verification methods

| ID | Criterion | Verification |
|---|---|---|
| AC-1 | Every knowledge item knows when it was last validated, last edited, last accessed, and how often accessed in a recent window from server-side tracking | Integration test: create an item, hit GET /:layer/:id three times, assert knowledge_access_log has 3 rows. Call `computeSignals` — assert lastAccessedAt matches the third fetch time, accessCount30d = 3. |
| AC-2 | The fabric's attention scoring is rewritten so frequency comes from real access tracking; IMPACT_BY_KIND is deleted | Unit test: assert `IMPACT_BY_KIND` is not exported from fabric. Grep the codebase for the string `IMPACT_BY_KIND` — assert zero matches outside test comments. Assert `scoreAttention` still returns a valid [0,1] score with impact contributing 0. |
| AC-3 | Citation staged: `citationCount` nullable, renders dash | Unit test: assert `computeRelevanceScore({ ageDays: 1, accessCount: 3, citationCount: null }, config)` does not include citation in the denominator. Playwright E2E: open Knowledge, assert signal triad shows "impact" with em dash. |
| AC-4 | Composite relevance score uses L5's formula with weights tunable from configuration | Unit test (golden fixtures): for each of 5 input combinations, assert the computed score matches the hand-calculated expected value to 6 decimal places. Integration test: insert custom weights into factory_settings, recompute, assert the new score uses the custom weights. |
| AC-5 | Each row renders available signals; absent signals render dash | Playwright E2E: navigate to Knowledge Triage, assert at least one row has the `[data-testid="knowledge-signals"]` element. Assert dash character for items with no access data. |
| AC-6 | Sort selection reflected in URL state | Playwright E2E: click "Recency" sort button, assert URL contains `?sort=recency`. Click "Relevance", assert URL has no `sort` param (default). |
| AC-7 | Sort changes re-order the list | Playwright E2E: record the first item title under relevance sort. Switch to recency sort. Record the first item title. Assert they may differ (if test data has different orderings). At minimum, assert the sort button state changes. |
| AC-8 | Fake-zero guard | Vitest: assert `computeRelevanceScore({ ageDays: null, accessCount: null, citationCount: null }, config)` returns null (not 0). Assert that when rendered, a null relevanceScore shows dash in all three signal slots. |
| AC-9 | All hardcoded attention-score / whyNow strings removed from Triage path | Grep test: assert KnowledgeList.tsx does not import `MOCK_KNOWLEDGE_ITEMS` in the Triage render path. Assert `truncateReason` is deleted. Assert `whyNow` is not referenced in KnowledgeList.tsx. |
| AC-10 | L6 inventory rows closed | Manual: verify the two L22-owned rows in `plans/reviews/hardcoded-data-inventory.md` are marked `closed-by: L22`. |
| AC-11 | `bun run check` + `bun run lint` + `bun run test` all green | Run `bun run verify`. Zero errors. |

---

## 11. Ordered task list

### T1 — Schema: knowledge_access_log table + new columns (day 1)

**Files:**
- `packages/db/src/schema.ts` — add `knowledgeAccessLog` table + `relevanceScore`, `citationCount`, `lastCitedAt` columns on `knowledgeItems`
- `packages/db/src/schema.pg.ts` — mirror the changes
- `packages/db/src/index.ts` — export new table and types
- `packages/db/drizzle/0012_knowledge_access_log_l22.sql` — SQLite migration
- `packages/db/drizzle-pg/0010_knowledge_access_log_l22.sql` — PostgreSQL migration

**Test:** `bun run db:generate` succeeds. `bun run check` passes. Schema test verifies the new table accepts inserts and FK constraints work.

**Depends on:** nothing.

### T2 — Shared types: relevance signals and sort options (day 1)

**Files:**
- `packages/shared/src/types.ts` — add `KnowledgeAccessorKind`, `KnowledgeRelevanceSignals`, `KnowledgeSortOption`, `KNOWLEDGE_SORT_OPTIONS`

**Test:** `bun run check` passes. Types are importable from `@hyperidle/shared`.

**Depends on:** nothing. Parallel with T1.

### T3 — Fabric: relevance engine + config loader (day 1-2)

**Files:**
- `packages/fabric/src/relevance-engine.ts` — new file: `computeRelevanceScore` pure function
- `packages/fabric/src/scoring-config.ts` — add `loadRelevanceConfig`, `RelevanceConfig`, `RelevanceWeights`, `RelevanceShapeConstants`, defaults
- `packages/fabric/src/index.ts` — export new symbols
- `packages/fabric/src/__tests__/relevance-engine.test.ts` — golden fixture tests for the composite formula
- `packages/fabric/src/__tests__/scoring-config.test.ts` — extend with loadRelevanceConfig tests

**Tests:**
- Golden fixtures: 5+ input/output pairs covering: all signals present, citation null (effective denominator drops w_citation), all null (returns null), edge cases (age=0 => recency=1, accessCount >= saturation => frequency=1).
- Config loader: reads from factory_settings, falls back to defaults, rejects negative/non-finite values.

**Depends on:** T2 (imports shared types).

### T4 — Fabric: delete IMPACT_BY_KIND + computeUsage from attention-scoring (day 2)

**Files:**
- `packages/fabric/src/attention-scoring.ts` — delete `IMPACT_BY_KIND`, `computeImpact`, `computeUsage`. In `scoreAttention`, replace `computeImpact(item)` and `computeUsage(item)` calls with literal `0`. Update `@lore` comment.
- `packages/fabric/src/__tests__/attention-scoring.test.ts` — update expected scores (impact and usage now contribute 0). Keep test structure; update golden values.

**Test:** All existing attention-scoring tests pass with updated expected values. `bun run check` passes. Grep for `IMPACT_BY_KIND` — zero matches outside test comments.

**Depends on:** nothing. Parallel with T1-T3.

### T5 — Server: access-log insertion in GET /:layer/:id (day 2)

**Files:**
- `packages/server/src/routes/knowledge.ts` lines 202-222 — add access-log INSERT after item found, before response
- `packages/server/src/__tests__/knowledge.test.ts` — add test: GET /:layer/:id creates one access-log row

**Test:** Integration test fetches an item, then queries knowledge_access_log for that item_id — asserts 1 row with correct accessor and timestamp.

**Depends on:** T1 (schema must exist).

### T6 — Server: relevance service (day 2-3)

**Files:**
- `packages/server/src/services/relevance-service.ts` — new file: `computeSignals`, `recomputeScores`
- `packages/server/src/__tests__/relevance-service.test.ts` — tests for signal computation and score recompute

**Tests:**
- `computeSignals`: insert knowledge items + edit log rows + access log rows; call computeSignals; assert correct lastActivityAt, accessCount30d, citationCount per item.
- `recomputeScores`: insert items + access log; call recomputeScores; assert knowledge_items.relevanceScore is updated to the expected value.

**Depends on:** T1 (schema), T3 (relevance engine).

### T7 — Server: enrich list endpoint with signals (day 3)

**Files:**
- `packages/server/src/routes/knowledge.ts` — modify GET /:layer handler to call `relevanceService.computeSignals` and attach signals to each item in the response
- `packages/server/src/routes/knowledge.ts` — modify GET /:layer/:id handler to trigger single-item relevance recompute after access-log append

**Test:** Integration test: create items with varying access patterns, call GET /:layer, assert response items have `signals` field with correct values.

**Depends on:** T5, T6.

### T8 — Design system: KnowledgeRow signals prop (day 3)

**Files:**
- `packages/design-system/src/KnowledgeRow.tsx` — add `signals` prop and signal triad rendering
- `packages/design-system/html/KnowledgeRow.html` — add signal variant to HTML reference
- `packages/design-system/src/KnowledgeRow.stories.tsx` — add signal stories
- `packages/design-system/src/__tests__/KnowledgeRow.test.tsx` (if exists) — add signal rendering tests

**Test:** Vitest: KnowledgeRow renders signal triad when signals prop is provided. Absent signals render em dash. Without signals prop, renders as before.

**Depends on:** T2 (shared types for signal shape).

### T9 — Web: KnowledgeList sort controls + real data (day 3-4)

**Files:**
- `packages/web/src/pages/KnowledgeList.tsx` — replace MOCK_KNOWLEDGE_ITEMS with API fetch for Triage tab, add sort controls, derive sort from URL params
- `packages/web/src/utils/relative-time.ts` — new file: relative time formatter
- `packages/web/src/__tests__/relative-time.test.ts` — unit tests for the formatter
- `packages/web/src/hooks/useKnowledgeList.ts` (or inline) — data fetching hook

**Test:**
- Vitest: relative-time formatter tests (3h, 2d, 1w, 2mo edge cases).
- Vitest: sort state derived correctly from URL params.

**Depends on:** T7 (API returns signals), T8 (KnowledgeRow accepts signals).

### T10 — Playwright E2E (day 4)

**Files:**
- `packages/web/e2e/l22-knowledge-signals.spec.ts` — new E2E spec

**Tests:**
- Open Knowledge view, assert signal triad visible on rows.
- Assert absent signals show em dash.
- Click sort buttons, assert URL params change.
- Assert list re-orders on sort change.

**Depends on:** T9.

### T11 — Cleanup: close L6 inventory rows + verify (day 4-5)

**Files:**
- `plans/reviews/hardcoded-data-inventory.md` — mark L22 rows as `closed-by: L22`
- Run `bun run verify` — all green

**Depends on:** T10.

---

## 12. Risks and ambiguities

| Risk | Severity | Mitigation |
|---|---|---|
| **Auth context not available in knowledge routes** | Medium | L22 uses a default accessor (`human/anonymous`) when auth context is not wired. The access log still functions; the accessor identity is approximate until auth middleware is wired for knowledge routes. |
| **KnowledgeList still imports MOCK_KNOWLEDGE_ITEMS for the Curated tab** | Low | L22 only replaces the Triage tab data source. The Curated tab continues to use mock data until L23/L25 wire it to the API. This is acceptable per the incremental approach. |
| **knowledge_access_log grows unbounded** | Low | For L22's corpus size (< 1000 items, < 10 accesses/day), the log is tiny. A periodic cleanup job (archive rows > 90 days) is out of L22 scope but documented as a follow-up. |
| **relevance-scoring.ts naming confusion** | Low | The existing `relevance-scoring.ts` (materialization scorer) and the new `relevance-engine.ts` (user-facing L22 composite) have different names and different exports. The `@lore` comment in both files explains the distinction. |
| **Migration numbering** | Low | The next SQLite migration is 0012, the next PG migration is 0010. Verify by reading the `drizzle/meta` and `drizzle-pg/meta` directories before creating the files. |
