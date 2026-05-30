# U1 Architecture — Schema Migration: Products -> Teams + Bet Simplification

## 1. Summary

Forward-only Drizzle migration that renames `products` to `teams` (the domain concept), renames the current `teams` table (agent membership) to `team_members`, simplifies the bet lifecycle enum, renames bet columns, and adds `at_risk`. Cascading type/seed/Zod updates across the monorepo.

**Scope boundary:** U1 renames the domain concept from Product to Team across schema, types, and internal references. This includes Drizzle schema, Zod schemas, shared types, server services/routes (internal variable and file names), fabric references, and web hooks/pages/fixtures. API URL paths (e.g., `/api/products` stays as-is) and user-facing URL slugs are deferred to subsequent workpackages.

---

## 2. Current State Analysis

### 2.1 Table Inventory (affected by U1)

| Current table | Current Drizzle export | U1 target table | U1 Drizzle export |
|---|---|---|---|
| `products` | `products` | `teams` | `teams` |
| `teams` (agent membership) | `teams` | `team_members` | `teamMembers` |
| `bets` | `bets` | `bets` (same) | `bets` (column changes) |

### 2.2 Foreign Key Map (product_id / team_id references)

| Table | Column | References | Action |
|---|---|---|---|
| `teams` (old agent membership) | `product_id` | `products.id` | Becomes `team_members.team_id` -> `teams.id` |
| `bets` | `product_id` | `products.id` | Rename to `team_id` referencing `teams.id` |
| `bets` | `team_id` | `teams.id` (old) | Rename to `team_member_group_id` -- **NO.** See Decision 2.3. |
| `tasks` | `product_id` | `products.id` | Rename to `team_id` referencing `teams.id` |
| `tasks` | `team_id` | `teams.id` (old) | This FK pointed at old `teams` (agent membership). See Decision 2.3. |
| `users` | `team_id` | `teams.id` (old) | Now references `team_members.id` |
| `propagation_log` | `target_level` | Contains literal `"product"` | Update values to `"team"` in migration SQL |

### 2.3 Decision: Handling the two `team_id` columns on `bets` and `tasks`

**Problem:** Currently `bets` and `tasks` each have TWO foreign keys:
- `product_id` -> `products.id` (the "product" / top-level entity)
- `team_id` -> `teams.id` (the agent-membership group assigned to work on it)

After renaming `products` to `teams`, bets/tasks would have a `team_id` pointing at the new `teams` table (formerly products) AND another `team_id` pointing at `team_members` (formerly teams). That is a naming collision.

**Resolution:** The U0 concept doc (`plans/U0/concept.md` section "Noun 1: Team", Composition) and the `@lore L13` annotation in `packages/shared/src/product.ts` line 8 establish: "Product = Team 1:1 invariant." There is exactly one team_members group per product/team. The `team_id` on bets/tasks that currently points at old `teams` (agent membership) is redundant once `product_id` is renamed to `team_id` and points at the new `teams` (formerly products). The old `team_id` column on bets/tasks should be **dropped** after the migration verifies data integrity.

However, dropping a column that has an index and FK is a heavier migration. **U1 will take the conservative approach:**

1. Rename `products` -> `teams` (the table).
2. Rename old `teams` -> `team_members`.
3. On `bets` and `tasks`: rename `product_id` -> `team_id`, and rename old `team_id` -> `team_member_id` (to avoid collision while preserving the FK relationship).
4. On `users`: `team_id` currently references old `teams.id` (agent membership). After renaming old `teams` to `team_members`, the FK auto-updates in SQLite, so `users.team_id` now references `team_members.id`. Rename it to `team_member_id` for clarity. **Wait** -- this would break every reference to `users.teamId` across the codebase. The U0 concept doc says nothing about renaming this. **Keep `users.team_id` as-is**; the FK target table name changes (SQLite handles this on `ALTER TABLE RENAME`), but the column name stays `team_id`. It will now conceptually point at `team_members.id` which is fine -- it means "which team-member group this user belongs to."

**Final column plan for bets:**
- `product_id` -> `team_id` (references new `teams.id`, formerly `products.id`)
- old `team_id` (references old `teams.id`, now `team_members.id`) -> **drop it.** The 1:1 invariant means `team_id` (new, from products) fully determines the team_members group. Keeping a redundant FK adds confusion. The U0 concept doc (`plans/U0/concept.md` section "Noun 1: Team", Contracts — "A Bet belongs to exactly one Team") confirms dropping it.

Actually, re-reading the AC: "renames `products` table to `teams` and all `product_id` columns to `team_id` across bets, tasks, threads, and any other referencing tables." This implies `product_id` columns become `team_id`. But bets/tasks already HAVE a `team_id`. So we must handle the collision.

**Final decision:** 
1. Rename old `teams` table to `team_members` FIRST (so the name `teams` is free).
2. Rename `products` table to `teams`.
3. On tables with both `product_id` and `team_id` (bets, tasks): drop the old `team_id` column (which pointed at old teams / now team_members), then rename `product_id` to `team_id`. The 1:1 invariant means no data loss.
4. Index `bets_product_id_idx` -> recreate as `bets_team_id_idx`. Same for `tasks_product_id_idx`.

### 2.4 Decision: SCOPE_KINDS, KNOWLEDGE_SCOPES, and SCOPE_TO_LAYER are UNCHANGED in U1

**Problem:** `packages/shared/src/types.ts` defines `SCOPE_KINDS = ["factory", "product", "practice", "team", "bet", "task", "user"]`. Both `"product"` and `"team"` already exist as scope kind values. Renaming `"product"` to something else would collide with the existing `"team"` scope kind (which means a team_members group scope, not the domain entity). Additionally, `knowledge_items.scope_kind` rows contain `"product"` values -- renaming the scope kind would require a data migration on that table.

**Resolution:** The `"product"` scope kind value is **kept as-is in U1**. It is a conceptual scope classification (what layer of the knowledge architecture does this item belong to), not a table name. The `"product"` scope kind means "knowledge scoped to a particular product/team domain" and remains valid regardless of the table rename. The `"team"` scope kind means "knowledge scoped to a team_members group" and is unrelated.

