# Q2 Architecture Plan: Human-authored knowledge at any scope

**Date:** 2026-05-26
**Fixed inputs:** `plans/Q2/concept.md` (locked), `plans/Q2/design/approved.md` (locked)

---

## Required reading

- `plans/human-authoring/concept.md` -- scope vs layer separation, collaborative continuation
- `plans/Q2/concept.md` -- Q2-specific observations, code-doc drift notes
- `plans/Q2/design/approved.md` -- approved UI design (dialog form, scope picker, triggers)
- `docs/knowledge-architecture/the-canonical-store.md` -- target kernel schema with scope_kind + scope_id
- `docs/knowledge-architecture/canonical-shapes.md` -- canonical signatures
- `packages/db/src/schema.ts` -- current kernel + strategy tables
- `packages/db/src/schema.pg.ts` -- Postgres variant (must receive same changes)
- `packages/server/src/routes/knowledge.ts` -- existing CRUD routes
- `packages/fabric/src/types.ts` -- KnowledgeScope, KnowledgeLayer types
- `packages/web/src/pages/KnowledgeList.tsx` -- list page
- `packages/web/src/pages/KnowledgeDetail.tsx` -- detail page
- `packages/web/src/pages/WorkBet.tsx` -- bet detail page
- `packages/web/src/shell/TaskSheet.tsx` -- task detail drawer
- `packages/server/src/middleware/auth.ts` -- HyperIdleEnv, userId context
- `packages/shared/src/events.ts` -- KnowledgeCreatedEvent, KnowledgeUpdatedEvent

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `scope_kind` column on `knowledgeItems` | Does NOT exist. O2 migration dropped `scope_id` from kernel; `scope_kind` was never added. | Migration 0017 adds `scope_kind` + `scope_id` to kernel table. |
| `scope_id` on `knowledgeItems` | Does NOT exist (dropped in O2 migration 0015). Exists on `knowledgeStrategyFabric` only. | Migration 0017 adds `scope_id` back to kernel table. Strategy table's `scopeId` is kept for backward compat but becomes secondary. |
| `KnowledgeScope` type covers all 7 scope kinds | Only covers `"practice" \| "product" \| "factory"` in `packages/fabric/src/types.ts`. | New `SCOPE_KINDS` const + `ScopeKind` type in `packages/shared/src/types.ts` (kernel-level). Fabric's `KnowledgeScope` is deprecated in favor of the shared type. |
| `ScopeKind` type exists | Does NOT exist anywhere in the codebase. | Created in `packages/shared/src/types.ts`. |
| Auth context available on knowledge routes | `userId` IS available via `c.get("userId")` after auth middleware. Knowledge routes receive `HyperIdleDb` but not `HyperIdleEnv` -- they use raw `Hono` not `Hono<HyperIdleEnv>`. | Update `createKnowledgeRoutes` to accept `Hono<HyperIdleEnv>` and read `c.get("userId")`. |
| Products list endpoint exists | YES: `GET /api/products` returns `{ products: [...] }`. | Use for scope_id dropdown (product scope). |
| Teams list endpoint exists | NO dedicated endpoint. Teams accessed through product detail. | Add minimal `GET /api/teams` endpoint returning `{ teams: [{id, name}] }` OR read teams from existing data. Simpler: query teams table directly in a new lightweight endpoint. |
| Bets list endpoint exists | YES: `GET /api/bets` returns grouped bets. | Use for scope_id dropdown (bet scope). |
| Tasks list endpoint exists | Not a standalone list. Tasks accessed through bet detail. | For contextual creation from TaskSheet, scope_id is already known (task.id is passed). No general task-list endpoint needed. |
| `schema.pg.ts` matches `schema.ts` | YES, both lack scope_kind/scope_id. | Both must receive identical column additions. |
| Seed data includes knowledge items | YES: `packages/db/src/seed.ts` inserts knowledge items. | Seed must be updated to include `scope_kind` + `scope_id` on seeded items. |

---

## 1. Type definitions

### 1.1 ScopeKind (packages/shared/src/types.ts)

```typescript
export const SCOPE_KINDS = [
  "factory",
  "product",
  "practice",
  "team",
  "bet",
  "task",
  "user",
] as const;

export type ScopeKind = (typeof SCOPE_KINDS)[number];
```

This is the kernel-level type. Closed enum (concept contract: adding a scope kind requires concept-doc update).

