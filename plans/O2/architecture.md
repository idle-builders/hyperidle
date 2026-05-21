# O2 Architecture: Schema Migration and Route Rewrite

## Scope

Architecture Tasks 3 + 4 + 5 from `plans/kernel-seperation/architecture.md`. Schema migration, knowledge route rewrite, and route purity for conversations/sessions/tasks.

## Required Reading

- `plans/kernel-seperation/concept.md` — kernel vs strategy definition
- `plans/kernel-seperation/architecture.md` — sections 1, 3, and Task Order 3/4/5
- `plans/work-packages/TRACK-O.md` — O2 acceptance criteria

---

## 1. Current State Inventory

### 1.1 Columns to Strip

**`knowledgeItems`** — remove: `layer`, `scopeId`, `kind`, `attentionScore`, `relevanceScore`, `citationCount`, `lastCitedAt`, `confidence`, `meta`. Keep: `topic` (user-assigned label). Simplify `status` to 3-state (`draft | active | archived`).

**`tasks`** — remove: `riskTier`, `attentionScore`, `durability`, `crossTeam`.

**`sessions`** — remove all 8: `cost`, `costMinor`, `costCurrency`, `tokensJson`, `tokensInput`, `tokensOutput`, `traceId`, `harnessUrl`.

**`items`** — remove: `attentionScore`, `reversibility`, `sandboxResult`, `costEstimate`.

**`artifacts`** — remove: `costMoneyMicros`, `costTokensInput`, `costTokensOutput`, `costSettledAt`.

### 1.2 Indexes to Drop

From `knowledgeItems`: `ki_layer_idx`, `ki_scope_id_idx`, `ki_kind_idx`, `ki_layer_scope_idx`, `ki_attention_desc_idx`.

### 1.3 Inline Strategy Calls in Routes

| File | Call | Disposition |
|---|---|---|
| `conversations.ts:8-9` | `import { routeToFounder }`, `import { routeItem }` | Remove imports and inline calls (lines 147-157) |
| `conversations.ts:147-157` | `routeItem(...)`, `routeToFounder(...)` | Remove. Keep `item_created` event emission. Stop returning `view`/`founderRoute` in response. |
| `conversations.ts:60` | `items.attentionScore` in SQL join | Remove — column being stripped from items. |
| `knowledge.ts:15` | `import { createRelevanceService }` | Remove |
| `knowledge.ts:194-197` | `createRelevanceService(db).computeSignals(...)` | Replace with LEFT JOIN to extension table |
| `knowledge.ts:274-275` | `createRelevanceService(db).recomputeScores(...)` | Remove — emit `knowledge_accessed` event instead, fabric subscribes |
| `knowledge.ts:643` | `attentionScore: 100` in flag handler | Remove — attentionScore is moving to extension table |
| `sessions-routes.ts:19-21,29-30,84-86,121-122` | `harnessUrl`, `tokensInput`, `tokensOutput` in schemas and inserts | Remove from schemas and DB writes |
| `tasks.ts:176` | `traceId: session.traceId ?? ""` | Read traceId differently or remove — column being stripped |
| `bets.ts:222-225` | `tasks.durability`, `tasks.riskTier`, `tasks.attentionScore`, `tasks.crossTeam` | Remove from select or LEFT JOIN extension |
| `bets.ts:237-254` | `sessions.cost`, `sessions.tokensInput`, `sessions.tokensOutput`, `sessions.harnessUrl` | Remove subqueries referencing stripped session columns |
| `rail.ts:77` | `sessions.costMinor`, `sessions.cost` | Remove `sumSessionSpendSince` or rewrite |
| `rail.ts:92-99` | `sessions.tokensJson` | Remove `countWeekTokens` or rewrite |
| `artifacts.ts` (entire cost section) | `costMoneyMicros`, `costTokensInput`, etc. | Remove cost columns from artifact schema, routes, response |

### 1.4 Services That Write Stripped Session Columns

**`session-lifecycle.ts`** — writes `costMinor`, `costCurrency`, `traceId` on session create (line 88-90) and `costMinor`/`costCurrency` on session end (lines 158-159, 219-220). These writes must be removed.

**`handoff-protocol.ts`** — reads `session.traceId` (line used in `SessionContext`). The `SessionContext.traceId` field will need to be sourced differently or removed.

**`observability/dispatcher.ts`** — reads `sessions.traceId` via `createDbTraceIdResolver` (line 151). This is kernel infrastructure (observability stays in kernel per architecture doc). The resolver needs a different source for traceId.

### 1.5 Skill Tools That Reference Strategy Services