This means the following are **explicitly unchanged** in U1:
- `SCOPE_KINDS` in `packages/shared/src/types.ts` -- stays `["factory", "product", "practice", "team", "bet", "task", "user"]`
- `SCOPES_REQUIRING_ID` in `packages/shared/src/types.ts` -- stays `Set(["product", "practice", "team", "bet", "task"])`
- `KNOWLEDGE_SCOPES` in `packages/fabric/src/types.ts` -- stays `["practice", "product", "factory"]` (deprecated, see `@deprecated` annotation)
- `SCOPE_TO_LAYER` in `packages/fabric/src/types.ts` -- stays `{ product: "L2", ... }`
- `scopeToLayer()` function in `packages/fabric/src/types.ts` -- unchanged
- `knowledge_items.scope_kind` column values -- no data migration
- All tests referencing `scopeKind: "product"` -- unchanged

**Divergence note:** After U1, the propagation level `"product"` will be renamed to `"team"` (T2.4, T5.1), but the scope kind `"product"` stays. This is intentional: propagation levels track the entity hierarchy (session -> task -> bet -> team -> portfolio), while scope kinds classify knowledge items. The two taxonomies serve different purposes. A follow-up workpackage may align the scope kind naming, but that requires a data migration on `knowledge_items` and is out of U1 scope.

**Also unchanged:** `packages/fabric/src/role-community-map.ts` line 18 mapping `product_manager: "product"` -- this maps a user role to its community/practice scope. The role name `product_manager` is not being renamed in U1 (it is a USER_ROLE constant, not a table reference).

### 2.5 Bet Status Changes

| Old status | New status | Migration rule |
|---|---|---|
| `shaped` | `draft` | `UPDATE bets SET status='draft' WHERE status='shaped'` |
| `committed` | `active` | `UPDATE bets SET status='active' WHERE status='committed'` (\*) |
| `in_progress` | `active` | `UPDATE bets SET status='active' WHERE status='in_progress'` |
| `behind` | `active` | `UPDATE bets SET status='active' WHERE status='behind'` |
| `blocked` | `active` | `UPDATE bets SET status='active' WHERE status='blocked'` |
| `paused` | `active` | `UPDATE bets SET status='active' WHERE status='paused'` |
| `review` | `active` | `UPDATE bets SET status='active' WHERE status='review'` |
| `shipped` | `completed` | `UPDATE bets SET status='completed' WHERE status='shipped'` |
| `killed` | `killed` | No change |

(\*) **Why `committed` maps to `active`, not `draft`:** In the old lifecycle, `committed` meant "the founders decided to fund this bet and assigned it to a team" -- the bet had already passed the shaping gate and was authorized for execution. In the new lifecycle, `draft` means "created but not yet started." A committed bet has cleared the decision gate and is authorized to proceed, which aligns with `active` (work is sanctioned) rather than `draft` (still pending). The old `shaped -> committed` transition collapses into the new `draft -> active` transition.

### 2.6 Bet Column Renames

| Old column | New column |
|---|---|
| `pitch` | `description` |
| `shipped_at` | `completed_at` |

### 2.7 New Column

| Table | Column | Type | Default |
|---|---|---|---|
| `bets` | `at_risk` | `integer` (SQLite boolean) | `0` (false) |

---

## 3. Migration SQL

The migration must be a **hand-written SQL file** placed in `packages/db/drizzle/` (SQLite) and `packages/db/drizzle-pg/` (PostgreSQL). Drizzle's `db:generate` will produce a destructive drop-and-recreate for renames -- we override with hand-written SQL, following the pattern established by `0018_P2_rename_agents_to_users.sql`.

### 3.1 SQLite Migration: `0021_U1_schema_migration.sql`

```sql
-- U1: Schema Migration — Products -> Teams + Bet Simplification
-- @lore U1: Hand-written migration. Drizzle generates destructive drop-and-recreate
-- for table/column renames. ALTER TABLE RENAME is safe in SQLite 3.25+
-- (better-sqlite3 bundles 3.45+). FK references update automatically when
-- PRAGMA foreign_keys = ON.

-- Step 1: Rename old `teams` (agent membership) to `team_members` FIRST
-- so the name `teams` becomes available for the products rename.
ALTER TABLE `teams` RENAME TO `team_members`;
--> statement-breakpoint

-- Step 2: Rename `products` to `teams`.
ALTER TABLE `products` RENAME TO `teams`;
--> statement-breakpoint

-- Step 3: On bets — drop old team_id (pointed at old teams, now team_members).
-- The 1:1 Product=Team invariant means product_id fully determines the team.
-- Drop the index first, then the column.
DROP INDEX IF EXISTS `bets_product_id_idx`;
--> statement-breakpoint
ALTER TABLE `bets` DROP COLUMN `team_id`;
--> statement-breakpoint

-- Step 4: On bets — rename product_id to team_id.
ALTER TABLE `bets` RENAME COLUMN `product_id` TO `team_id`;
--> statement-breakpoint

-- Step 5: Recreate the index on bets.team_id.
CREATE INDEX `bets_team_id_idx` ON `bets` (`team_id`);
--> statement-breakpoint

-- Step 6: On tasks — drop old team_id (pointed at old teams, now team_members).
DROP INDEX IF EXISTS `tasks_team_id_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `tasks_product_id_idx`;
--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `team_id`;
--> statement-breakpoint

-- Step 7: On tasks — rename product_id to team_id.
ALTER TABLE `tasks` RENAME COLUMN `product_id` TO `team_id`;
--> statement-breakpoint

-- Step 8: Recreate indexes on tasks.
CREATE INDEX `tasks_team_id_idx` ON `tasks` (`team_id`);
--> statement-breakpoint

-- Step 9: Bet status migration.
UPDATE `bets` SET `status` = 'draft' WHERE `status` = 'shaped';
--> statement-breakpoint
UPDATE `bets` SET `status` = 'active' WHERE `status` IN ('committed', 'in_progress', 'behind', 'blocked', 'paused', 'review');
--> statement-breakpoint
UPDATE `bets` SET `status` = 'completed' WHERE `status` = 'shipped';
--> statement-breakpoint