### 1.2 Scope-to-layer mapping (packages/fabric/src/types.ts)

```typescript
import type { ScopeKind } from "@hyperidle/shared";

/**
 * Maps scope kinds that participate in the L0-L4 maturity flow to their
 * default layer. Returns null for scope kinds outside the maturity flow.
 * 
 * @lore Q2: layer assignment is fabric's job. The creation flow does NOT
 * set layer. This function is called by the fabric after item creation.
 */
export const SCOPE_TO_LAYER: Readonly<Record<ScopeKind, KnowledgeLayer | null>> = {
  factory: "L4",
  product: "L2",
  practice: "L3",
  task: "L1",
  bet: null,
  team: null,
  user: null,
};

export function scopeToLayer(scopeKind: ScopeKind): KnowledgeLayer | null {
  return SCOPE_TO_LAYER[scopeKind];
}
```

### 1.3 Deprecation of fabric KnowledgeScope

The existing `KnowledgeScope` in `packages/fabric/src/types.ts` (`"practice" | "product" | "factory"`) is kept for backward compatibility but marked `@deprecated`. New code uses `ScopeKind` from `@hyperidle/shared`. The `KNOWLEDGE_SCOPES` constant is kept but marked deprecated. UI code that imports `KnowledgeScope` from `@hyperidle/fabric/types` must be migrated to `ScopeKind` from `@hyperidle/shared`.

---

## 2. Database migration

### 2.1 Migration 0017: add scope_kind + scope_id to kernel knowledgeItems

**File:** `packages/db/drizzle/0017_Q2_knowledge_scope.sql`

```sql
-- Q2: Add scope_kind and scope_id to kernel knowledge_items table.
-- scope_kind is NOT NULL with default 'factory' so existing rows get a valid value.
-- scope_id is nullable (factory scope has no entity ID).
ALTER TABLE `knowledge_items` ADD COLUMN `scope_kind` text NOT NULL DEFAULT 'factory';
--> statement-breakpoint
ALTER TABLE `knowledge_items` ADD COLUMN `scope_id` text;
--> statement-breakpoint
CREATE INDEX `ki_scope_idx` ON `knowledge_items` (`scope_kind`, `scope_id`);
```

**Rationale for DEFAULT 'factory':** All existing knowledge items were created without scope awareness. Defaulting to `factory` is safe because: (a) existing items are system-level knowledge, (b) the concept doc says factory scope has no scope_id (null is correct for existing rows), (c) the ground-truth doc uses factory as the canonical "unscoped" default.

### 2.2 Schema changes (packages/db/src/schema.ts)

Add to `knowledgeItems` table definition:

```typescript
export const knowledgeItems = sqliteTable(
  "knowledge_items",
  {
    id: text("id").primaryKey(),
    /** Q2: closed scope kind enum. See ScopeKind in @hyperidle/shared. */
    scopeKind: text("scope_kind").notNull().default("factory"),
    /** Q2: entity ID for the scope. Null for factory (there's only one). */
    scopeId: text("scope_id"),
    topic: text("topic"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    format: text("format").notNull(),
    status: text("status").notNull(),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("ki_scope_idx").on(table.scopeKind, table.scopeId),
    index("ki_topic_idx").on(table.topic),
    index("ki_status_idx").on(table.status),
    index("ki_updated_desc_idx").on(table.updatedAt),
  ],
);
```

### 2.3 Postgres schema (packages/db/src/schema.pg.ts)

Identical columns added to the Postgres `knowledgeItems` table:

```typescript
scopeKind: text("scope_kind").notNull().default("factory"),
scopeId: text("scope_id"),
```

Plus the same composite index.

### 2.4 Seed update (packages/db/src/seed.ts)

Existing seed knowledge items get `scopeKind: "factory"` explicitly. Add one user-scoped seed item for test coverage.

---

## 3. API changes

### 3.1 Create knowledge item (POST /api/knowledge)

**Updated Zod schema:**

```typescript
const SCOPE_KINDS_ENUM = [
  "factory", "product", "practice", "team", "bet", "task", "user"
] as const;

const createKnowledgeSchema = z.object({
  topic: z.string().optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  format: z.string(),
  updatedBy: z.string(),
  status: z.enum(KNOWLEDGE_STATUSES).optional(),
  scopeKind: z.enum(SCOPE_KINDS_ENUM),
  scopeId: z.string().nullable().optional(),
});
```