| File | Import | Disposition |
|---|---|---|
| `skill-tools/route-item.ts` | `import { routeItem }` | O2 strips the inline call from conversations.ts but does NOT move services (that's O3). The skill-tool import stays — it's not a route. |
| `skill-tools/create-item.ts` | `import { routeItem }` | Same — stays until O3. |
| `skill-tools/score-attention.ts` | `import { buildAttentionService }` | Same — stays until O3. |

**Decision:** O2 removes strategy calls from routes only. Skill-tool imports of strategy services stay until O3 (service move). This matches the AC: "grep ... packages/server/src/routes/" — routes only.

---

## 2. Extension Tables

### 2.1 `knowledge_strategy_fabric`

```typescript
// packages/db/src/schema.ts — under "// --- Strategy: Fabric ---"
export const knowledgeStrategyFabric = sqliteTable(
  "knowledge_strategy_fabric",
  {
    knowledgeItemId: text("knowledge_item_id")
      .primaryKey()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    layer: text("layer").notNull(),
    scopeId: text("scope_id"),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    attentionScore: real("attention_score"),
    relevanceScore: real("relevance_score"),
    confidence: real("confidence"),
    citationCount: integer("citation_count"),
    lastCitedAt: text("last_cited_at"),
    meta: text("meta"),
  },
  (table) => [
    index("ksf_layer_idx").on(table.layer),
    index("ksf_layer_scope_idx").on(table.layer, table.scopeId),
    index("ksf_kind_idx").on(table.kind),
    index("ksf_status_idx").on(table.status),
    index("ksf_attention_desc_idx").on(table.attentionScore),
  ],
);
```

### 2.2 `task_strategy_fabric`

```typescript
export const taskStrategyFabric = sqliteTable(
  "task_strategy_fabric",
  {
    taskId: text("task_id")
      .primaryKey()
      .references(() => tasks.id, { onDelete: "cascade" }),
    riskTier: text("risk_tier"),
    attentionScore: integer("attention_score"),
    durability: text("durability"),
    crossTeam: integer("cross_team").default(0),
  },
  (table) => [
    index("tsf_risk_tier_idx").on(table.riskTier),
    index("tsf_attention_idx").on(table.attentionScore),
  ],
);
```

### 2.3 Inferred Types

Add to the bottom of `schema.ts`:

```typescript
export type KnowledgeStrategyFabricRow = typeof knowledgeStrategyFabric.$inferSelect;
export type NewKnowledgeStrategyFabricRow = typeof knowledgeStrategyFabric.$inferInsert;

export type TaskStrategyFabricRow = typeof taskStrategyFabric.$inferSelect;
export type NewTaskStrategyFabricRow = typeof taskStrategyFabric.$inferInsert;
```

### 2.4 DB Package Index Export

Add the new tables and types to `packages/db/src/index.ts`.

---

## 3. Migration

**Migration file**: `packages/db/drizzle/0015_kernel_strategy_separation.sql`

This is a cutover migration (zero users, zero data). The migration:

1. Creates `knowledge_strategy_fabric` table with FK CASCADE
2. Creates `task_strategy_fabric` table with FK CASCADE
3. Creates indexes on extension tables
4. Uses SQLite's limited ALTER TABLE support — for column removal, we must either:
   - **Option A**: Use `ALTER TABLE ... DROP COLUMN` (SQLite 3.35.0+, supported by Bun's bundled SQLite)
   - **Option B**: Recreate tables via rename-create-copy-drop pattern

**Decision: Option A** — `ALTER TABLE ... DROP COLUMN`. Bun bundles SQLite 3.45+ which supports this. Simpler migration, less error-prone. Each column removal is a separate `ALTER TABLE` statement.

The migration SQL will:
1. CREATE TABLE `knowledge_strategy_fabric` + indexes
2. CREATE TABLE `task_strategy_fabric` + indexes
3. ALTER TABLE `knowledge_items` DROP COLUMN for each of: `layer`, `scope_id`, `kind`, `attention_score`, `relevance_score`, `citation_count`, `last_cited_at`, `confidence`, `meta`
4. Drop indexes: `ki_layer_idx`, `ki_scope_id_idx`, `ki_kind_idx`, `ki_layer_scope_idx`, `ki_attention_desc_idx`
5. ALTER TABLE `tasks` DROP COLUMN for: `risk_tier`, `attention_score`, `durability`, `cross_team`
6. ALTER TABLE `sessions` DROP COLUMN for all 8: `cost`, `cost_minor`, `cost_currency`, `tokens_json`, `tokens_input`, `tokens_output`, `trace_id`, `harness_url`
7. ALTER TABLE `items` DROP COLUMN for: `attention_score`, `reversibility`, `sandbox_result`, `cost_estimate`
8. ALTER TABLE `artifacts` DROP COLUMN for: `cost_money_micros`, `cost_tokens_input`, `cost_tokens_output`, `cost_settled_at`

**Index notes**: SQLite automatically drops indexes on dropped columns. But explicitly named indexes on compound expressions should be verified. The `ki_layer_scope_idx` is a compound index on `(layer, scopeId)` — both columns being dropped, so the index goes with them. For safety, include explicit `DROP INDEX IF EXISTS` statements.

---

## 4. Schema File Changes

### 4.1 `packages/db/src/schema.ts`

**Remove from `knowledgeItems`**: `layer`, `scopeId`, `kind`, `attentionScore`, `relevanceScore`, `citationCount`, `lastCitedAt`, `confidence`, `meta` columns and their index entries (`ki_layer_idx`, `ki_scope_id_idx`, `ki_kind_idx`, `ki_layer_scope_idx`, `ki_attention_desc_idx`).

**Remove from `tasks`**: `durability`, `riskTier`, `attentionScore`, `crossTeam` columns.

**Remove from `sessions`**: `cost`, `costMinor`, `costCurrency`, `tokensJson`, `tokensInput`, `tokensOutput`, `traceId`, `harnessUrl` columns.

**Remove from `items`**: `attentionScore`, `reversibility`, `sandboxResult`, `costEstimate` columns.

**Remove from `artifacts`**: `costMoneyMicros`, `costTokensInput`, `costTokensOutput`, `costSettledAt` columns.

**Add**: `knowledgeStrategyFabric` and `taskStrategyFabric` table definitions (see section 2).

**Add `@lore` comments on `routines`**: governance columns (`delegationAllowed`, `humanReview`, `autonomyLevel`, `silent`, `skillId`) stay on routines with `@lore` explaining why.

---

## 5. Knowledge Route Rewrite

### 5.1 URL Shape Change

| Old | New | Notes |
|---|---|---|
| `GET /` | `GET /` | Keep — resource descriptor, update endpoint list |
| `GET /search` | `GET /search` | Keep — remove layer-specific filtering |
| `GET /:layer` | `GET /` with `?layer=L3` | Merged into list route |
| `GET /:layer/:id` | `GET /:id` | Remove layer constraint from query |
| `POST /:layer` | `POST /` | Layer in request body (optional, for fabric) |
| `PATCH /:layer/:id` | `PATCH /:id` | Remove layer constraint |
| `POST /:layer/:id/merge` | `POST /:id/merge` | Remove layer constraint |
| `POST /:layer/:id/split` | `POST /:id/split` | Remove layer constraint |
| `POST /:layer/:id/archive` | `POST /:id/archive` | Remove layer constraint |
| `POST /:layer/:id/flag` | `POST /:id/flag` | Remove layer constraint |

### 5.2 Detailed Route Handler Changes

**File**: `packages/server/src/routes/knowledge.ts`

1. **Remove imports**: `KNOWLEDGE_LAYERS`, `KnowledgeLayer` from `@hyperidle/fabric`. Remove `createRelevanceService` from services. Add `knowledgeStrategyFabric` from `@hyperidle/db`.

2. **Remove `KnowledgeEnv` type**: No longer needed — no layer in Hono context.

3. **Remove `layerGuard` middleware**: No `:layer` param to validate.

4. **Remove `router.use("/:layer", layerGuard)` and `router.use("/:layer/*", layerGuard)`**: Dead.

5. **Update `createKnowledgeSchema`**: Remove `kind`, `scopeId`, `confidence`, `meta` (strategy columns). Remove `status` (kernel defaults to "draft"). Keep `topic`, `title`, `body`, `format`, `updatedBy`.

6. **Update `updateKnowledgeSchema`**: Remove `kind`, `confidence`, `meta` (strategy columns). Remove `status` — kernel status transitions are `draft -> active -> archived`, controlled by dedicated endpoints. Keep `title`, `body`, `topic`, `format`, `version`, `updatedBy`.

7. **Rewrite `GET /` (list)**:
   - Accept optional `?layer=X` query param for filtering (reads from extension table).
   - LEFT JOIN `knowledgeStrategyFabric` to get pre-computed scores.
   - No inline `computeSignals` call.
   - `@lore` comment: "Kernel route queries strategy extension table — pragmatic boundary compromise to avoid a second round-trip."

8. **Rewrite `GET /:id` (detail)**:
   - Remove layer from path. Query by `id` only.
   - Keep access log write.
   - Remove `recomputeScores` call — emit `knowledge_accessed` event instead.
   - Emit `knowledge_accessed` event via eventBus.

9. **Rewrite `POST /` (create)**:
   - Remove layer from path. Remove `layer`, `scopeId`, `confidence`, `meta` from insert.
   - Set `status: "draft"` (kernel default).
   - Emit `knowledge_created` event.

10. **Rewrite `PATCH /:id` (update)**:
    - Remove layer from path and query.
    - Remove `kind`, `confidence`, `meta` from updatable fields.
    - Emit `knowledge_updated` event.

11. **Rewrite `POST /:id/merge`**:
    - Remove layer from path and query.
    - Emit `knowledge_updated` with action "merged".

12. **Rewrite `POST /:id/split`**:
    - Remove layer from path and query.
    - Remove `layer`, `scopeId` from new item inserts.
    - Emit `knowledge_updated` with action "split".

13. **Rewrite `POST /:id/archive`**:
    - Remove layer from path and query.
    - Emit `knowledge_archived` event.

14. **Rewrite `POST /:id/flag`**:
    - Remove layer from path and query.
    - Remove `attentionScore: 100` write (strategy column).
    - Set status to "draft" (kernel can only flag by reverting to draft, or keep active and emit event for strategy).
    - **Decision**: Flag sets `status: "draft"` in kernel (reverts to needs-attention). Fabric subscribes to `knowledge_updated` with action "flagged" and can set its own status/attentionScore in the extension table.
    - Emit `knowledge_updated` with action "flagged".

### 5.3 Event Emissions

Events are already defined (O1 added them). The routes need to emit them:

```typescript
// knowledge_created — after POST / insert
eventBus.emit({
  type: "knowledge_created",
  streamId: `knowledge:${id}`,
  itemId: id,
  timestamp: Date.now(),
});

// knowledge_accessed — after GET /:id access log write
eventBus.emit({
  type: "knowledge_accessed",
  streamId: `knowledge:${id}`,
  itemId: id,
  accessorKind: "human",
  accessorId: "browser",
  timestamp: Date.now(),
});

// knowledge_archived — after POST /:id/archive
eventBus.emit({
  type: "knowledge_archived",
  streamId: `knowledge:${id}`,
  itemId: id,
  timestamp: Date.now(),
});

// knowledge_updated — after PATCH /:id, merge, split, flag
// (already emitted, but refine to use proper event types)
eventBus.emit({
  type: "knowledge_updated",
  streamId: `knowledge:${id}`,
  itemId: id,
  action: "updated", // or "merged" / "split" / "flagged"
  timestamp: Date.now(),
});
```

### 5.4 Old URL Returns 404

The 404 is automatic: `GET /api/knowledge/:layer/:id` where `:layer` is e.g. "L3" will match `GET /:id` where `id = "L3"`. Since "L3" is not a valid UUID, the DB query returns null and we return 404.

**Wait** — this needs care. `GET /api/knowledge/L3` currently matches `GET /:layer`. After rewrite, `GET /:id` would try to find a knowledge item with `id = "L3"`. That's a 404 since no item has that ID. But `GET /api/knowledge/L3/some-uuid` would match `GET /:id/merge` etc? No — there's no route for `GET /:id/:subId`. It would 404 at the router level. Good.

**Verify**: `GET /api/knowledge/L3/some-uuid` — no matching route pattern, Hono returns 404. Confirmed: the old URL shape returns 404 naturally.

---

## 6. Route Purity (Conversations, Sessions, Tasks)

### 6.1 `packages/server/src/routes/conversations.ts`

**Remove imports**:
- `import { routeToFounder } from "../services/founder-router.js";`
- `import { routeItem } from "../services/item-router.js";`

**Remove from `createItemSchema`**:
- `attentionScore` field (column stripped from items)
- `costEstimate` field (column stripped from items)

**Remove from `POST /items` handler**:
- The `routeItem(...)` call (lines 147-152)
- The `routeToFounder(...)` call (lines 155-158)
- Stop returning `view` and `founderRoute` in the 201 response (line 195)

**Keep**:
- The `item_created` event emission (lines 185-193) — this is a kernel event
- `riskTier` stays on items (kept per architecture doc: "Items stay as kernel")

**Remove from `GET /` handler (attention_score sort)**:
- The `items.attentionScore` reference in the SQL join (line 60) — column being stripped
- The entire `sort === "attention_score"` branch needs rework. Without `items.attentionScore`, this sort is impossible from kernel data alone.
- **Decision**: Remove the `attention_score` sort option. The kernel list route sorts by recency only. Strategy enrichment (attention-based sorting) moves to a fabric-provided endpoint or fabric subscribes and maintains its own view.
- **Alternative**: LEFT JOIN to a strategy extension table. But items don't have an extension table in the O2 plan. The architecture doc says `items` keeps `riskTier`, `blocking` and strips `attentionScore`, `reversibility`, `sandboxResult`, `costEstimate`. No `item_strategy_fabric` table is created.
- **Final decision**: Remove attention_score sort. If `sort=attention_score` is requested, return 400 with a message that this sort is no longer available at the kernel level.

**Remove from `POST /items` handler insert**:
- `attentionScore: body.attentionScore ?? null` — column stripped
- `costEstimate: body.costEstimate ?? null` — column stripped

### 6.2 `packages/server/src/routes/sessions-routes.ts`

**Remove from `createSessionSchema`**:
- `harnessUrl` field
- `tokensInput` field
- `tokensOutput` field

**Remove from `updateSessionSchema`**:
- `tokensInput` field
- `tokensOutput` field

**Remove from `POST /` (create) handler**:
- `harnessUrl`, `tokensInput`, `tokensOutput` from the insert values

**Remove from `PATCH /:id` (update) handler**:
- `tokensInput`, `tokensOutput` from the updates object

**Session events remain unchanged** — `session_started` and `session_ended` are kernel events.

### 6.3 `packages/server/src/routes/tasks.ts`

**Handoff route** (`POST /:id/handoff`):
- The handoff protocol (reassign, transition) is kernel — it stays.
- The `SessionContext.traceId` field is read from `session.traceId` (line 176). Since `traceId` is being stripped from sessions, this needs a fix.

**Decision on traceId**: The `SessionContext` interface includes `traceId` which is used by the observability layer. Since observability is kernel infrastructure (per architecture doc), traceId needs to stay accessible somehow. Two options:
1. Keep `traceId` on sessions (don't strip it) — contradicts the architecture doc.
2. Make `SessionContext.traceId` fallback to empty string or generate a new one.

**Chosen**: `SessionContext.traceId` stays on the interface but is populated differently. In the handoff route, where we construct a minimal `SessionContext`, we pass `""` (which is what the current code does as fallback: `session.traceId ?? ""`). The observability dispatcher already handles missing traceId by generating one from the session ID. The `traceId` column on `sessions` is stripped; `session-lifecycle.ts` will generate and hold traceId in memory (on the `SessionContext`) without persisting it to the DB. The `createDbTraceIdResolver` in the observability dispatcher will need to be updated to not query a non-existent column — it should use the in-memory seed from `session-lifecycle.ts` or fall back to `session:{sessionId}` as a trace key.

**Other task route changes**: None. The task routes don't reference stripped task columns directly (the Drizzle `select().from(tasks)` will naturally exclude removed columns once schema is updated).

### 6.4 `packages/server/src/routes/bets.ts`

The `GET /:id` bet detail route (around line 206) selects task columns including `durability`, `riskTier`, `attentionScore`, `crossTeam` and session columns including `cost`, `tokensInput`, `tokensOutput`, `harnessUrl`.

**Remove from task select**: `durability`, `riskTier`, `attentionScore`, `crossTeam` — these are stripped from tasks table.

**Remove session subqueries**: `latestSessionCost`, `latestSessionTokensInput`, `latestSessionTokensOutput`, `latestSessionHarnessUrl` — these reference stripped session columns.

**Keep**: `latestSessionOutcome` — `outcome` column stays on sessions.

### 6.5 `packages/server/src/routes/rail.ts`

**Remove or rewrite**:
- `sumSessionSpendSince()` — references `sessions.costMinor` and `sessions.cost`, both stripped. Remove function and the spend data from rail response.
- `countWeekTokens()` — references `sessions.tokensJson`, stripped. Remove function and token data from rail response.

**These are strategy concerns** (cost tracking, token tracking). Rail will lose these fields; fabric can provide them via its own endpoint or extension table in O3.

### 6.6 `packages/server/src/routes/artifacts.ts`

**Major rewrite**: The entire cost subsystem on artifacts is being removed.

**Remove**:
- `ArtifactRow` interface fields: `costMoneyMicros`, `costTokensInput`, `costTokensOutput`, `costSettledAt`
- Cost-related logic in `rowToArtifact()`: the `formatArtifactCost` call
- `createArtifactSchema`: the `cost` field
- `POST /` handler: cost column writes
- `PATCH /:id/cost` route: entire endpoint (or keep as 410 Gone)
- Cost body limit and schema

**Keep**: `id`, `producingTaskId`, `kind`, `previewJson`, `createdAt`. Preview routes unchanged.

**Decision on `PATCH /:id/cost`**: Remove entirely. The AC says "remove 4 artifact cost columns" — the cost settle endpoint has no purpose without them. Return 404 naturally (no route registered).

### 6.7 `packages/server/src/services/session-lifecycle.ts`

**Remove from session insert** (line ~88-90): `costMinor: 0`, `costCurrency: "USD"`, `traceId`.

**Remove from session end writes** (lines ~158-159, ~219-220): `costMinor`, `costCurrency`.

**Keep `traceId` generation** in `createSession` — it goes onto `SessionContext` for in-memory use by observability. Just don't write it to the DB.

### 6.8 `packages/server/src/services/handoff-protocol.ts`

**Line 5**: `import { releaseSessionDedup } from "./cost-cap.js";` — this is a strategy service import from a kernel service. O2 does not move services (that's O3), but the `releaseSessionDedup` call at line 312 is an inline strategy call in what is effectively a kernel service.

**Decision**: Leave as-is for O2. The handoff protocol is called from the task route, but `releaseSessionDedup` is a direct function call, not a route-level inline strategy call. The grep AC targets `packages/server/src/routes/` only. The handoff-protocol service-to-service coupling is O3 scope.

### 6.9 `packages/server/src/services/observability/dispatcher.ts`

**`createDbTraceIdResolver`** (line ~147-153): reads `sessions.traceId` which is being stripped.

**Fix**: Change the resolver to derive traceId from session ID (`session:${sessionId}`) instead of reading a DB column. Or use the seed-from-memory path that `session-lifecycle.ts` provides.

Looking at the code more carefully: the resolver has both a `resolve(sessionId)` that queries DB and a `seed(sessionId, traceId)` that sets cache. `session-lifecycle.ts` should call `seed()` when creating a session, and the resolver never needs the DB column. But we need to verify that all session-start paths call `seed()`.

**Chosen approach**: Remove the DB query fallback from `createDbTraceIdResolver`. It becomes a pure cache-based resolver. `session-lifecycle.ts` seeds the traceId on session creation. For sessions where no seed was provided (handoff's minimal SessionContext), the resolver returns a deterministic fallback `session:${sessionId}`.

---

## 7. Shared Types and Format Updates

### 7.1 `packages/shared/src/format/artifact-cost.ts`

The `formatArtifactCost` function and `ArtifactCostInput` type are exported from shared. They reference the artifact cost columns being removed.

**Decision**: Keep the types in shared for now — they are used by the `Artifact` type which the frontend consumes. The artifact route will stop populating cost data, but the type can have cost as `null`. This is a gradual deprecation:
- O2: artifacts.cost always returns `null` in the response
- O3: frontend components stop rendering artifact cost
- Follow-up: remove the type

**Simpler alternative**: Set artifact `cost` to `null` in the route response. The `Artifact` type already allows `cost: string | null`. No type changes needed.

### 7.2 Items Schema in Conversations

The `createItemSchema` in conversations.ts will lose `attentionScore` and `costEstimate`. The schema change is backward-compatible — callers that send these fields will get Zod validation errors, but no existing kernel code sends them (they're strategy-populated fields).

---

## 8. Test Impact

### 8.1 Tests That Must Be Updated

| Test File | Impact | Action |
|---|---|---|
| `routes/__tests__/knowledge.validation.test.ts` | Tests `GET /api/knowledge/:layer` — layer-based URL gone | Rewrite for new URL shape. Layer validation tests become moot. |
| `routes/__tests__/bets.session-enrichment.test.ts` | Tests session enrichment subqueries (tokensInput, harnessUrl, etc.) | Remove session enrichment assertions. Keep outcome assertions. |
| `routes/__tests__/tasks.validation.test.ts` | May reference stripped columns | Audit and update |
| `__tests__/sessions.test.ts` | References `cost`, `tokensInput`, etc. on session schema | Update session create/update tests to not send stripped fields |
| `__tests__/cost-cap.test.ts`, `__tests__/cost-cap.dedup.test.ts` | Reference session cost columns | These test strategy services; they stay but may need schema updates if they use `createTestDb()` |
| `__tests__/L17-money-wire.test.ts` | Tests session cost wire format | May need updates if sessions lose cost columns |

### 8.2 New Tests Required

| Test | File | Validates |
|---|---|---|
| Schema migration runs | `packages/db/src/__tests__/O2-migration.test.ts` | `db:generate && db:migrate` succeeds |
| POST /api/knowledge → 201 + knowledge_created | `packages/server/src/routes/__tests__/knowledge.O2.test.ts` | AC: create emits event |
| GET /api/knowledge/:id → knowledge_accessed | Same file | AC: detail emits event |
| GET /api/knowledge/L3/:id → 404 | Same file | AC: old URL shape rejected |
| Grep: no strategy calls in routes | Validation script or test | AC: grep returns zero |
| Extension tables created with correct FK | Schema test | AC: extension table structure |

---

## 9. Risks and Edge Cases

### 9.1 SQLite ALTER TABLE DROP COLUMN Limitations

SQLite `DROP COLUMN` has restrictions: cannot drop columns that are part of an index, PRIMARY KEY, UNIQUE constraint, or used in a CHECK/DEFAULT expression referencing other columns. Our stripped columns are indexed (e.g., `ki_layer_idx`), so we must **DROP INDEX before DROP COLUMN**.

Migration order within each table:
1. DROP INDEX IF EXISTS on columns being removed
2. ALTER TABLE DROP COLUMN for each column

### 9.2 Drizzle Generate After Schema Changes

After modifying `schema.ts`, running `bun run db:generate` will produce a new migration file. We should write the migration manually (more control) and then verify that `db:generate` produces no additional diff (schema and migration are in sync).

**Approach**: Write migration SQL manually, update schema.ts, then run `db:generate` to verify no drift. If Drizzle's generated migration differs, reconcile.

### 9.3 Session Cost Data Loss

Stripping all 8 session columns means the `rail.ts` cost/token dashboard and `bets.ts` session enrichment lose their data sources. The architecture doc says this is intentional (zero users, cutover rewrite), but it means:
- Rail dashboard loses spend and token counts
- Bet detail loses session cost/token/harness enrichment
- These will return as fabric-provided data in O3

### 9.4 Observability TraceId

The observability dispatcher reads `sessions.traceId` from DB. After column removal:
- Active sessions created before migration: their traceId is lost from DB
- New sessions: traceId lives only in memory (SessionContext)
- The `createDbTraceIdResolver` must not query the dropped column

This is safe because zero users = zero active sessions at migration time.

### 9.5 Handoff SessionContext.traceId

The handoff route constructs a `SessionContext` by reading the session row (line 176: `traceId: session.traceId ?? ""`). After column removal, `session.traceId` won't exist on the Drizzle type. The code must use `""` directly.

### 9.6 Knowledge Status Simplification

Current knowledge items have statuses from the 7-state taxonomy (`captured`, `provisional`, `validated`, `active`, `stale`, `archived`, `needs_human`). After O2, the kernel schema only accepts `draft | active | archived`.

**Migration strategy**: Since zero users/data, no data migration needed. Any test fixtures using 7-state statuses (e.g., `status: "captured"` in `knowledge.validation.test.ts`) must be updated to use 3-state values.

**Status mapping** (for reference, not in migration):
- `captured` / `provisional` / `needs_human` -> `draft`
- `validated` / `active` -> `active`
- `stale` / `archived` -> `archived`

---

## 10. Ordered Task List

### Task 1: Schema changes (schema.ts + migration)

**Files**:
- `packages/db/src/schema.ts` — strip columns, add extension tables, add @lore on routines
- `packages/db/drizzle/0015_kernel_strategy_separation.sql` — migration SQL
- `packages/db/src/index.ts` — export new tables/types

**Steps**:
1. Add `knowledgeStrategyFabric` and `taskStrategyFabric` table definitions to schema.ts
2. Remove stripped columns from `knowledgeItems`, `tasks`, `sessions`, `items`, `artifacts`
3. Remove dropped indexes from schema.ts table definitions
4. Add `@lore` comments on `routines` governance columns
5. Add inferred types for new tables
6. Update `packages/db/src/index.ts` to export new tables
7. Write migration SQL file `0015_kernel_strategy_separation.sql`
8. Run `bun run db:generate` to verify schema-migration sync
9. Run `bun run db:migrate` to verify migration applies
10. Run `bun run check` — expect type errors in downstream packages (routes, services)

**Done when**: `bun run db:generate && bun run db:migrate` succeeds. Schema file has no stripped columns. Extension tables exist.

### Task 2: Fix session-lifecycle.ts and observability dispatcher

**Files**:
- `packages/server/src/services/session-lifecycle.ts` — remove stripped column writes
- `packages/server/src/services/observability/dispatcher.ts` — fix `createDbTraceIdResolver`

**Steps**:
1. Remove `costMinor`, `costCurrency`, `traceId` from session insert in `createSession`
2. Remove `costMinor`, `costCurrency` from session end writes in `endSession` and `crashSession`
3. Keep in-memory `traceId` on `SessionContext` — generate but don't persist
4. Update `createDbTraceIdResolver` to not query `sessions.traceId` — use seed cache only, fallback to `session:${sessionId}`
5. Run `bun run check` — fewer type errors now

**Done when**: `session-lifecycle.ts` and `observability/dispatcher.ts` compile. No references to stripped session columns.

### Task 3: Fix handoff-protocol.ts

**Files**:
- `packages/server/src/services/handoff-protocol.ts` — no changes needed if session type is correct
- `packages/server/src/routes/tasks.ts` — fix `SessionContext.traceId` construction

**Steps**:
1. In `tasks.ts` handoff route: change `traceId: session.traceId ?? ""` to `traceId: ""` (column no longer exists)
2. Verify handoff-protocol.ts compiles (it reads SessionContext.traceId which still exists on the interface)

**Done when**: `tasks.ts` compiles. Handoff path has no references to stripped columns.

### Task 4: Knowledge route rewrite

**Files**:
- `packages/server/src/routes/knowledge.ts` — complete rewrite

**Steps**:
1. Remove `KNOWLEDGE_LAYERS`/`KnowledgeLayer` imports from `@hyperidle/fabric`
2. Remove `createRelevanceService` import
3. Add `knowledgeStrategyFabric` import from `@hyperidle/db`
4. Remove `KnowledgeEnv` type, `layerGuard` middleware, `LayerSchema`
5. Update `createKnowledgeSchema`: remove `kind`, `scopeId`, `confidence`, `meta`, `status`
6. Update `updateKnowledgeSchema`: remove `kind`, `confidence`, `meta`, `status`
7. Rewrite `GET /` — list with optional `?layer=` query param via LEFT JOIN extension table
8. Remove old `GET /:layer` handler
9. Rewrite `GET /:id` — remove layer from query, remove recomputeScores, emit `knowledge_accessed`
10. Rewrite `POST /` — remove layer from path, set `status: "draft"`, emit `knowledge_created`
11. Rewrite `PATCH /:id` — remove layer, remove strategy fields from updates
12. Rewrite `POST /:id/merge` — remove layer
13. Rewrite `POST /:id/split` — remove layer, remove strategy columns from new item insert
14. Rewrite `POST /:id/archive` — remove layer, emit `knowledge_archived`
15. Rewrite `POST /:id/flag` — remove layer, remove attentionScore write, emit `knowledge_updated` with "flagged"
16. Update `emitKnowledgeEvent` helper to emit proper typed events

**Done when**: Knowledge routes compile. No `/:layer/` patterns. Events emitted. `bun run check` passes for knowledge routes.

### Task 5: Route purity — conversations.ts

**Files**:
- `packages/server/src/routes/conversations.ts`

**Steps**:
1. Remove `routeToFounder` and `routeItem` imports
2. Remove `attentionScore` and `costEstimate` from `createItemSchema`
3. Remove `routeItem(...)` and `routeToFounder(...)` calls from POST /items
4. Remove `view`/`founderRoute` from response
5. Remove `attentionScore`/`costEstimate` from insert values
6. Update `GET /` attention_score sort: remove the branch entirely, or return 400 if `sort=attention_score`
7. Remove `items.attentionScore` reference in SQL

**Done when**: `conversations.ts` compiles. No `routeToFounder`/`routeItem` imports or calls.

### Task 6: Route purity — sessions-routes.ts

**Files**:
- `packages/server/src/routes/sessions-routes.ts`

**Steps**:
1. Remove `harnessUrl`, `tokensInput`, `tokensOutput` from `createSessionSchema`
2. Remove `tokensInput`, `tokensOutput` from `updateSessionSchema`
3. Remove stripped fields from POST / insert values
4. Remove stripped fields from PATCH /:id update values

**Done when**: `sessions-routes.ts` compiles. No references to stripped session columns.

### Task 7: Route purity — bets.ts, rail.ts, artifacts.ts

**Files**:
- `packages/server/src/routes/bets.ts`
- `packages/server/src/routes/rail.ts`
- `packages/server/src/routes/artifacts.ts`

**Steps**:
1. **bets.ts**: Remove `durability`, `riskTier`, `attentionScore`, `crossTeam` from task select. Remove `latestSessionCost`, `latestSessionTokensInput`, `latestSessionTokensOutput`, `latestSessionHarnessUrl` subqueries. Keep `latestSessionOutcome`.
2. **rail.ts**: Remove `sumSessionSpendSince()` function and its usage. Remove `countWeekTokens()` function and its usage. Update rail response to omit spend/token data.
3. **artifacts.ts**: Remove cost columns from `ArtifactRow` interface. Remove `formatArtifactCost` usage. Remove `createArtifactSchema.cost` field. Remove cost from insert values. Remove `PATCH /:id/cost` route. Remove cost-related body limit and schema. Update `rowToArtifact` to not reference cost fields.

**Done when**: All three files compile. No references to stripped columns. `bun run check` passes.

### Task 8: Update tests

**Files**:
- `packages/server/src/routes/__tests__/knowledge.validation.test.ts` — rewrite for new URL shape
- `packages/server/src/routes/__tests__/knowledge.O2.test.ts` — new: event emission tests
- `packages/server/src/routes/__tests__/bets.session-enrichment.test.ts` — update
- `packages/server/src/__tests__/sessions.test.ts` — update
- Other test files that reference stripped columns

**Steps**:
1. Update `knowledge.validation.test.ts`: change `/:layer` tests to new URL patterns
2. Write `knowledge.O2.test.ts`: POST → 201 + knowledge_created, GET /:id → knowledge_accessed, old URL → 404
3. Update bet session enrichment test: remove assertions on stripped session/task columns
4. Update session test: remove stripped fields from create/update schemas
5. Audit all test files for references to stripped columns and fix
6. Run `bun run test` — all green

**Done when**: All tests pass. New O2 integration tests prove event emissions and 404 on old URLs.

### Task 9: Verify grep ACs

**Steps**:
1. `grep -rn "routeToFounder\|routeItem\|createRelevanceService\|computeSignals\|recomputeScores" packages/server/src/routes/` → zero hits
2. `bun run check` → zero type errors
3. `bun run lint` → zero lint errors
4. `bun run test` → all green
5. `bun dev` → starts and works

**Done when**: All validation scenarios from TRACK-O.md pass.

---

## 11. Self-Critique

**Scope creep risk**: The bets.ts, rail.ts, and artifacts.ts changes are not explicitly called out in the O2 ACs but are required because they reference stripped columns. The code won't compile without them. This is essential rework, not scope creep.

**traceId removal complexity**: Stripping `traceId` from sessions has a ripple effect through session-lifecycle, handoff, and observability. The in-memory-only approach is correct for a zero-user cutover but would be lossy in production (session restart loses traceId). Acceptable for current state.

**Missing extension tables for items/sessions/artifacts**: The architecture doc only creates extension tables for knowledge and tasks. Items, sessions, and artifacts lose their strategy columns with no extension table to receive them. This is intentional per the architecture doc ("bring back if needed"). The data is not migrated because zero users.

**Frontend impact**: O2's ACs mention no frontend changes, but `packages/web/src/` references stripped columns (e.g., `attentionScore` in KnowledgeList.tsx, `harnessUrl` in WorkBet tests). The architecture doc assigns frontend updates to O3 (Task 7). O2 should NOT touch frontend code — the frontend will break at the type level after O2 merges, and O3 fixes it. But `bun run check` across the monorepo will fail unless we suppress web type errors or fix them.

**Decision**: O2 must also update frontend references to stripped columns to keep `bun run check` passing. This is a minimal fix: remove references to columns that no longer exist in the DB type. The O3 scope is about moving imports from `@hyperidle/shared` to `@hyperidle/fabric` — different concern.

### Task 10 (added): Frontend column reference fixes

**Files**:
- `packages/web/src/pages/KnowledgeList.tsx` — remove `attentionScore` sort
- `packages/web/src/fixtures/knowledge-data.ts` — remove `attentionScore` from fixture type/data
- `packages/web/src/__tests__/WorkBet.session.test.tsx` — update session enrichment assertions
- Any other `.tsx`/`.ts` files referencing stripped column names

**Steps**:
1. Find all frontend references to stripped column names
2. Remove or null-ify each reference
3. Run `bun run check` for web package

**Done when**: `bun run check` passes across the entire monorepo.

---

## 12. Task Dependency Graph

```
Task 1 (schema) ──→ Task 2 (session-lifecycle + observability)
                ──→ Task 3 (handoff/tasks)
                ──→ Task 4 (knowledge routes)
                ──→ Task 5 (conversations.ts)
                ──→ Task 6 (sessions-routes.ts)
                ──→ Task 7 (bets.ts, rail.ts, artifacts.ts)

Tasks 2-7 (all route/service fixes) ──→ Task 8 (tests)
                                     ──→ Task 10 (frontend fixes)

Tasks 8 + 10 ──→ Task 9 (verify all ACs)
```

Tasks 2-7 are independent of each other (they touch different files) and can be done in any order after Task 1. Tasks 2 and 3 should go before 4-7 since route files may import from session-lifecycle.

**Recommended execution order**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 10 → 9