-- Step 10: Rename bet columns.
ALTER TABLE `bets` RENAME COLUMN `pitch` TO `description`;
--> statement-breakpoint
ALTER TABLE `bets` RENAME COLUMN `shipped_at` TO `completed_at`;
--> statement-breakpoint

-- Step 11: Add at_risk boolean column.
ALTER TABLE `bets` ADD COLUMN `at_risk` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- Step 12: Rename team_members.product_id to team_members.team_id
-- (it now references the `teams` table, formerly `products`).
ALTER TABLE `team_members` RENAME COLUMN `product_id` TO `team_id`;
--> statement-breakpoint

-- Step 13: Update propagation_log target_level values.
UPDATE `propagation_log` SET `target_level` = 'team' WHERE `target_level` = 'product';
```

### 3.2 Drizzle Metadata

The migration journal entry (`packages/db/drizzle/meta/_journal.json`) must be updated to include:

```json
{
  "idx": 21,
  "version": "6",
  "when": <current_timestamp_ms>,
  "tag": "0021_U1_schema_migration",
  "breakpoints": true
}
```

A corresponding snapshot file must be created in `packages/db/drizzle/meta/` that reflects the post-migration schema state. This is generated by running `bun run db:generate` AFTER updating `schema.ts` to match the target state.

### 3.3 PostgreSQL Migration: `0014_U1_schema_migration.sql`

The builder derives this line-by-line from the SQLite migration (Section 3.1) with the following PG-specific substitutions:

- **Quoting:** PG uses double-quoted identifiers (`"teams"`) instead of backtick-quoted (`` `teams` ``). The SQLite migration uses backticks throughout.
- **Boolean type:** `at_risk` column uses `boolean DEFAULT false NOT NULL` (PG native boolean) instead of `integer DEFAULT 0 NOT NULL` (SQLite integer-as-boolean).
- **Table/column renames:** PG `ALTER TABLE "x" RENAME TO "y"` and `ALTER TABLE "x" RENAME COLUMN "a" TO "b"` syntax is identical to SQLite.
- **DROP INDEX:** PG syntax is the same (`DROP INDEX IF EXISTS "idx_name"`).
- **DROP COLUMN:** PG `ALTER TABLE "bets" DROP COLUMN "team_id"` is the same pattern.
- **UPDATE statements:** Identical SQL (status migration, propagation_log).
- **FK behavior:** PG does NOT auto-update FK references on table rename (unlike SQLite with `PRAGMA foreign_keys = ON`). However, Drizzle-managed FKs are defined in the TypeScript schema, not as DB-level constraints in PG. The migration only renames tables/columns; FK constraints are managed by Drizzle's schema definition.

The PG migration number continues from the last PG migration (`0013_P2_rename_agents_to_users.sql`).

---

## 4. Schema Changes (Drizzle TypeScript)

### 4.1 `packages/db/src/schema.ts` — Target State

**products -> teams (the domain entity):**
```typescript
export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phase: text("phase").notNull(),
  briefPath: text("brief_path"),
  architecturePath: text("architecture_path"),
  brandPath: text("brand_path"),
  principlesPath: text("principles_path"),
  factoryDbPath: text("factory_db_path"),
  createdAt: text("created_at").notNull(),
});
```

**old teams -> teamMembers:**
```typescript
export const teamMembers = sqliteTable("team_members", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "restrict" }),
  members: text("members"),
  leadAgentId: text("lead_agent_id"),
  capacity: integer("capacity").notNull(),
  activeBets: integer("active_bets").notNull().default(0),
  costCap: integer("cost_cap"),
  costActual: integer("cost_actual").default(0),
  costCapMinor: integer("cost_cap_minor"),
  costCapCurrency: text("cost_cap_currency"),
  formedAt: text("formed_at").notNull(),
  dissolvedAt: text("dissolved_at"),
});
```

**bets changes:**
```typescript
export const bets = sqliteTable(
  "bets",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    // pitch -> description
    description: text("description").notNull(),
    appetite: text("appetite"),
    doneCondition: text("done_condition"),
    hypothesis: text("hypothesis"),
    // Status enum: draft | active | completed | killed
    status: text("status").notNull(),
    revisionLog: text("revision_log"),
    createdAt: text("created_at").notNull(),
    // shipped_at -> completed_at
    completedAt: text("completed_at"),
    // New: at_risk boolean
    atRisk: integer("at_risk").notNull().default(0),
    costAppetiteMinor: integer("cost_appetite_minor"),
    costAppetiteCurrency: text("cost_appetite_currency"),
    costActualMinor: integer("cost_actual_minor"),
    costActualCurrency: text("cost_actual_currency"),
    tokensActualJson: text("tokens_actual_json"),
  },
  (table) => [
    index("bets_team_id_idx").on(table.teamId),
    index("bets_status_idx").on(table.status),
  ],
);
```

**tasks changes:**
```typescript
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    betId: text("bet_id")
      .notNull()
      .references(() => bets.id, { onDelete: "restrict" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    // team_id column (old, pointed at team_members) DROPPED
    ownerAgentId: text("owner_agent_id").references(() => users.id, { onDelete: "restrict" }),
    // ... rest unchanged
  },
  (table) => [
    index("tasks_bet_id_idx").on(table.betId),
    index("tasks_team_id_idx").on(table.teamId),
  ],
);
```

**users:** `team_id` column stays as-is. It now points at `team_members.id` (the FK target table was renamed). The Drizzle reference changes:
```typescript
teamId: text("team_id").references(() => teamMembers.id, { onDelete: "restrict" }),
```

### 4.2 Type Changes

```typescript
// Old
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