**Validation rules:**
- `scopeKind` is required (no default at API level -- the client must set it explicitly)
- `scopeId` is required when `scopeKind` is NOT `factory`. Validated server-side: return 400 if `scopeKind !== "factory"` and `scopeId` is null/empty.
- `scopeId` must be null when `scopeKind` is `factory`.

**Handler changes:**
- Insert `scopeKind` and `scopeId` into the kernel `knowledgeItems` table.
- Emit `KnowledgeCreatedEvent` (already exists -- no event changes needed for creation).
- The fabric listens for `knowledge_created` events and assigns layer via `scopeToLayer()`. This is out of Q2 scope if the fabric listener doesn't exist yet -- Q2 ships the mapping function, the fabric wires it in a follow-up or Q2 includes a minimal listener.

**Layer assignment on creation:** Q2 includes a post-insert step that upserts a `knowledgeStrategyFabric` row with `layer = scopeToLayer(scopeKind)` when the result is non-null. This is pragmatic: the fabric event listener may not exist yet, and waiting for it means layer is never assigned for human-created items.

### 3.2 Update knowledge item (PATCH /api/knowledge/:id)

No scope fields on the general update endpoint. Scope changes go through the dedicated scope-change endpoint (3.3). This prevents accidental scope changes during normal edits.

### 3.3 Change scope (PATCH /api/knowledge/:id/scope)

**New endpoint.**

```typescript
const changeScopeSchema = z.object({
  scopeKind: z.enum(SCOPE_KINDS_ENUM),
  scopeId: z.string().nullable(),
  reason: z.string().min(1).max(500),
  updatedBy: z.string(),
  version: z.number(),
});
```

**Handler:**
1. Read existing item. 404 if not found.
2. Optimistic locking: check version matches. 409 if conflict.
3. Validate scopeKind/scopeId consistency (same rules as create).
4. If scope hasn't actually changed, return 200 with no-op (idempotent).
5. Update `scope_kind` + `scope_id` on the kernel table.
6. Bump version, update `updatedAt` + `updatedBy`.
7. Insert edit log entries for `scope_kind` and `scope_id` fields (including the reason in `newValue` for the scope_kind entry: `"bet -> product (reason: Promoted to product-level)"` pattern).
8. Update `knowledgeStrategyFabric.layer` via `scopeToLayer(newScopeKind)`.
9. Emit `KnowledgeUpdatedEvent` with `action: "scope_changed"`.
10. Return updated item.

### 3.4 List knowledge items (GET /api/knowledge)

**Changes:**
- The response shape adds `scopeKind` and `scopeId` to each item.
- User-scoped item filtering: read `userId` from `c.get("userId")` (via `HyperIdleEnv`). Filter: `WHERE scope_kind != 'user' OR updated_by = :userId`. This ensures user-scoped items are only visible to their author.
- The route function signature changes: `createKnowledgeRoutes(db: HyperIdleDb, eventBus: EventBus)` becomes `createKnowledgeRoutes(db: HyperIdleDb, eventBus: EventBus): Hono<HyperIdleEnv>` so it can read `c.get("userId")`.

### 3.5 Get single knowledge item (GET /api/knowledge/:id)

**Changes:**
- Same user-scoped filtering: if the item has `scope_kind: "user"` and `updated_by` does not match `c.get("userId")`, return 404 (not 403 -- don't leak existence).
- Response includes `scopeKind` and `scopeId`.

### 3.6 Lightweight teams list (GET /api/teams)

**New endpoint** in `packages/server/src/routes/teams.ts`.

Returns `{ teams: [{ id: string, name: string }] }` -- minimal shape for the scope picker dropdown. The name is derived: if `teams.members` is parseable, use the team lead's name; otherwise fall back to the team ID. Alternatively, since teams don't have a `name` column, return `{ id, productId }` and let the UI show the product name. Design-it-twice decision below (section 7).

---

## 4. Fabric layer assignment

### 4.1 scopeToLayer function

See section 1.2. The mapping:

| scope_kind | layer |
|---|---|
| factory | L4 |
| product | L2 |
| practice | L3 |
| task | L1 |
| bet | null |
| team | null |
| user | null |

### 4.2 Post-creation layer assignment

In the POST /api/knowledge handler, after inserting the kernel row:

```typescript
const layer = scopeToLayer(body.scopeKind);
if (layer !== null) {
  db.insert(knowledgeStrategyFabric)
    .values({
      id: crypto.randomUUID(),
      knowledgeItemId: id,
      layer,
      scopeId: body.scopeId ?? null,
    })
    .onConflictDoUpdate({
      target: knowledgeStrategyFabric.knowledgeItemId,
      set: { layer, scopeId: body.scopeId ?? null },
    })
    .run();
}
```

### 4.3 Post-scope-change layer reassignment

In the PATCH /api/knowledge/:id/scope handler, after updating the kernel row:

```typescript
const newLayer = scopeToLayer(body.scopeKind);
// Upsert: create fabric row if it doesn't exist, or update layer if it does.
const existing = db.select()
  .from(knowledgeStrategyFabric)
  .where(eq(knowledgeStrategyFabric.knowledgeItemId, id))
  .get();

if (existing) {
  db.update(knowledgeStrategyFabric)
    .set({ layer: newLayer, scopeId: body.scopeId ?? null })
    .where(eq(knowledgeStrategyFabric.knowledgeItemId, id))
    .run();
} else if (newLayer !== null) {
  db.insert(knowledgeStrategyFabric)
    .values({
      id: crypto.randomUUID(),
      knowledgeItemId: id,
      layer: newLayer,
      scopeId: body.scopeId ?? null,
    })
    .run();
}
```

---

## 5. UI components

All UI components follow the approved design in `plans/Q2/design/approved.md`. The visual contract is fixed -- this section specifies the implementation details, not the visual hierarchy.

### 5.1 KnowledgeCreateDialog

**File:** `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx`

Co-located page component (not design-system). Same pattern as `ConsequencePreviewDialog` in WorkBet.tsx.

**Props:**
```typescript
interface KnowledgeCreateDialogProps {
  open: boolean;
  defaultScopeKind: ScopeKind;
  defaultScopeId: string | null;
  /** When true, scope fields render as read-only Tags. */
  scopeLocked: boolean;
  onConfirm: (data: {
    title: string;
    body: string;
    scopeKind: ScopeKind;
    scopeId: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}
```

**Entity lists for scope_id dropdown:**
- Product scope: fetch from `GET /api/products` (existing)
- Team scope: fetch from `GET /api/teams` (new, section 3.6)
- Bet scope: when not locked, fetch from `GET /api/bets` (existing)
- Task scope: when not locked, the user is in a task context so scope_id is pre-filled
- Practice scope: free-form text input (practice community IDs are strings, not a lookup table)
- User scope: auto-filled with current user ID from `useCurrentUser()`
- Factory scope: no scope_id field

The dialog fetches entity lists lazily on scope_kind change, using `useFetch` with a conditional URL.

### 5.2 ScopeChangeDialog

**File:** `packages/web/src/pages/knowledge/ScopeChangeDialog.tsx`

Same pattern as KnowledgeCreateDialog but smaller: shows current scope, new scope picker, reason field.

**Props:**
```typescript
interface ScopeChangeDialogProps {
  open: boolean;
  currentScopeKind: ScopeKind;
  currentScopeId: string | null;
  itemVersion: number;
  onConfirm: (data: {
    scopeKind: ScopeKind;
    scopeId: string | null;
    reason: string;
  }) => Promise<void>;
  onCancel: () => void;
}
```

### 5.3 KnowledgeList changes

**File:** `packages/web/src/pages/KnowledgeList.tsx`

Changes:
1. Add "+ New" button in header row.
2. Add `KnowledgeCreateDialog` with state management (`createDialogOpen`).
3. On confirm: POST to `/api/knowledge` with scope + title + body + format="markdown" + updatedBy=user.id.
4. On success: refetch the list.
5. Render "Private" Tag on user-scoped items (check `item.scopeKind === "user"`).

The API response shape changes to include `scopeKind` and `scopeId` -- update the `ApiKnowledgeItem` interface.

### 5.4 KnowledgeDetail changes

**File:** `packages/web/src/pages/KnowledgeDetail.tsx`

Changes:
1. Migrate from fixture data to API data. The detail page currently uses `findDetail()` which reads from fixtures. Q2 converts to `useFetch<KnowledgeItem>(\`/api/knowledge/${knowledgeId}\`)`.
2. Add "Change scope" button in the metadata bar.
3. Add `ScopeChangeDialog` with state management.
4. On confirm: PATCH to `/api/knowledge/:id/scope`.
5. Display current scope_kind as a Tag in the metadata bar.

### 5.5 WorkBet changes

**File:** `packages/web/src/pages/WorkBet.tsx`

Changes:
1. Add "Add knowledge" button after the `BetActionsBar`.
2. Add `KnowledgeCreateDialog` with `scopeLocked: true`, `defaultScopeKind: "bet"`, `defaultScopeId: bet.id`.
3. On confirm: POST to `/api/knowledge`.
4. On success: close dialog (no list to refetch on the bet page).

### 5.6 TaskSheet changes

**File:** `packages/web/src/shell/TaskSheet.tsx`

Changes:
1. Add "Add knowledge" button between ArtifactSection and HostThreadSection.
2. Add `KnowledgeCreateDialog` with `scopeLocked: true`, `defaultScopeKind: "task"`, `defaultScopeId: task.id`.
3. On confirm: POST to `/api/knowledge`.
4. On success: close dialog.

---

## 6. Event changes

### 6.1 KnowledgeCreatedEvent -- no changes needed

The existing event shape is sufficient. The event carries `itemId` -- listeners can read scope from the item.

### 6.2 KnowledgeUpdatedEvent -- no changes needed

The `action: string` field already supports `"scope_changed"` (it is intentionally loose -- see lore in events.ts).

---

## 7. Design-it-twice: Teams endpoint shape

### Option A: Dedicated /api/teams endpoint

```typescript
// GET /api/teams -> { teams: [{ id: string, productId: string }] }
router.get("/", (c) => {
  const rows = db.select({ id: teams.id, productId: teams.productId }).from(teams).all();
  return c.json({ teams: rows });
});
```

**Trade-off:** Simple, follows existing endpoint patterns. But teams don't have a `name` column -- the UI would need to show "Team for [product name]" which requires a JOIN or two fetches.

### Option B: Inline scope entities in knowledge creation

Instead of a dedicated teams endpoint, the knowledge creation dialog fetches teams via the existing product detail endpoint and extracts team data. This avoids a new route file.

**Trade-off:** More complex client-side logic. Breaks if teams are needed elsewhere without a product context.

### Decision: Option A (dedicated /api/teams)

Reason: The scope picker needs a flat list of teams. The product detail endpoint returns teams nested under a product, requiring the client to flatten across all products. A lightweight `/api/teams` endpoint (10 lines) is simpler. The JOIN to products for display name is trivial:

```typescript
const rows = db
  .select({ id: teams.id, productId: teams.productId, productName: products.name })
  .from(teams)
  .innerJoin(products, eq(teams.productId, products.id))
  .all();
```

This returns `{ id, productId, productName }` -- the UI renders "Team / [productName]".

---

## 8. Security and abuse cases

| Concern | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST /api/knowledge | YES | The existing auth middleware + API key gating limits the attack surface. No additional rate limiting for Q2 (single-user desktop app). |
| Rate-limit on PATCH /api/knowledge/:id/scope | YES | Same -- auth-gated, single user. |
| Input-trust boundary for title/body | YES | Title max 200 chars (Zod). Body is markdown -- no HTML execution risk because KnowledgeBody uses DOMPurify. Existing sanitization applies. |
| scope_kind closed enum | YES | Validated by `z.enum(SCOPE_KINDS_ENUM)`. Invalid scope kinds are 400 at the API boundary. |
| scope_id existence validation | PARTIAL | Q2 does NOT validate that the scope_id references a real entity (bet ID exists, product ID exists). This is a pragmatic choice: the kernel doesn't enforce FK relationships for scope_id because scope targets span multiple tables. The UI pre-fills valid IDs; invalid manual API calls get a technically valid but orphaned scope. Follow-up: add optional existence check. |
| User-scoped item access control | YES | GET /api/knowledge filters user-scoped items by `updated_by = userId`. GET /:id returns 404 (not 403) for unauthorized user-scoped items. PATCH /scope does NOT restrict who can change scope -- any authenticated user can. |
| Path traversal | N/A | No file paths involved. |
| SSRF | N/A | No outbound URLs. |
| Secret handling | N/A | No new credentials. |

---

## 9. Protected tests

The following test files exist and their assertions must not change:

```
protectedTests:
  - packages/db/src/__tests__/schema.test.ts
  - packages/db/src/__tests__/migration.test.ts
  - packages/server/src/routes/__tests__/knowledge.test.ts (if exists)
  - packages/web/src/__tests__/KnowledgeList.test.tsx (if exists)
  - packages/web/src/__tests__/KnowledgeDetail.test.tsx (if exists)
  - packages/web/src/__tests__/WorkBet.task-sheet.test.tsx
```

---

## 10. Acceptance criteria and verification

### AC-1: scope_kind column on kernel knowledgeItems table

**Criterion:** `scope_kind` column added as closed enum text, NOT NULL, default "factory". `scope_id` column added as nullable text. Composite index on (scope_kind, scope_id).

**Verification:** Vitest migration test: run migration, query `PRAGMA table_info(knowledge_items)`, assert `scope_kind` (text, notnull=1, dflt_value='factory') and `scope_id` (text, notnull=0) columns exist. Query `PRAGMA index_list`, assert `ki_scope_idx` exists.

### AC-2: ScopeKind type in packages/shared

**Criterion:** `ScopeKind` type and `SCOPE_KINDS` const exported from `@hyperidle/shared`. Includes all 7 values: factory, product, practice, team, bet, task, user.

**Verification:** `bun run check` passes. Import test: `import { SCOPE_KINDS, type ScopeKind } from "@hyperidle/shared"` compiles. Vitest: `SCOPE_KINDS.length === 7`, each value is present.

### AC-3: "New item" action from Knowledge view

**Criterion:** "+ New" button visible in KnowledgeList header. Clicking opens KnowledgeCreateDialog. Default scope: factory.

**Verification:** Playwright E2E: navigate to `/knowledge`, assert `button:has-text("+ New")` is visible, click it, assert dialog with title "New knowledge item" opens, assert scope_kind select value is "factory".

### AC-4: Creation flow fields and validation

**Criterion:** Dialog has scope_kind select, scope_id field (progressive disclosure), title input, body textarea. Create disabled until title and body non-empty. Scope_id required when scope_kind is not factory.

**Verification:** Playwright E2E: open creation dialog, try to click Create with empty fields (disabled), fill title + body, click Create, assert dialog closes. Vitest: POST /api/knowledge with missing scopeKind returns 400; POST with scopeKind="product" and no scopeId returns 400.

### AC-5: Contextual creation from bet detail

**Criterion:** "Add knowledge" button on WorkBet page. Clicking opens dialog with scope=bet, scopeId=bet.id, scope fields locked.

**Verification:** Playwright E2E: navigate to `/work/bet/:betId`, assert "Add knowledge" button visible, click, assert dialog opens with scope Tags showing "bet" and bet ID.

### AC-6: User-scoped items visible only to author

**Criterion:** Items with `scope_kind: "user"` visible only to the user whose ID matches `updated_by`. Other users see 0 user-scoped items.

**Verification:** Vitest integration test: create user-scoped item with `updatedBy: "user-A"`. GET /api/knowledge with userId="user-A" returns the item. GET with userId="user-B" does not return it. GET /api/knowledge/:id with userId="user-B" returns 404.

### AC-7: Scope mutable with version tracking

**Criterion:** PATCH /api/knowledge/:id/scope changes scope_kind + scope_id, bumps version, logs changes in knowledgeEditLog with reason.

**Verification:** Vitest integration test: create item at scope=user, PATCH scope to product with reason. Assert version bumped, edit log has entries for scope_kind and scope_id changes, reason is included. Assert item is now visible to all users.

### AC-8: Same schema/lifecycle for all scopes

**Criterion:** Items at any scope use the same kernel schema. No scope-specific tables or columns.

**Verification:** Vitest: create items at each of the 7 scope kinds. All succeed with the same schema. Read each back and assert identical field set.

### AC-9: Fabric layer assignment

**Criterion:** After creation, items with layer-mapped scopes (factory->L4, product->L2, practice->L3, task->L1) have a `knowledgeStrategyFabric` row with the correct layer. Items with non-mapped scopes (bet, team, user) have null layer.

**Verification:** Vitest: create items at each scope kind. Query `knowledgeStrategyFabric` for each. Assert layer matches SCOPE_TO_LAYER mapping. Assert bet/team/user items have either no fabric row or layer=null.

### AC-10: Scope validation tests

**Criterion:** scope_kind validated as closed enum at API boundary.

**Verification:** Vitest: POST /api/knowledge with `scopeKind: "invalid"` returns 400. POST with each valid scope_kind returns 201. PATCH /scope with invalid scope_kind returns 400.

### AC-11: Playwright E2E -- create from bet detail

**Criterion:** End-to-end: navigate to bet, create knowledge item at bet scope, navigate to knowledge list, see the item.

**Verification:** Playwright: navigate to `/work/bet/:betId`, click "Add knowledge", fill title + body, click Create, navigate to `/knowledge`, assert item with the title appears.

### AC-12: Playwright E2E -- change scope from user to product

**Criterion:** End-to-end: create user-scoped item, change scope to product, verify it becomes visible.

**Verification:** Playwright: create a user-scoped item via the Knowledge view (select scope=user from dropdown), navigate to the item's detail page, click "Change scope", select product, fill reason, save. Navigate back to knowledge list. Assert item no longer shows "Private" tag.

### AC-13: bun run check + lint + test all green

**Criterion:** Zero type errors, zero lint errors, all tests pass.

**Verification:** `bun run verify` exits 0.

---

## 11. Ordered task list

### Phase 1: Types and schema (no UI dependency)

| # | Task | Files | Depends on | Test |
|---|---|---|---|---|
| 1 | Add `SCOPE_KINDS` const + `ScopeKind` type to shared | `packages/shared/src/types.ts`, `packages/shared/src/index.ts` | -- | Vitest: import compiles, length=7, each value present |
| 2 | Add `scopeToLayer` function + `SCOPE_TO_LAYER` map to fabric | `packages/fabric/src/types.ts`, `packages/fabric/src/index.ts` | T1 | Vitest: scopeToLayer("factory")="L4", scopeToLayer("user")=null, etc. |
| 3 | Add `scope_kind` + `scope_id` columns to SQLite schema | `packages/db/src/schema.ts` | T1 | Vitest: schema test, migration test |
| 4 | Generate migration 0017 via `bun run db:generate` | `packages/db/drizzle/0017_*.sql` | T3 | Migration runs without error |
| 5 | Add same columns to Postgres schema | `packages/db/src/schema.pg.ts` | T1 | `bun run check` passes |
| 6 | Update seed with scope_kind on knowledge items | `packages/db/src/seed.ts` | T3 | Seed runs without error |

### Phase 2: API changes

| # | Task | Files | Depends on | Test |
|---|---|---|---|---|
| 7 | Update `createKnowledgeRoutes` to use `Hono<HyperIdleEnv>`, read userId | `packages/server/src/routes/knowledge.ts` | T3 | Vitest: existing tests still pass |
| 8 | Add scope fields to `createKnowledgeSchema`, update POST handler | `packages/server/src/routes/knowledge.ts` | T7 | Vitest: POST with valid scope -> 201, invalid scope -> 400, scopeKind=product without scopeId -> 400 |
| 9 | Add `changeScopeSchema` + PATCH /:id/scope handler | `packages/server/src/routes/knowledge.ts` | T7 | Vitest: scope change -> 200, version bump, edit log entries with reason |
| 10 | Add user-scoped filtering to GET / and GET /:id | `packages/server/src/routes/knowledge.ts` | T7 | Vitest: user-scoped item visible to author, 404 for others |
| 11 | Add scope fields to GET response shape | `packages/server/src/routes/knowledge.ts` | T8 | Vitest: GET / response includes scopeKind + scopeId |
| 12 | Add layer assignment on create + scope change | `packages/server/src/routes/knowledge.ts` | T2, T8, T9 | Vitest: create factory-scoped item -> fabric row with layer=L4 |
| 13 | Add lightweight GET /api/teams endpoint | `packages/server/src/routes/teams.ts` | -- | Vitest: returns team list with productName |

### Phase 3: UI components

| # | Task | Files | Depends on | Test |
|---|---|---|---|---|
| 14 | Create `KnowledgeCreateDialog` component | `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx` | T1 | Vitest: renders, fields present, Create disabled when empty |
| 15 | Create `ScopeChangeDialog` component | `packages/web/src/pages/knowledge/ScopeChangeDialog.tsx` | T1 | Vitest: renders, shows current scope, Save disabled when no change |
| 16 | Wire "+ New" button + create dialog into KnowledgeList | `packages/web/src/pages/KnowledgeList.tsx` | T14, T8 | Vitest + Playwright: button visible, dialog opens, create flow works |
| 17 | Wire "Change scope" button + dialog into KnowledgeDetail | `packages/web/src/pages/KnowledgeDetail.tsx` | T15, T9 | Vitest + Playwright: button visible, scope change flow works |
| 18 | Wire "Add knowledge" button + create dialog into WorkBet | `packages/web/src/pages/WorkBet.tsx` | T14, T8 | Vitest + Playwright: button visible, scope locked to bet |
| 19 | Wire "Add knowledge" button + create dialog into TaskSheet | `packages/web/src/shell/TaskSheet.tsx` | T14, T8 | Vitest + Playwright: button visible, scope locked to task |
| 20 | Add "Private" Tag rendering for user-scoped items in KnowledgeList | `packages/web/src/pages/KnowledgeList.tsx` | T11 | Vitest: user-scoped items render Private tag |
| 21 | Migrate KnowledgeDetail from fixtures to API fetch | `packages/web/src/pages/KnowledgeDetail.tsx` | T11 | Vitest: detail page fetches from API |

### Phase 4: Integration and E2E

| # | Task | Files | Depends on | Test |
|---|---|---|---|---|
| 22 | Playwright E2E: create from Knowledge view at factory scope | `packages/web/e2e/knowledge-create.spec.ts` | T16 | AC-3, AC-4 |
| 23 | Playwright E2E: create from bet detail at bet scope | `packages/web/e2e/knowledge-create.spec.ts` | T18 | AC-5, AC-11 |
| 24 | Playwright E2E: change scope from user to product | `packages/web/e2e/knowledge-scope-change.spec.ts` | T17, T20 | AC-12 |
| 25 | `bun run verify` passes | -- | T1-T24 | AC-13 |

---

## 12. Risks and ambiguities

1. **KnowledgeDetail fixture migration (T21).** The detail page currently uses fixtures + legacy constants (LEGACY_DETAILS). Converting to API fetch is a prerequisite for the "Change scope" button but risks breaking protected tests. Approach: keep LEGACY_DETAILS as a fallback for test IDs (k1, k2) while adding API fetch for real IDs. This matches the existing `findDetail()` pattern.

2. **Teams without names.** The `teams` table has no `name` column. The /api/teams endpoint JOINs to products for a display name. If teams need user-friendly names in the future, a `name` column should be added. For Q2, "Team / Nimmly" is sufficient.

3. **Fabric event listener.** Q2 does inline layer assignment in the route handlers (section 4.2, 4.3) rather than relying on a fabric event listener. This is pragmatic but means layer assignment is coupled to the API layer, not the fabric. The follow-up is to wire a `knowledge_created` / `knowledge_updated` listener in the fabric that calls `scopeToLayer`. The inline assignment is then removed.

4. **Scope_id referential integrity.** Q2 does not validate that scope_id references an existing entity. This means a manual API call could create a knowledge item scoped to a nonexistent bet. The UI prevents this (dropdowns only show existing entities). Server-side existence validation is a follow-up.

5. **KnowledgeScope deprecation.** The fabric type `KnowledgeScope = "practice" | "product" | "factory"` is used in multiple files (KnowledgeList.tsx, KnowledgeDetail.tsx, fixtures). Q2 must migrate these to `ScopeKind` from `@hyperidle/shared`. This is a search-and-replace with type narrowing for the old 3-value set.

---

## 13. Migration checklist

Symbols being moved or reshaped:

| Symbol | Current location | Change | Affected files |
|---|---|---|---|
| `KnowledgeScope` type | `packages/fabric/src/types.ts` | Deprecated, replaced by `ScopeKind` from `@hyperidle/shared` | `packages/web/src/pages/KnowledgeList.tsx` (import), `packages/web/src/pages/KnowledgeDetail.tsx` (import), `packages/web/src/fixtures/knowledge-data.ts` (type) |
| `KNOWLEDGE_SCOPES` const | `packages/fabric/src/types.ts` | Deprecated, replaced by `SCOPE_KINDS` from `@hyperidle/shared` | `packages/web/src/pages/KnowledgeList.tsx` (used in `isKnowledgeScope()`) |
| `scopeId` on `knowledgeStrategyFabric` | `packages/db/src/schema.ts` line 413 | Kept (backward compat) but kernel `scopeId` is now authoritative | `packages/server/src/routes/knowledge.ts` (GET / JOIN), `packages/fabric/src/` (multiple files reference `scopeId`) |
| `createKnowledgeRoutes` signature | `(db, eventBus): Hono` | Changes to `(db, eventBus): Hono<HyperIdleEnv>` | `packages/server/src/app.ts` (caller) |