// New
export type Team = typeof teams.$inferSelect;       // was Product
export type NewTeam = typeof teams.$inferInsert;     // was NewProduct
export type TeamMember = typeof teamMembers.$inferSelect;  // was Team
export type NewTeamMember = typeof teamMembers.$inferInsert; // was NewTeam
```

### 4.3 `packages/db/src/schema.pg.ts` — Same Changes

Mirror all changes from schema.ts but using `pgTable`, `boolean()` for `atRisk`, etc.

---

## 5. Zod Schema Changes

### 5.1 `packages/db/src/zod-schemas.ts`

```typescript
// Old
import { products, teams, ... } from "./schema.js";
export const selectProductSchema = createSelectSchema(products);
export const selectTeamSchema = createSelectSchema(teams);
export const insertProductSchema = createInsertSchema(products);
export const insertTeamSchema = createInsertSchema(teams);

// New
import { teams, teamMembers, ... } from "./schema.js";
export const selectTeamSchema = createSelectSchema(teams);        // was selectProductSchema
export const selectTeamMemberSchema = createSelectSchema(teamMembers); // was selectTeamSchema
export const insertTeamSchema = createInsertSchema(teams);        // was insertProductSchema
export const insertTeamMemberSchema = createInsertSchema(teamMembers); // was insertTeamSchema
```

---

## 6. Shared Types Changes

### 6.1 `packages/shared/src/types.ts`

```typescript
// Old
export const BET_STATUSES = [
  "shaped", "committed", "in_progress", "behind",
  "blocked", "paused", "review", "shipped", "killed",
] as const;

// New
export const BET_STATUSES = [
  "draft", "active", "completed", "killed",
] as const;
```

### 6.2 `packages/shared/src/product.ts` -> `packages/shared/src/team.ts`

Rename file. Update all type names:
- `ProductStatus` -> `TeamStatus`
- `ProductSummary` -> `TeamSummary`
- `ProductBurn` -> `TeamBurn`
- `ProductDetail` -> `TeamDetail`
- `ProductListItem` -> `TeamListItem`
- `ProductListResponse` -> `TeamListResponse`
- `CreateProductRequest` -> `CreateTeamRequest`
- `CreateProductResponse` -> `CreateTeamResponse`

Keep `BetCardSummary` in this file (it references team context). Update the `BetCardSummary.status` to use the new `BetStatus` type (now `"draft" | "active" | "completed" | "killed"`). Rename `BetCardSummary.pitchTitle` -> `BetCardSummary.descriptionTitle` (the field derives a display title from the bet's description, formerly called pitch). This rename affects 15+ consumer files across web E2E tests, hooks, pages, stories, and server routes (see full list under T2.5).

Update `ProductDetail.activeBets` comment: statuses filter changes from `committed | in_progress` to `active`.

### 6.3 `packages/shared/src/index.ts`

Update all re-exports from `./product.js` to `./team.js`. Rename exported types. Update `deriveTitleFromPitch` re-export to `deriveTitle` (see T2.5).

### 6.4 `packages/shared/src/events.ts`

- `BetStateChangedEvent.streamId`: currently set to `bet.productId`. After rename, set to `bet.teamId`. This is a runtime change.
- `PropagationLevelLiteral`: change `"product"` to `"team"` in the union.

---

## 7. Seed Data Changes

### 7.1 `packages/db/src/seed.ts`

- `db.insert(products)` -> `db.insert(teams)`
- `db.insert(teams)` (old agent membership) -> `db.insert(teamMembers)`
- `teams.productId` -> `teamMembers.teamId`
- `bets.productId` -> `bets.teamId`
- `bets.pitch` -> `bets.description`
- `bets.status: "shaped"` -> `bets.status: "draft"`
- `tasks.productId` -> `tasks.teamId`
- Remove `tasks.teamId` (the old one pointing at team_members -- this column is dropped)
- Import updates: `products` -> `teams`, `teams` -> `teamMembers`

### 7.2 `packages/db/src/seed-pg.ts`

Mirror all changes from seed.ts for the PG seeder.

### 7.3 `packages/db/src/seed-fixtures.ts`

No changes needed -- fixture data is agent/routine-focused, not product/bet-focused.

---

## 8. Index/Export Changes

### 8.1 `packages/db/src/index.ts`

Update all named exports:
- `products` -> `teams` (table export)
- `Product` / `NewProduct` -> `Team` / `NewTeam` (type exports)
- Old `teams` -> `teamMembers` (table export)
- Old `Team` / `NewTeam` -> `TeamMember` / `NewTeamMember` (type exports)

### 8.2 `packages/api-contract/src/settings.ts`

`SettingsProduct` -> `SettingsTeam`. `SettingsResponse.products` -> `SettingsResponse.teams`. `SettingsNotifications.mutedProducts` -> `SettingsNotifications.mutedTeams`.

### 8.3 `packages/api-contract/src/index.ts`

Update re-exports for renamed types.

### 8.4 `mutedProducts` -> `mutedTeams` Blast Radius

The `mutedProducts` field tracks which teams (formerly products) the user has muted for notifications. It must be renamed to `mutedTeams` across all layers:

| File | Change |
|---|---|
| `packages/api-contract/src/settings.ts` (line 55) | `mutedProducts: readonly string[]` -> `mutedTeams: readonly string[]` |
| `packages/api-contract/src/__tests__/contracts.test.ts` | All `mutedProducts` references -> `mutedTeams` (lines 167, 192-205, 233, 501) |
| `packages/server/src/services/server-config.ts` (line 35) | Zod schema: `mutedProducts: z.array(z.string()).default([])` -> `mutedTeams` |
| `packages/server/src/services/server-config.ts` (line 64) | `DeepPartialNotifications.mutedProducts` -> `mutedTeams` |
| `packages/server/src/routes/settings.ts` (lines 44, 112, 149) | All `mutedProducts` references -> `mutedTeams` |
| `packages/server/src/services/__tests__/server-config.test.ts` (lines 31, 43, 79-84) | All `mutedProducts` references -> `mutedTeams` |
| `packages/server/src/__tests__/P3-settings-config.test.ts` (line 75) | `mutedProducts` -> `mutedTeams` |
| `packages/web/src/settings/settings-types.ts` (line 69) | `mutedProducts: string[]` -> `mutedTeams: string[]` |
| `packages/web/src/settings/SettingsNotifications.tsx` (lines 171-176) | All `mutedProducts` references -> `mutedTeams` |
| `packages/web/e2e/fixtures.ts` (line 44) | `mutedProducts: []` -> `mutedTeams: []` |
| `packages/web/e2e/settings.spec.ts` (line 21) | `mutedProducts: []` -> `mutedTeams: []` |
| `packages/web/e2e/settings-redesign.spec.ts` (line 41) | `mutedProducts: []` -> `mutedTeams: []` |
| `packages/web/e2e/M3-api-wiring.spec.ts` (line 26) | `mutedProducts: []` -> `mutedTeams: []` |
| `packages/web/e2e/mock-data-purge.spec.ts` (line 73) | `mutedProducts: []` -> `mutedTeams: []` |
| `packages/web/src/__tests__/M3-AppShell.no-mock.test.tsx` (line 58) | `mutedProducts: []` -> `mutedTeams: []` |
| `packages/web/src/__tests__/AppShell.P4-settings.test.tsx` (line 63) | `mutedProducts: []` -> `mutedTeams: []` |
| `packages/web/src/__tests__/AppShell.test.tsx` (line 18) | `mutedProducts: []` -> `mutedTeams: []` |
| `packages/web/src/hooks/__tests__/useSettings.test.ts` (lines 24, 41) | `mutedProducts` -> `mutedTeams` |

**Stored data migration:** The `server_config` table stores notification preferences as a JSON blob. Existing rows may contain `{"notifications": {"mutedProducts": [...]}}`. The server-config reader (`readServerConfig`) uses Zod with `.default([])` -- renaming the Zod key to `mutedTeams` means old stored JSON with `mutedProducts` will fall through to the default (empty array). This is acceptable: muted-product preferences are non-critical and resettable. No SQL data migration needed.

---

## 9. Server-Side Changes (blast radius)

Every file that imports `products` from `@hyperidle/db` or references `Product` types must be updated. This is the largest category.

### 9.1 Files requiring changes

| File | Change |
|---|---|
| `packages/server/src/routes/products.ts` | Rename to `teams-routes.ts`. Import `teams` instead of `products`. All queries use `teams` table. Route handlers reference `teamId` instead of `productId`. |
| `packages/server/src/routes/bets.ts` | `bets.productId` -> `bets.teamId`. `products` import -> `teams`. `bets.pitch` -> `bets.description`. Status literals: `shaped` -> `draft`, `committed` / `in_progress` -> `active`, `shipped` -> `completed`. `shippedAt` -> `completedAt`. |
| `packages/server/src/routes/tasks.ts` | `tasks.productId` -> `tasks.teamId`. Drop references to old `tasks.teamId`. |
| `packages/server/src/services/product-team.ts` | Rename to `team-lookup.ts`. `loadProductTeam` -> `loadTeamMembers`. `teams.productId` -> `teamMembers.teamId`. Return type changes from `Team` to `TeamMember`. |
| `packages/server/src/services/bet-state-machine.ts` | `bets.productId` -> `bets.teamId`. Status literals updated. `"shipped"` -> `"completed"`. `shippedAt` -> `completedAt`. `VALID_TRANSITIONS` map rebuilt for new statuses. `streamId: bet.productId` -> `streamId: bet.teamId`. |
| `packages/server/src/services/team-management.ts` | References old `teams` table -> now `teamMembers`. |
| `packages/server/src/services/session-provisioning.ts` | If it references `productId`, update. |
| `packages/server/src/services/session-lifecycle.ts` | If it references `productId`, update. |
| `packages/server/src/app.ts` | Route mount: `createProductRoutes` -> `createTeamRoutes`. Import path changes. |
| `packages/server/src/schemas/bet.schema.ts` | `BET_STATUSES` already imported from shared -- will auto-update. `betListResponseSchema` status buckets: `shaped/committed/in_progress/shipped/killed` -> `draft/active/completed/killed`. |
| `packages/server/src/middleware/auth.ts` | If it references products/productId, update. |
| `packages/server/src/routes/knowledge.ts` | `createTeamsRoutes` already exists here -- may need disambiguation. |
| `packages/server/src/routes/settings.ts` | `SettingsProduct` -> `SettingsTeam`. |

### 9.2 Fabric Changes

| File | Change |
|---|---|
| `packages/fabric/src/services/lifecycle-propagation.ts` | `bet.productId` -> `bet.teamId`. `streamId: bet.productId` -> `streamId: bet.teamId`. `targetLevel: "product"` -> `targetLevel: "team"`. All status literals updated. |
| `packages/fabric/src/types.ts` | `PropagationLevel`: `"product"` -> `"team"`. |
| `packages/fabric/src/services/silence-policy.ts` | `team.productId` -> `teamMember.teamId` or similar. |
| `packages/fabric/src/session-context.ts` | `productId` in config -> `teamId`. `products` import -> `teams`. |
| `packages/fabric/src/materialization.ts` | `productId` -> `teamId`. |
| `packages/fabric/src/scoring-config.ts` | `productId` -> `teamId`. |

---

## 10. Web/Frontend Changes (blast radius)

### 10.1 Files requiring changes

| File | Change |
|---|---|
| `packages/web/src/types/bet.ts` | `BetDetail.product` -> `BetDetail.team` (already a string). Status type uses new BetStatus. |
| `packages/web/src/hooks/useProduct.ts` | Rename to `useTeam.ts`. Type changes. |
| `packages/web/src/hooks/useProducts.ts` | Rename to `useTeams.ts`. Type changes. |
| `packages/web/src/pages/WorkProduct.tsx` | Rename to `WorkTeam.tsx`. All `Product` references -> `Team`. |
| `packages/web/src/pages/WorkPortfolio.tsx` | `ProductListItem` -> `TeamListItem`. |
| `packages/web/src/pages/WorkBet.tsx` | Status string changes. `pitch` -> `description`. |
| `packages/web/src/pages/work/BetCreateDialog.tsx` | `BetProduct` -> `BetTeam`. `products` prop -> `teams`. `productId` -> `teamId`. |
| `packages/web/src/settings/SettingsProducts.tsx` | Rename to `SettingsTeams.tsx`. |
| `packages/web/src/settings/settings-types.ts` | `ProductSetting` -> `TeamSetting`. |
| `packages/web/src/shell/Canvas.tsx` | Status references. |
| `packages/web/src/shell/Rail.tsx` | Product references. |
| `packages/web/src/shell/Submenu.tsx` | Product references. |
| `packages/web/src/router.tsx` | Route paths may reference `product` in URL segments. |
| `packages/web/src/api/client.ts` | API endpoint paths (`/api/products` -> may stay for now). |
| `packages/web/src/layouts/AppShell.tsx` | If it references products. |
| Various `__fixtures__` and stories files | Status literals, product references. |

---

## 11. Ordered Task List

### Phase 0: Migration SQL (no code changes yet)

**T0.1** Write `packages/db/drizzle/0021_U1_schema_migration.sql` (SQLite hand-written migration).
- File: `packages/db/drizzle/0021_U1_schema_migration.sql`
- Content: see Section 3.1

**T0.2** Write `packages/db/drizzle-pg/0014_U1_schema_migration.sql` (PostgreSQL hand-written migration).
- File: `packages/db/drizzle-pg/0014_U1_schema_migration.sql`

### Phase 1: Schema + Types (packages/db)

**T1.1** Update `packages/db/src/schema.ts`:
- Rename `products` export to `teams` (table name `"teams"`).
- Rename old `teams` export to `teamMembers` (table name `"team_members"`).
- Update `teamMembers.teamId` FK reference: `() => teams.id`.
- On `bets`: remove old `teamId` field, rename `productId` to `teamId`, rename `pitch` to `description`, rename `shippedAt` to `completedAt`, add `atRisk` column, update index name.
- On `tasks`: remove old `teamId` field, rename `productId` to `teamId`, update index names.
- On `users`: update `teamId` FK reference from `() => teams.id` to `() => teamMembers.id`.
- Update inferred types: `Product`/`NewProduct` -> `Team`/`NewTeam`, old `Team`/`NewTeam` -> `TeamMember`/`NewTeamMember`.

**T1.2** Update `packages/db/src/schema.pg.ts` — mirror all T1.1 changes for PostgreSQL.

**T1.3** Update `packages/db/src/zod-schemas.ts`:
- `selectProductSchema` -> `selectTeamSchema` (from `teams`)
- `selectTeamSchema` -> `selectTeamMemberSchema` (from `teamMembers`)
- `insertProductSchema` -> `insertTeamSchema`
- `insertTeamSchema` -> `insertTeamMemberSchema`

**T1.4** Update `packages/db/src/index.ts` — all named exports updated.

**T1.5** Update `packages/db/src/seed.ts`:
- Import `teams, teamMembers` instead of `products, teams`.
- All insert/update calls updated per Section 7.1.

**T1.6** Update `packages/db/src/seed-pg.ts` — mirror T1.5 for PG.

**T1.7** Update Drizzle migration metadata:
- Add journal entry for `0021_U1_schema_migration` in `packages/db/drizzle/meta/_journal.json`.
- Run `bun run db:generate` to produce the snapshot (or hand-create the snapshot file).
- Add PG journal entry in `packages/db/drizzle-pg/meta/_journal.json`.

### Phase 2: Shared Types (packages/shared)

**T2.1** Update `packages/shared/src/types.ts`:
- `BET_STATUSES` -> `["draft", "active", "completed", "killed"]`
- `MUTABLE_BET_FIELDS` -> review and update if needed (e.g., `"cost_appetite"` stays, `"done_condition"` and `"hypothesis"` stay).

**T2.2** Rename `packages/shared/src/product.ts` -> `packages/shared/src/team.ts`. Update all type names per Section 6.2.

**T2.3** Update `packages/shared/src/index.ts` — update re-exports per Section 6.3.

**T2.4** Update `packages/shared/src/events.ts`:
- `PropagationLevelLiteral`: `"product"` -> `"team"`.

**T2.5** Update `packages/shared/src/format/bet.ts` — rename function and parameter:
- `deriveTitleFromPitch(pitch: string, betId: string)` -> `deriveTitle(description: string, betId: string)`.
- Update the JSDoc: "Derive a display title from the bet's description markdown."
- Update `@lore` annotation: `pitch` references -> `description`.
- Update `packages/shared/src/index.ts` re-export: `deriveTitleFromPitch` -> `deriveTitle`.
- All consumers must update (server routes, web BetCreateDialog, etc. -- see T4.3, T4.4, T6.3).

**T2.6** Update `BetCardSummary.pitchTitle` -> `BetCardSummary.descriptionTitle` in `packages/shared/src/team.ts` (renamed from product.ts in T2.2). Consumer files requiring update:
- `packages/server/src/routes/products.ts` (line 335, `pitchTitle: derivePitchTitle(...)` -> `descriptionTitle: deriveTitle(...)`) -- also rename the local `derivePitchTitle` wrapper or remove it in favor of the shared `deriveTitle`
- `packages/web/src/pages/WorkProduct.tsx` (line 344) -> `bet.descriptionTitle`
- `packages/web/src/pages/WorkProduct.stories.tsx` (lines 26, 34) -> `descriptionTitle`
- `packages/web/src/__tests__/WorkProduct.test.tsx` (line 38) -> `descriptionTitle`
- `packages/web/src/hooks/__tests__/useProduct.test.ts` (line 41) -> `descriptionTitle`
- `packages/web/src/__tests__/hints.integration.test.tsx` (line 60) -> `descriptionTitle`
- `packages/web/e2e/lifecycle-propagation.spec.ts` (lines 71, 91) -> `descriptionTitle`
- `packages/web/e2e/L17-cost-tokens.spec.ts` (line 97) -> `descriptionTitle`
- `packages/web/e2e/L13-product-drilldown.spec.ts` (line 64) -> `descriptionTitle`
- `packages/web/e2e/accessibility.spec.ts` (line 92) -> `descriptionTitle`
- `packages/web/e2e/accessibility-K8.spec.ts` (line 101) -> `descriptionTitle`
- `packages/web/e2e/touch-targets.spec.ts` (line 206) -> `descriptionTitle`

### Phase 3: API Contract (packages/api-contract)

**T3.1** Update `packages/api-contract/src/settings.ts`:
- `SettingsProduct` -> `SettingsTeam`.
- `SettingsResponse.products` -> `SettingsResponse.teams`.
- `SettingsNotifications.mutedProducts` -> `SettingsNotifications.mutedTeams`.

**T3.2** Update `packages/api-contract/src/index.ts` — re-exports.

### Phase 4: Server (packages/server)

**T4.1** Update `packages/server/src/services/product-team.ts` (rename file to `team-lookup.ts`):
- `loadProductTeam` -> `loadTeamMembers`.
- Queries `teamMembers` table instead of `teams`.
- Return type: `TeamMember` instead of old `Team`.

**T4.2** Update `packages/server/src/services/bet-state-machine.ts`:
- Rebuild `VALID_TRANSITIONS` for `draft | active | completed | killed`.
- `"shipped"` logic -> `"completed"`.
- `shippedAt` -> `completedAt`.
- `bet.productId` -> `bet.teamId`.
- `streamId: bet.productId` -> `streamId: bet.teamId`.

**T4.3** Update `packages/server/src/routes/products.ts` (rename to `teams-routes.ts`):
- All `products` table refs -> `teams`.
- `productId` params -> `teamId` (internal variable names).
- Status literals updated.
- Import `teamMembers` instead of old `teams` for agent-membership queries.
- Function name: `createProductRoutes` -> `createTeamRoutes`.

**T4.4** Update `packages/server/src/routes/bets.ts`:
- `bets.productId` -> `bets.teamId`.
- `bets.pitch` -> `bets.description`.
- `products` table -> `teams`.
- `loadProductTeam` -> `loadTeamMembers`.
- Status literals: `shaped` -> `draft`, `committed` -> `active`, `shipped` -> `completed`.
- `createBetSchema.productId` -> `createBetSchema.teamId`.
- `shippedAt` -> `completedAt`.

**T4.5** Update `packages/server/src/routes/tasks.ts`:
- `tasks.productId` -> `tasks.teamId`.
- Remove any references to dropped `tasks.teamId` (old).

**T4.6** Update `packages/server/src/services/team-management.ts`:
- `teams` -> `teamMembers` table references.

**T4.7** Update `packages/server/src/app.ts`:
- `createProductRoutes` -> `createTeamRoutes`.
- Import path: `./routes/products.js` -> `./routes/teams-routes.js`.

**T4.8** Update `packages/server/src/schemas/bet.schema.ts`:
- `betListResponseSchema` buckets updated for new statuses.

**T4.9** Update `packages/server/src/routes/settings.ts`:
- Product references -> Team references.
- `mutedProducts` -> `mutedTeams` (Zod schema on line 44, response type on line 112, response mapping on line 149).

**T4.10** Update `packages/server/src/services/server-config.ts`:
- `NotificationsSchema`: `mutedProducts` -> `mutedTeams` (line 35).
- `DeepPartialNotifications`: `mutedProducts` -> `mutedTeams` (line 64).

**T4.11** Update `packages/server/src/routes/bets.ts` and `packages/server/src/routes/products.ts` (before rename to teams-routes.ts):
- Replace `deriveTitleFromPitch` import with `deriveTitle`.
- Replace `derivePitchTitle` local wrapper in products.ts with direct `deriveTitle` call.
- `pitchTitle` in response objects -> `descriptionTitle`.

**T4.12** Update remaining server files that reference `productId`, `Product`, `products` (search and replace pass).

### Phase 5: Fabric (packages/fabric)

**T5.1** Update `packages/fabric/src/types.ts`:
- `PropagationLevel`: `"product"` -> `"team"`.
- **No change** to `KNOWLEDGE_SCOPES`, `KnowledgeScope`, `SCOPE_TO_LAYER`, or `scopeToLayer()` -- per Decision 2.4, `"product"` is kept as a scope kind value.

**T5.2** Update `packages/fabric/src/services/lifecycle-propagation.ts`:
- `bet.productId` -> `bet.teamId`.
- `streamId` changes.
- `"product"` level literals -> `"team"`.
- Status literals in transition maps.

**T5.3** Update `packages/fabric/src/session-context.ts`:
- `productId` -> `teamId`.
- `products` table -> `teams`.

**T5.4** Update `packages/fabric/src/materialization.ts`:
- `productId` -> `teamId`.

**T5.5** Update `packages/fabric/src/scoring-config.ts`:
- `productId` -> `teamId`.

**T5.6** Update `packages/fabric/src/services/silence-policy.ts`:
- `team.productId` references.

### Phase 6: Web (packages/web)

**T6.1** Rename and update web type files.
**T6.2** Update hooks (`useProduct` -> `useTeam`, `useProducts` -> `useTeams`).
**T6.3** Update pages (WorkProduct -> WorkTeam, WorkPortfolio, WorkBet, BetCreateDialog). In BetCreateDialog: `deriveTitleFromPitch` import -> `deriveTitle`. All `pitchTitle` references -> `descriptionTitle`.
**T6.4** Update settings components. In `SettingsNotifications.tsx`: `mutedProducts` -> `mutedTeams`. In `settings-types.ts`: `mutedProducts` -> `mutedTeams`.
**T6.5** Update shell components (Canvas, Rail, Submenu).
**T6.6** Update router, fixtures, stories. In E2E fixtures and specs: `mutedProducts: []` -> `mutedTeams: []`, `pitchTitle` -> `descriptionTitle` (see full file list under Section 8.4 and T2.6).

### Phase 7: Design System (packages/design-system)

**T7.1** Update `BetCard.tsx` and `BetCard.stories.tsx` — status prop values.

### Phase 8: Tests

**T8.1** Update all test files referencing old table names, status values, column names.
- This is the largest mechanical task. Every test file in the grep output (Section 4 of the investigation) must be checked.

### Phase 9: Verification

**T9.1** Run `bun run db:generate` and verify it produces no additional migration (schema.ts matches the migration).
**T9.2** Run `bun run db:migrate` on a fresh database. Verify `SELECT * FROM teams` returns product data.
**T9.3** Run `bun run check` — zero type errors.
**T9.4** Run `bun run lint` — zero lint errors.
**T9.5** Run `bun run test` — all green.

---

## 12. Risk Analysis

### R1: FK Constraint Handling During Table Rename

**Risk:** SQLite's `ALTER TABLE RENAME` updates FK references when `PRAGMA foreign_keys = ON`. However, the Drizzle migrator may or may not have `foreign_keys` enabled during migration.

**Mitigation:** The migration runner in `packages/db/src/migrate.ts` already sets `sqlite.pragma("foreign_keys = ON")` before running migrations. Verify this is true. If FKs are OFF during migration, the column-level FK references in the Drizzle schema definition (not the DB) are what matter -- and those are updated in T1.1.

**Severity:** Medium. **Likelihood:** Low (precedent: 0018 migration did the same rename pattern successfully).

### R2: Existing `teams` Table Name Collision

**Risk:** Renaming `products` to `teams` collides with the existing `teams` table.

**Mitigation:** The migration renames old `teams` to `team_members` FIRST (Step 1), then renames `products` to `teams` (Step 2). Order is critical. The `statement-breakpoint` separator ensures sequential execution.

**Severity:** High (migration fails entirely if misordered). **Likelihood:** Low (order is explicit in the SQL).

### R3: Status Value Migration Data Integrity

**Risk:** Existing bets with statuses like `in_progress`, `behind`, `blocked`, `paused`, `review` all collapse to `active`. Information about sub-state (behind/blocked/paused) is lost.

**Mitigation:** This is intentional per the U0 concept doc (`plans/U0/concept.md` section "Noun 2: Bet", Lifecycle). The `at_risk` boolean replaces the need for `behind`. `blocked` and `paused` are operational sub-states that the new simpler model does not track at the bet level. The revision log preserves the full history of state transitions.

**Severity:** Low (by design). **Likelihood:** N/A (intended behavior).

### R4: Two `team_id` Columns on bets/tasks

**Risk:** After dropping the old `team_id` and renaming `product_id` to `team_id`, any code that referenced the OLD `team_id` (pointing at team_members) will silently compile against the NEW `team_id` (pointing at teams) with different semantics.

**Mitigation:** TypeScript compiler will catch type mismatches where the old `Team` type (now `TeamMember`) is expected. Comprehensive grep + test pass in Phase 8.

**Severity:** High (silent semantic shift). **Likelihood:** Medium (many files reference `teamId`).

### R5: Migration Ordering Between SQLite and PG

**Risk:** SQLite and PG migrations have independent numbering. If they drift, `seed-parity.test.ts` fails.

**Mitigation:** Update both in the same commit. Run parity test.

**Severity:** Medium. **Likelihood:** Low.

### R6: Drizzle Generate Producing Extra Migration

**Risk:** After updating schema.ts, `bun run db:generate` may produce an additional auto-generated migration that conflicts with or duplicates the hand-written one.

**Mitigation:** Run `db:generate` AFTER writing the hand-written migration AND updating schema.ts. If it produces additional SQL, inspect it and either merge into the hand-written file or suppress it. The snapshot metadata must match the post-migration schema state.

**Severity:** Medium. **Likelihood:** Medium (Drizzle often generates extra changes for renamed entities).

### R7: Large Blast Radius

**Risk:** The grep search found 170+ files referencing `product`/`Product`/`product_id`. Missed updates cause type errors or runtime bugs.

**Mitigation:** Phase ordering (db -> shared -> api-contract -> server -> fabric -> web) ensures downstream packages fail to compile early if upstream changes are incomplete. `bun run check` in Phase 9 catches all remaining issues. The builder should do a systematic search-and-replace pass per package, not ad-hoc edits.

**Severity:** Low (type system catches). **Likelihood:** High (volume of changes).

---

## 13. Self-Critique

### What could be over-engineered?
- The team_members rename adds complexity. An alternative is to just rename `products` to `teams` and leave the old `teams` table as `agent_teams` or similar. But `team_members` is the U0 concept doc's decision (`plans/U0/concept.md` section "Noun 1: Team", Schema Migration).

### What is missing?
- The PG migration content (Section 3.3) is described but not fully specified. The builder should derive it from the SQLite migration with PG syntax adjustments.
- E2E test updates are mentioned but not enumerated file-by-file. The builder should grep and update.
- The `packages/web/src/router.tsx` URL paths (e.g., `/work/:productId`) may need updating. This is out of U1 scope per the scope boundary statement, but worth flagging.

### What is the biggest risk?
- R4 (silent semantic shift of `teamId`) is the most dangerous. The builder must verify every `teamId` reference post-migration to ensure it points at the correct table (teams vs team_members).
- R6 (Drizzle generate) is the most likely to cause friction. The builder should be prepared to hand-edit the snapshot.

---

## 14. Acceptance Criteria Verification Map

| AC | Verification method |
|---|---|
| 1. Drizzle migration renames products->teams, product_id->team_id | Migration test: run migration, `SELECT * FROM teams` returns product data. `SELECT * FROM sqlite_master` shows no `products` table. |
| 2. Existing teams renamed to team_members | Migration test: `SELECT * FROM team_members` returns old team data. |
| 3. Bet status enum: draft, active, completed, killed | `bun run check` (type errors if old statuses used). Migration test: `SELECT DISTINCT status FROM bets` returns only new values. |
| 4. pitch->description, shipped_at->completed_at | Migration test: column name verification. Schema test. |
| 5. at_risk boolean on bets | Migration test: `SELECT at_risk FROM bets` returns 0 for all rows. |
| 6. Zod schemas updated | `bun run check`. Schema test against new table shapes. |
| 7. TS types updated (Product->Team) | `bun run check` with zero errors. |
| 8. Seed data updated | `bun run test` (seed tests pass). Fresh db + seed + query verification. |
| 9. db:generate clean, db:migrate applies | `bun run db:generate` produces no new migration. `bun run db:migrate` succeeds. |
| 10. bun run check passes | `bun run check` zero errors. |
