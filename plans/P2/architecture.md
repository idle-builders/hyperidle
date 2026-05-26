# P2 Architecture Plan: Unified User Primitive and OrgChart

## Required reading

- `plans/config-setup/concept.md` -- User and OrgChart primitive definitions, vocabulary lock, kernel/strategy classification
- `packages/db/src/schema.ts` -- current SQLite schema (agents table at line 24)
- `packages/db/src/schema.pg.ts` -- current PostgreSQL schema (agents table at line 25)
- `packages/db/src/index.ts` -- public exports from @hyperidle/db (Agent/NewAgent types, agents table)
- `packages/server/src/middleware/auth.ts` -- createAuthMiddleware reads founder_id from factorySettings
- `packages/server/src/routes/agents.ts` -- createAgentRoutes (5 endpoints under /agents)
- `packages/server/src/routes/auth.ts` -- GET /api/auth/me reads founder_name/email from factorySettings
- `packages/server/src/routes/settings.ts` -- buildSettingsResponse reads founder_name/email from factorySettings
- `packages/server/src/routes/threads.ts` -- readSenderId/readInitialSenderId use c.get("userId")
- `packages/server/src/app.ts` -- route mounting (line 257: api.route("/agents", ...))
- `packages/db/src/seed.ts` -- SQLite seed (agents table inserts, factorySettings founder_* keys)
- `packages/db/src/seed-pg.ts` -- PostgreSQL seed (same)
- `packages/db/src/seed-fixtures.ts` -- shared fixture data between SQLite/PG seeds
- `packages/shared/src/types.ts` -- AgentRole, AgentStatus, AGENT_ROLES, KERNEL_AGENT_ROLES
- `packages/api-contract/src/auth.ts` -- AuthMeResponse type
- `packages/api-contract/src/settings.ts` -- SettingsResponse with agents array
- `packages/fabric/src/services/lifecycle-propagation.ts` -- reads founder_id from factorySettings (line 487-494)
- `packages/fabric/src/services/founder-router.ts` -- routeToFounder pure function

---

## Phase 0: Interrogation

### Q1: Migration strategy -- ALTER TABLE RENAME vs CREATE + COPY?

SQLite supports `ALTER TABLE agents RENAME TO users` since 3.25.0. Drizzle's generated migrations use this. The question is whether Drizzle's `db:generate` will produce a clean rename migration or try to drop-and-recreate (which would lose data).

**Decision:** Write the migration SQL by hand. Drizzle's `db:generate` sees schema changes between snapshots and can produce destructive migrations for renames. A hand-written migration with `ALTER TABLE agents RENAME TO users` followed by `ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'ai'` and `ALTER TABLE users ADD COLUMN email TEXT` / `ALTER TABLE users ADD COLUMN avatar_url TEXT` is the safe path. Register it in the Drizzle migration journal manually. Same approach for PostgreSQL.

### Q2: Should FK columns in dependent tables be renamed (e.g., `owner_agent_id` to `owner_user_id`)?

Six tables have FK columns referencing agents: tasks.ownerAgentId, sessions.agentId, routines.ownerAgentId, messages.senderId, items.sourceAgentId, agentSkills.agentId. The concept doc says "agents table renamed to users." It does not mandate renaming FK columns.

**Decision:** Do NOT rename FK columns in this workpackage. Rationale: (1) Renaming 6 FK columns requires 6 additional ALTER TABLE statements per dialect, each with index rebuilds. (2) The FK column names are internal -- they point to the users table via the REFERENCES clause, which SQLite updates automatically on ALTER TABLE RENAME. (3) Column renames in SQLite require the full create-copy-drop dance (SQLite doesn't support ALTER TABLE RENAME COLUMN until 3.25 but even then Drizzle may not handle it cleanly). (4) The blast radius quadruples for negligible semantic gain. The Drizzle schema in TypeScript will use `.references(() => users.id)` which is the load-bearing contract; the physical column name `owner_agent_id` is a cosmetic concern.

**Exception:** The `agent_skills` table is renamed to `user_skills` because "agent_skills" as a table name directly contradicts the vocabulary lock. The table name is the public-facing contract (unlike column names which are internal).

### Q3: What happens to the `system:propagation` seed user?

The seed creates a `system:propagation` entry in agents with `role: "system"`. This is an internal system actor, not a human or an AI agent. Under the User primitive, it gets `kind = "ai"` by default (since the migration backfills all existing rows with "ai").

**Decision:** Keep `system:propagation` as `kind = "ai"`. System actors are a subset of AI users -- they have no soul prompt, no sessions, but they need to exist for FK constraints (messages.senderId). The "system" role already distinguishes them. Adding a third `kind` value ("system") would violate the closed enum.

### Q4: How does auth middleware resolve the human user without a per-user API key?

AC7 says "auth middleware resolves user from users table instead of hardcoding u-founder." But the current auth is a shared API key -- there's no per-user authentication. The middleware cannot map an API key to a specific human user.

**Decision:** For v1 (single-human desktop mode), the auth middleware queries `users WHERE kind = 'human' LIMIT 1` after API key validation. If exactly one human user exists, that's the authenticated identity. If zero exist, fall back to a well-known sentinel (maintain backward compat for unseeded DBs). If multiple exist (shared backend, future), the first one wins -- multi-user auth is explicitly out of scope. This replaces the `factorySettings.founder_id` lookup.

### Q5: Should `founder_router.ts` be updated in P2?

The `routeToFounder` function in fabric returns "ceo" | "cpo" | "both" based on agent role. With the OrgChart, routing should eventually use org edges. But AC8 says "when no org edges exist, all human users receive all reviews."

**Decision:** `founder-router.ts` is NOT modified in P2. It's a strategy-layer function that will be replaced when OrgChart routing is wired (a separate concern, likely in a follow-up). P2 creates the org_edges table and API but does not wire routing logic. The fallback behavior (AC8) is implemented as a standalone query function, not by modifying founder-router.

---

## Phase 1: Plan reconciliation (spec vs reality)

### Verified symbols and shapes

| Symbol | Expected | Actual | Action |
|--------|----------|--------|--------|
| `agents` table (SQLite) | Exists at schema.ts:24 | Confirmed, 14 columns | Rename to `users`, add 3 columns |
| `agents` table (PG) | Exists at schema.pg.ts:25 | Confirmed, 13 columns (no costActual) | Same rename + add |
| `factorySettings.founder_id` | Used in auth.ts:84-89 | Confirmed | Eliminate; resolve from users table |
| `factorySettings.founder_name` | Used in auth.ts:63-67, settings.ts:135-139 | Confirmed | Eliminate; read from users.name |
| `factorySettings.founder_email` | Used in auth.ts:68-72, settings.ts:140-144 | Confirmed | Eliminate; read from users.email |
| `createAgentRoutes` | Mounted at app.ts:257 | Confirmed | Rename to createUserRoutes |
| `/api/agents` route path | Mounted at app.ts:257 | Confirmed | Change to `/api/users` |
| `Agent`/`NewAgent` types | Exported from schema.ts:563-564, index.ts:24,48 | Confirmed | Rename to `User`/`NewUser` |
| `AgentRole` type | In shared/types.ts:98 | Confirmed | Rename to `UserRole` |
| `AgentStatus` type | In shared/types.ts:100 | Confirmed | Rename to `UserStatus` |
| `agentSkills` table | schema.ts:276 | Confirmed | Rename to `userSkills` |
| `AgentSkill`/`NewAgentSkill` types | schema.ts:590-591, index.ts:25,49 | Confirmed | Rename to `UserSkill`/`NewUserSkill` |
| `u-founder` hardcoded | auth.ts:89, auth-route:50 | Confirmed | Eliminate |
| `lifecycle-propagation.ts:494` | Uses `?? "u-founder"` fallback | Confirmed | Replace with users table query |
| `SettingsAgent` type | api-contract/settings.ts:33 | Confirmed | Rename to `SettingsUser` or keep as display-only concern |
| Migration dirs | `packages/db/drizzle/` (17 SQLite), `packages/db/drizzle-pg/` (12 PG) | Confirmed | Add 0017/0012 respectively |
| `org_edges` table | Does not exist | Confirmed absent | Create new |

### Spec assumptions that disagree with reality

1. **No `migrations/` subdirectory.** The spec says "packages/db/src/migrations/" but migrations live at `packages/db/drizzle/` (SQLite) and `packages/db/drizzle-pg/` (PG). Plan uses correct paths.

2. **`costActual` column.** The PG schema for agents omits the `@lore L17` comment on costCap but has the same columns. Both schemas are structurally identical for the rename.

3. **`AgentRole`/`AgentStatus` in shared/types.ts.** The spec says "update type imports" -- these need renaming to `UserRole`/`UserStatus`. However, `AgentRole` is used in 10+ files across fabric, server, and shared. The rename is straightforward but broad.

4. **`SettingsResponse.agents` in api-contract.** The contract type has `agents: readonly SettingsAgent[]`. This needs to become `users: readonly SettingsUser[]` (or the field stays named `agents` for backward compat). Decision: rename to `users` since we're doing a full rename with no backward compat shim.

5. **Frontend does NOT call `/api/agents` directly.** The `useSettings` hook fetches `/api/settings` which returns an `agents` array. The `SettingsPanel` receives `agents` as part of `SettingsData`. These are the frontend touchpoints -- not direct `/api/agents` calls from the web package.

---

## Phase 2: Schemas, types, and endpoints

### 2.1 `users` table schema (SQLite)

```typescript
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("ai"),  // "human" | "ai"
  name: text("name").notNull(),
  soulPromptPath: text("soul_prompt_path"),
  teamId: text("team_id").references(() => teams.id, { onDelete: "restrict" }),
  role: text("role").notNull(),
  skills: text("skills"),
  status: text("status").notNull(),
  maxConcurrentSessions: integer("max_concurrent_sessions").notNull().default(1),
  costCap: integer("cost_cap"),
  costActual: integer("cost_actual").default(0),
  costCapMinor: integer("cost_cap_minor"),
  costCapCurrency: text("cost_cap_currency"),
  // Human-specific (nullable for AI)
  email: text("email"),
  avatarUrl: text("avatar_url"),
  createdAt: text("created_at").notNull(),
});
```

The PG schema mirrors this with `pgTable` and PG-native booleans where applicable (no boolean columns on users currently, so the schemas are identical in shape).

### 2.2 `user_skills` table schema

```typescript
export const userSkills = sqliteTable(
  "user_skills",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    skillId: text("skill_id").notNull(),
    autonomyLevel: integer("autonomy_level").notNull(),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    lastUsedAt: text("last_used_at"),
    promotedAt: text("promoted_at"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.skillId] })],
);
```

Note: The column in the `user_skills` table is renamed from `agent_id` to `user_id` because the PK + FK reference is the table's identity. Unlike the 6 FK columns in other tables (which are internal references), this is the primary key of the junction table.

### 2.3 `org_edges` table schema

```typescript
export const orgEdges = sqliteTable(
  "org_edges",
  {
    id: text("id").primaryKey(),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mechanism: text("mechanism").notNull(),  // "direct" | "function" | "team"
    target: text("target").notNull(),        // userId for direct, role string for function, teamId for team
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("org_edges_unique").on(table.fromUserId, table.mechanism, table.target),
    index("org_edges_from_user_idx").on(table.fromUserId),
  ],
);
```

**Design-it-twice on org_edges:**

**Option A (single table, target-is-text):** One table with `mechanism` discriminator and `target` as text that holds userId, role, or teamId depending on mechanism. Composite unique on (fromUserId, mechanism, target).
- Trade-off: No FK constraint on target (since it points to different tables based on mechanism). Simple schema, simple queries.
- Reject reason for alternatives: none -- this is the right shape.

**Option B (three separate tables):** `org_direct_edges`, `org_function_edges`, `org_team_edges` each with proper FK constraints.
- Trade-off: FK integrity on target, but 3x the tables, 3x the API surface, 3x the query patterns. Composing "all edges for user X" requires UNION.
- Reject reason: Over-engineered. The concept doc says the three mechanisms are closed. A single table with a discriminator is the standard polymorphic-FK pattern.

**Decision:** Option A. The `target` column is untyped text intentionally. Validation happens at the API boundary (Zod schema checks: if mechanism=direct, target must be a valid userId; if mechanism=function, target must be a valid role from AGENT_ROLES; if mechanism=team, target must be a valid teamId).

**On the `id` column:** The concept doc says "edges are identified by their (from, mechanism, target) tuple -- no separate edge ID needed." However, DELETE /api/org/edges/:id needs a stable identifier. Options:
- Use a generated UUID `id` primary key with a composite UNIQUE constraint on (from, mechanism, target).
- Use a composite primary key and DELETE by body params.

Decision: UUID primary key with composite UNIQUE constraint. RESTful DELETE with `:id` in the path is cleaner than DELETE with a body. The unique constraint prevents duplicates. The ID is for addressing, the tuple is for identity.

**On `onDelete: "cascade"`:** When a user is deleted, their org edges should be cleaned up. Unlike audit logs (which must outlive their subject), org edges are operational configuration that becomes meaningless without the user.

### 2.4 Type renames in shared/types.ts

```typescript
// Rename AgentRole -> UserRole
export const KERNEL_USER_ROLES = ["builder", "growth", "product_manager"] as const;
export const FABRIC_USER_ROLES = ["practice_facilitator", "chief_of_staff", "brand_voice"] as const;
export const USER_ROLES = [...KERNEL_USER_ROLES, ...FABRIC_USER_ROLES] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type UserStatus = "active" | "paused" | "retired";

// New types for P2
export const USER_KINDS = ["human", "ai"] as const;
export type UserKind = (typeof USER_KINDS)[number];

export const ORG_EDGE_MECHANISMS = ["direct", "function", "team"] as const;
export type OrgEdgeMechanism = (typeof ORG_EDGE_MECHANISMS)[number];
```

Backward-compat aliases (temporary, removed in follow-up):
```typescript
/** @deprecated Use UserRole */
export type AgentRole = UserRole;
/** @deprecated Use UserStatus */
export type AgentStatus = UserStatus;
```

The aliases prevent a cascade of changes in fabric/server files that use `AgentRole` in function signatures. The deprecation markers ensure they get cleaned up. However, given the AC says "all code references updated," we do the full rename and skip the aliases.

### 2.5 Exported types from @hyperidle/db

```typescript
// schema.ts exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserSkill = typeof userSkills.$inferSelect;
export type NewUserSkill = typeof userSkills.$inferInsert;
export type OrgEdge = typeof orgEdges.$inferSelect;
export type NewOrgEdge = typeof orgEdges.$inferInsert;

// index.ts re-exports
export {
  type User, type NewUser, users,
  type UserSkill, type NewUserSkill, userSkills,
  type OrgEdge, type NewOrgEdge, orgEdges,
  // ... (Agent/NewAgent/agents/agentSkills removed)
} from "./schema.js";
```

### 2.6 API endpoints

#### Renamed: `/api/users` (was `/api/agents`)

All existing endpoints preserved with identical behavior, just under `/api/users`:

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/users | List all users with active session counts |
| GET | /api/users/:id | User detail with skills |
| PATCH | /api/users/:id/skills/:skillId | Update autonomy level |
| GET | /api/users/:id/inbox | User's inbox with pagination |
| POST | /api/users/:id/inbox | Send message to user |

#### New: `/api/org`

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/org | Returns full org chart (all edges) |
| PUT | /api/org/edges | Create or replace an edge |
| DELETE | /api/org/edges/:id | Delete an edge by ID |

**GET /api/org response shape:**

```typescript
interface OrgChartResponse {
  edges: Array<{
    id: string;
    fromUserId: string;
    mechanism: "direct" | "function" | "team";
    target: string;
    createdAt: string;
  }>;
  users: Array<{
    id: string;
    kind: "human" | "ai";
    name: string;
    role: string;
  }>;
}
```

The `users` array is a denormalized convenience so the UI doesn't need a second request to resolve names. Only id/kind/name/role are included (not the full user object).

**PUT /api/org/edges request body (Zod schema):**

```typescript
const putOrgEdgeSchema = z.object({
  fromUserId: z.string().min(1),
  mechanism: z.enum(["direct", "function", "team"]),
  target: z.string().min(1),
});
```

Returns 201 with the created edge, or 200 if the edge already exists (upsert on the unique constraint).

**DELETE /api/org/edges/:id** returns 204 on success, 404 if not found.

#### Modified: `/api/auth/me`

Response now reads from the `users` table instead of factorySettings:

```typescript
// Current: reads factorySettings.founder_name, factorySettings.founder_email
// After P2: reads users WHERE kind = 'human' LIMIT 1
router.get("/me", (c) => {
  const userId = c.get("userId");
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    return c.json({ id: userId, name: "Unknown", email: "", avatarUrl: null });
  }
  return c.json({
    id: user.id,
    name: user.name,
    email: user.email ?? "",
    avatarUrl: user.avatarUrl ?? null,
  });
});
```

#### Modified: `/api/settings`

The `buildSettingsResponse` function changes:
- Profile: reads from `users WHERE kind = 'human' LIMIT 1` instead of factorySettings founder_name/email.
- Agents array: renamed to `users` in the response. Reads from `users WHERE kind = 'ai'` instead of `agents`.
- The `factorySettings` rows for `founder_id`, `founder_name`, `founder_email` are no longer read (and are deleted from the seed).

### 2.7 Auth middleware changes

```typescript
export function createAuthMiddleware(db: HyperIdleDb): MiddlewareHandler<HyperIdleEnv> {
  return async (c, next) => {
    // ... API key validation unchanged ...

    // P2: resolve authenticated user from users table
    const humanUser = db
      .select()
      .from(users)
      .where(eq(users.kind, "human"))
      .limit(1)
      .get();
    c.set("userId", humanUser?.id ?? "u-founder");
    // @lore P2: fallback to "u-founder" for unseeded DBs and existing tests
    // that don't seed a human user. The fallback is a safety net, not a
    // design choice -- all production paths should have a human user row.

    await next();
  };
}
```

### 2.8 Seed changes

The seed creates a human user row:

```typescript
// SQLite seed
db.insert(users)
  .values({
    id: "u-founder",
    kind: "human",
    name: "Founder",
    role: "founder",
    status: "active",
    email: "founder@hyperidle.com",
    maxConcurrentSessions: 0,
    createdAt: now,
  })
  .onConflictDoNothing()
  .run();
```

The `factorySettings` rows for `founder_id`, `founder_name`, `founder_email` are removed from both seeds.

All `db.insert(agents)` calls become `db.insert(users)` with `kind: "ai"` added explicitly (though the default handles it).

### 2.9 Fallback routing function

New file: `packages/server/src/services/org-routing.ts`

```typescript
/**
 * Resolve which human users should receive a review/escalation.
 *
 * When org edges exist for the given context, returns the matched human users.
 * When no edges exist (or none match), falls back to ALL human users.
 *
 * @lore P2: This is the kernel-level routing query. The strategy layer
 * (founder-router.ts) will eventually be replaced by this, but that wiring
 * is out of P2 scope.
 */
export function resolveReviewRecipients(
  db: HyperIdleDb,
  context: { agentRole?: string; teamId?: string; userId?: string }
): string[] {
  // Query org edges that match the context
  // ... implementation details in tasks below
}
```

---

## Phase 2b: Acceptance criteria with verification methods

### AC1: Rename `agents` table to `users` with `kind` column

**Verification:**
- Hand-written migration SQL executes without error on a fresh DB and on an existing seeded DB.
- Test: `createTestDb()` succeeds (runs all migrations including the new one).
- Test: query `SELECT * FROM users` returns rows; `SELECT * FROM agents` returns "no such table" error.
- Test: `users` rows from a pre-migration `agents` table all have `kind = 'ai'`.
- Test: insert a row with `kind = 'human'` succeeds; insert with `kind = 'invalid'` is prevented by Zod at the API layer (SQLite text columns don't enforce enums natively).

### AC2: Human-specific nullable columns

**Verification:**
- Test: insert a user with `kind = 'human'`, `email = 'test@example.com'`, `avatarUrl = 'https://...'` succeeds.
- Test: insert a user with `kind = 'ai'`, `email = null`, `avatarUrl = null` succeeds.
- `bun run check` passes (TypeScript types reflect nullable email/avatarUrl).

### AC3: Eliminate hardcoded `u-founder` and factorySettings founder keys

**Verification:**
- Test: `grep -rn "founder_name\|founder_email" packages/server/ packages/db/src/seed*.ts packages/fabric/` returns zero results (excluding plans/ and node_modules/).
- Test: auth middleware resolves userId from `users` table, not factorySettings.
- Test: `GET /api/auth/me` returns data from users table row, not factorySettings.
- Test: `GET /api/settings` returns profile from users table row.
- The `u-founder` string may still appear as a FALLBACK VALUE in auth middleware for backward compat with unseeded test DBs, and in E2E test fixtures that seed this specific ID. The string literal `"u-founder"` is acceptable as a seed ID (it's a user ID, not a hardcoded identity bypass).

### AC4: All code references updated

**Verification:**
- `bun run check` passes with zero type errors (all imports compile).
- `bun run lint` passes (no unused imports of old names).
- Test: `grep -rn "from.*agents\b" packages/db/src/schema.ts packages/db/src/schema.pg.ts packages/db/src/index.ts` returns zero results.
- Test: `grep -rn "agents" packages/server/src/app.ts` shows only `/api/users` route mount.
- `grep -rn "AgentRole\|AgentStatus\|AGENT_ROLES\|KERNEL_AGENT_ROLES\|FABRIC_AGENT_ROLES" packages/` returns zero results (all renamed to User* variants).

### AC5: `org_edges` table created

**Verification:**
- Test: migration creates the table; `pragma table_info(org_edges)` shows id, from_user_id, mechanism, target, created_at.
- Test: insert an edge, verify it exists.
- Test: insert a duplicate (same fromUserId, mechanism, target) -- assert unique constraint violation.
- Test: delete the referenced user -- assert CASCADE deletes the edge.

### AC6: Org API endpoints

**Verification:**
- Test: `GET /api/org` returns `{ edges: [], users: [...] }` on empty org chart.
- Test: `PUT /api/org/edges` with valid body returns 201 and the created edge.
- Test: `PUT /api/org/edges` with same body again returns 200 (upsert, not duplicate).
- Test: `PUT /api/org/edges` with invalid mechanism returns 400.
- Test: `PUT /api/org/edges` with nonexistent fromUserId returns 400 (FK validation).
- Test: `DELETE /api/org/edges/:id` with valid ID returns 204.
- Test: `DELETE /api/org/edges/:id` with unknown ID returns 404.

### AC7: Auth middleware resolves from users table

**Verification:**
- Test: seed a human user, make authenticated request, assert `c.get("userId")` matches the human user's ID.
- Test: with no human user seeded, assert fallback to "u-founder".
- Test: `GET /api/auth/me` returns the human user's name and email from users table.

### AC8: Fallback routing

**Verification:**
- Test: with no org edges, `resolveReviewRecipients(db, {})` returns all human user IDs.
- Test: with org edges defined, returns only matched human users.
- Test: with org edges that don't match the context, still falls back to all human users.

### AC9: Drizzle schemas updated for both dialects

**Verification:**
- `bun run check` passes (both schema files type-check).
- Hand-written migrations placed in `packages/db/drizzle/` and `packages/db/drizzle-pg/`.
- Test: `createTestDb()` (SQLite) and PG migration tests both pass.

### AC10: All existing tests pass, new tests cover CRUD

**Verification:**
- `bun run test` all green.
- New test files:
  - `packages/db/src/__tests__/P2-user-schema.test.ts` -- user table shape, kind column, email/avatarUrl nullable
  - `packages/db/src/__tests__/P2-org-edges.test.ts` -- org_edges CRUD, unique constraint, cascade delete
  - `packages/server/src/__tests__/P2-user-routes.test.ts` -- user CRUD endpoints
  - `packages/server/src/__tests__/P2-org-routes.test.ts` -- org chart API endpoints
  - `packages/server/src/__tests__/P2-auth-resolution.test.ts` -- auth middleware reads from users table
  - `packages/server/src/__tests__/P2-fallback-routing.test.ts` -- resolveReviewRecipients fallback behavior

### AC11: bun run verify passes

**Verification:** Run `bun run verify` at the end. Zero type errors, zero lint errors, all tests green.

---

## Phase 2c: Ordered task list

### Task 1: Hand-write migration SQL (SQLite + PG)

**Files:**
- `packages/db/drizzle/0017_P2_rename_agents_to_users.sql`
- `packages/db/drizzle/meta/_journal.json` (add entry)
- `packages/db/drizzle-pg/0012_P2_rename_agents_to_users.sql`
- `packages/db/drizzle-pg/meta/_journal.json` (add entry)

**SQLite migration (0017):**
```sql
-- P2: Rename agents -> users, add kind/email/avatarUrl columns
ALTER TABLE `agents` RENAME TO `users`;
ALTER TABLE `users` ADD COLUMN `kind` text NOT NULL DEFAULT 'ai';
ALTER TABLE `users` ADD COLUMN `email` text;
ALTER TABLE `users` ADD COLUMN `avatar_url` text;

-- Rename agent_skills -> user_skills
-- SQLite doesn't support ALTER TABLE RENAME for all cases cleanly.
-- agent_skills has a composite PK (agent_id, skill_id) and FK to agents.
-- After the agents->users rename, the FK target is already correct.
-- We rename the table.
ALTER TABLE `agent_skills` RENAME TO `user_skills`;

-- Create org_edges table
CREATE TABLE `org_edges` (
  `id` text PRIMARY KEY NOT NULL,
  `from_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `mechanism` text NOT NULL,
  `target` text NOT NULL,
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `org_edges_unique` ON `org_edges` (`from_user_id`, `mechanism`, `target`);
CREATE INDEX `org_edges_from_user_idx` ON `org_edges` (`from_user_id`);
```

**PostgreSQL migration (0012):**
```sql
-- P2: Rename agents -> users, add kind/email/avatar_url columns
ALTER TABLE "agents" RENAME TO "users";
ALTER TABLE "users" ADD COLUMN "kind" text NOT NULL DEFAULT 'ai';
ALTER TABLE "users" ADD COLUMN "email" text;
ALTER TABLE "users" ADD COLUMN "avatar_url" text;

-- Rename agent_skills -> user_skills
ALTER TABLE "agent_skills" RENAME TO "user_skills";

-- Create org_edges table
CREATE TABLE "org_edges" (
  "id" text PRIMARY KEY NOT NULL,
  "from_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "mechanism" text NOT NULL,
  "target" text NOT NULL,
  "created_at" text NOT NULL
);
CREATE UNIQUE INDEX "org_edges_unique" ON "org_edges" ("from_user_id", "mechanism", "target");
CREATE INDEX "org_edges_from_user_idx" ON "org_edges" ("from_user_id");
```

**Depends on:** Nothing. This is the foundation.

**Test:** `createTestDb()` runs all migrations including the new one without error.

### Task 2: Update Drizzle schema files (SQLite + PG)

**Files:**
- `packages/db/src/schema.ts` -- rename `agents` to `users`, `agentSkills` to `userSkills`, add `orgEdges`, update all FK references from `agents` to `users`, add `kind`/`email`/`avatarUrl` columns, update type exports
- `packages/db/src/schema.pg.ts` -- same changes for PG dialect
- `packages/db/src/index.ts` -- update exports (users/User/NewUser instead of agents/Agent/NewAgent, userSkills/UserSkill/NewUserSkill instead of agentSkills/AgentSkill/NewAgentSkill, add orgEdges/OrgEdge/NewOrgEdge)

**Depends on:** Task 1 (migrations must exist so test-utils can create DBs).

**Detailed changes for schema.ts:**
1. `export const agents = sqliteTable("agents", {...})` -> `export const users = sqliteTable("users", {...})` with added `kind`, `email`, `avatarUrl` columns.
2. All 6 FK references in other tables: `.references(() => agents.id)` -> `.references(() => users.id)`. The column names (`owner_agent_id`, `agent_id`, `sender_id`, `source_agent_id`) stay unchanged.
3. `export const agentSkills = sqliteTable("agent_skills", {...})` -> `export const userSkills = sqliteTable("user_skills", {...})` with `agentId` field renamed to `userId` (and column name `agent_id` -> `user_id`).
4. Add `export const orgEdges = sqliteTable("org_edges", {...})`.
5. Type exports: `Agent` -> `User`, `NewAgent` -> `NewUser`, `AgentSkill` -> `UserSkill`, `NewAgentSkill` -> `NewUserSkill`. Add `OrgEdge`, `NewOrgEdge`.

### Task 3: Update shared types

**Files:**
- `packages/shared/src/types.ts` -- rename AgentRole -> UserRole, AgentStatus -> UserStatus, KERNEL_AGENT_ROLES -> KERNEL_USER_ROLES, FABRIC_AGENT_ROLES -> FABRIC_USER_ROLES, AGENT_ROLES -> USER_ROLES. Add USER_KINDS, UserKind, ORG_EDGE_MECHANISMS, OrgEdgeMechanism.
- `packages/shared/src/index.ts` -- update re-exports.
- `packages/shared/src/__tests__/types.test.ts` -- update test references.
- `packages/shared/src/__tests__/o1-type-split.test.ts` -- update test references.

**Depends on:** Task 2 (types must match schema).

### Task 4: Update seed files

**Files:**
- `packages/db/src/seed.ts` -- all `db.insert(agents)` -> `db.insert(users)`, add `kind: "ai"` to all AI user inserts, add human user seed row, remove factorySettings founder_id/founder_name/founder_email inserts
- `packages/db/src/seed-pg.ts` -- same changes for PG
- `packages/db/src/seed-fixtures.ts` -- no changes needed (references `ownerAgentId` which is a string, not a table reference)

**Depends on:** Task 2 (schema imports).

### Task 5: Update auth middleware

**Files:**
- `packages/server/src/middleware/auth.ts` -- `createAuthMiddleware` reads from `users` table instead of factorySettings. Import `users` from `@hyperidle/db` instead of `factorySettings`.

**Depends on:** Task 2 (users table import).

### Task 6: Rename and update routes

**Files:**
- `packages/server/src/routes/agents.ts` -> rename file to `packages/server/src/routes/users.ts`. Update all internal references from `agents` to `users`. Rename `createAgentRoutes` to `createUserRoutes`.
- `packages/server/src/app.ts` -- update import and mount: `api.route("/users", createUserRoutes(...))`.
- `packages/server/src/routes/auth.ts` -- `GET /me` reads from `users` table instead of factorySettings.
- `packages/server/src/routes/settings.ts` -- `buildSettingsResponse` reads profile from `users` table, agents list renamed to users in response.
- `packages/server/src/routes/coach.ts` -- update `agents` import to `users`.
- `packages/server/src/routes/threads.ts` -- update `agents` import to `users`.
- `packages/server/src/routes/status.ts` -- update `agents` import to `users`.
- `packages/server/src/routes/products.ts` -- update `agents` import to `users`, `db.insert(agents)` -> `db.insert(users)`.

**Depends on:** Task 2, Task 3.

### Task 7: Create org chart routes

**Files:**
- `packages/server/src/routes/org.ts` (new) -- `createOrgRoutes(db): Hono`
- `packages/server/src/app.ts` -- add `api.route("/org", createOrgRoutes(options.db))`.

**Depends on:** Task 2 (orgEdges schema).

### Task 8: Update server services

**Files:**
- `packages/server/src/services/session-provisioning.ts` -- `agents` import -> `users`
- `packages/server/src/services/session-lifecycle.ts` -- `agents` import -> `users`
- `packages/server/src/services/team-management.ts` -- `agents` import -> `users`
- `packages/server/src/services/handoff-protocol.ts` -- `agents` import -> `users`
- `packages/server/src/services/direct-thread.ts` -- no changes (doesn't import agents)
- `packages/server/src/skill-tools/send-message.ts` -- `agents` import -> `users`
- `packages/server/src/skill-tools/write-memory.ts` -- `agents` import -> `users`
- `packages/server/src/skill-tools/handoff-to.ts` -- `agents` import -> `users`
- `packages/server/src/skill-tools/tool-registry.ts` -- update AgentRole -> UserRole import

**Depends on:** Task 2, Task 3.

### Task 9: Update fabric services

**Files:**
- `packages/fabric/src/session-context.ts` -- `agents` import -> `users`, `AgentRole` -> `UserRole`
- `packages/fabric/src/services/cost-cap.ts` -- `agents` import -> `users`
- `packages/fabric/src/services/silence-policy.ts` -- `agents` import -> `users`
- `packages/fabric/src/services/lifecycle-propagation.ts` -- replace factorySettings.founder_id lookup with `users WHERE kind = 'human'` query
- `packages/fabric/src/services/routine-scheduler.ts` -- `agents` import -> `users`
- `packages/fabric/src/materialization.ts` -- `AgentRole` -> `UserRole`
- `packages/fabric/src/role-community-map.ts` -- `AgentRole` -> `UserRole`
- `packages/fabric/src/relevance-scoring.ts` -- `AgentRole` -> `UserRole`
- `packages/fabric/src/index.ts` -- update any re-exports

**Depends on:** Task 2, Task 3.

### Task 10: Create org-routing service

**Files:**
- `packages/server/src/services/org-routing.ts` (new) -- `resolveReviewRecipients` function

**Depends on:** Task 2 (orgEdges schema).

### Task 11: Update api-contract types

**Files:**
- `packages/api-contract/src/settings.ts` -- `SettingsAgent` -> `SettingsUser`, `agents` field -> `users`
- `packages/api-contract/src/auth.ts` -- no structural changes needed (AuthMeResponse stays the same shape)

**Depends on:** Task 3.

### Task 12: Update frontend consumers

**Files:**
- `packages/web/src/components/SettingsPanel.tsx` -- `AgentSetting` interface, `agents` prop, tab label: "Agents" may stay as display text or change to "AI Users". The `SettingsData` interface's `agents` field changes to `users`.
- `packages/web/src/hooks/useSettings.ts` -- response parsing (agents -> users in API response)
- `packages/web/src/pages/WorkPortfolio.tsx` -- string references only ("AI agents" in text), no code changes needed
- `packages/web/src/shell/Rail.tsx` -- string references only, no code changes needed

**Depends on:** Task 11.

### Task 13: Update existing test files

**Files (server tests -- 7 files with u-founder, plus agents.test.ts):**
- `packages/server/src/__tests__/agents.test.ts` -> rename to `packages/server/src/__tests__/users.test.ts`, update all `agents` references to `users`
- `packages/server/src/__tests__/M3-auth-middleware.test.ts` -- update assertions for users-table resolution
- `packages/server/src/__tests__/M3-settings-routes.test.ts` -- update for users-based profile
- `packages/server/src/__tests__/M3-threads-coach-auth.test.ts` -- update seed data
- `packages/server/src/__tests__/M3-lifecycle-propagation-auth.test.ts` -- update seed data
- `packages/server/src/__tests__/ws-subscribe-authz.test.ts` -- update u-founder references
- `packages/server/src/__tests__/ws-broadcaster.thread-topic.test.ts` -- update u-founder references
- `packages/server/src/__tests__/bet-state-machine.L14.test.ts` -- update u-founder references
- `packages/server/src/__tests__/L17-money-wire.test.ts` -- update agents import
- `packages/server/src/__tests__/team-management.test.ts` -- update agents import
- `packages/server/src/__tests__/sessions.test.ts` -- update agents import
- `packages/server/src/__tests__/cost-cap.test.ts` -- update agents import
- `packages/server/src/__tests__/lifecycle-propagation.test.ts` -- update agents import
- `packages/server/src/__tests__/handoff-protocol.test.ts` -- update agents import
- `packages/server/src/__tests__/session-provisioning.test.ts` -- update agents import

**Files (DB tests -- 9 files):**
- `packages/db/src/__tests__/schema.test.ts` -- update agents references
- `packages/db/src/__tests__/foreign-keys.test.ts` -- update agents references
- `packages/db/src/__tests__/seed.test.ts` -- update agents references
- `packages/db/src/__tests__/seed-parity.test.ts` -- update agents references
- `packages/db/src/__tests__/seed-then-migrate.test.ts` -- update agents references
- `packages/db/src/__tests__/setup-cli.test.ts` -- update agents references
- `packages/db/src/__tests__/migration.test.ts` -- update for new migration
- `packages/db/src/__tests__/migration-l1.test.ts` -- update if it references agents
- `packages/db/src/__tests__/pg-migration.test.ts` -- update for new PG migration

**Files (web unit tests -- 16 files with u-founder):**
- All 16 files in `packages/web/src/__tests__/` that reference "u-founder" need the seed user ID updated or a human user fixture added.

**Files (E2E tests -- 16 files with u-founder):**
- All 16 E2E spec files in `packages/web/e2e/` that reference "u-founder" need fixtures updated. The E2E tests use a test DB that runs the seed; after the seed adds the human user row with id "u-founder", these tests should continue to work since the ID itself stays the same.

**Depends on:** Tasks 2-12 (all code changes must be in place before tests can be updated).

**Critical note on E2E tests:** The seed still creates a user with id "u-founder" (as a human user row in the users table). The 16 E2E tests that reference "u-founder" as a participant ID, X-Identity header value, or thread initiator should continue to work WITHOUT changes to the u-founder string itself -- the string is now a valid user ID in the users table. The key change is that "u-founder" is no longer a hardcoded bypass in auth middleware; it's a real row in the users table.

### Task 14: Write new P2-specific tests

**Files:**
- `packages/db/src/__tests__/P2-user-schema.test.ts`
- `packages/db/src/__tests__/P2-org-edges.test.ts`
- `packages/server/src/__tests__/P2-user-routes.test.ts`
- `packages/server/src/__tests__/P2-org-routes.test.ts`
- `packages/server/src/__tests__/P2-auth-resolution.test.ts`
- `packages/server/src/__tests__/P2-fallback-routing.test.ts`

**Depends on:** Tasks 1-12.

### Task 15: Verify

Run `bun run verify`. Fix any type errors, lint errors, or test failures.

**Depends on:** All previous tasks.

---

## Security and abuse cases

| Concern | Applicable? | Mitigation |
|---------|-------------|------------|
| Rate-limit on POST/PATCH | Yes -- PUT /api/org/edges, DELETE /api/org/edges/:id | Covered by existing global rate limiter in app.ts (createRateLimiter, 60/min default) |
| Input-trust boundary for agent-authored fields | N/A -- org edges are human-authored (P2 has no agent-facing org API) | N/A |
| Secret handling | N/A -- no new credential surface | N/A |
| Path traversal | N/A -- no path inputs in P2 | N/A |
| SSRF for outbound URL | N/A -- avatarUrl is stored text, not fetched server-side | N/A |
| FK validation on PUT /api/org/edges | Yes -- `fromUserId` must reference an existing user | Zod validates format; route handler queries users table to confirm existence before insert |
| Mechanism/target consistency | Yes -- if mechanism="direct", target must be a userId; if "function", must be a valid role; if "team", must be a teamId | Validated in route handler with explicit checks per mechanism |
| Enumeration via org chart | Low risk -- org chart is not secret (all authenticated users can see it) | Acceptable for v1 single-user desktop mode |

---

## Protected tests

Tests whose assertions must not change (they verify existing behavior that P2 must preserve):

```
protectedTests:
  - packages/server/src/__tests__/M3-auth-middleware.test.ts  # auth behavior preserved
  - packages/server/src/__tests__/M3-settings-routes.test.ts  # settings shape preserved
  - packages/server/src/__tests__/M3-threads-coach-auth.test.ts  # coach thread auth preserved
  - packages/server/src/__tests__/bet-state-machine.L14.test.ts  # bet state machine unchanged
  - packages/db/src/__tests__/foreign-keys.test.ts  # FK constraints preserved
  - packages/db/src/__tests__/seed.test.ts  # seed produces expected rows
  - packages/db/src/__tests__/seed-parity.test.ts  # SQLite/PG parity
```

Note: These tests' ASSERTIONS must remain equivalent. The IMPORTS and FIXTURE DATA will change (agents -> users), but the behavioral contract they verify stays the same. A protected test that fails after P2 means the rename broke existing behavior.

---

## Migration checklist

Every renamed symbol and its affected call sites:

### Table renames

| Old name | New name | Migration step |
|----------|----------|---------------|
| `agents` (table) | `users` | ALTER TABLE RENAME in migration SQL |
| `agent_skills` (table) | `user_skills` | ALTER TABLE RENAME in migration SQL |

### Schema symbol renames (TypeScript)

| Old symbol | New symbol | Files affected |
|-----------|-----------|----------------|
| `agents` (export) | `users` | schema.ts, schema.pg.ts, index.ts, + all 14 non-test importers listed in Task 6/8/9 |
| `agentSkills` (export) | `userSkills` | schema.ts, schema.pg.ts, index.ts, routes/agents.ts |
| `Agent` (type) | `User` | schema.ts, schema.pg.ts, index.ts |
| `NewAgent` (type) | `NewUser` | schema.ts, schema.pg.ts, index.ts |
| `AgentSkill` (type) | `UserSkill` | schema.ts, schema.pg.ts, index.ts |
| `NewAgentSkill` (type) | `NewUserSkill` | schema.ts, schema.pg.ts, index.ts |
| `AgentRole` (type) | `UserRole` | shared/types.ts, shared/index.ts, + 10 consumers in fabric/server |
| `AgentStatus` (type) | `UserStatus` | shared/types.ts, shared/index.ts |
| `AGENT_ROLES` (const) | `USER_ROLES` | shared/types.ts, shared/index.ts, + consumers |
| `KERNEL_AGENT_ROLES` (const) | `KERNEL_USER_ROLES` | shared/types.ts, shared/index.ts |
| `FABRIC_AGENT_ROLES` (const) | `FABRIC_USER_ROLES` | shared/types.ts, shared/index.ts |

### Route renames

| Old path | New path | Files affected |
|----------|----------|----------------|
| `/api/agents` | `/api/users` | app.ts (mount), routes/agents.ts -> routes/users.ts |

### File renames

| Old path | New path |
|----------|----------|
| `packages/server/src/routes/agents.ts` | `packages/server/src/routes/users.ts` |
| `packages/server/src/__tests__/agents.test.ts` | `packages/server/src/__tests__/users.test.ts` |

### factorySettings keys removed

| Key | Used in | Replacement |
|-----|---------|-------------|
| `founder_id` | auth.ts, lifecycle-propagation.ts | `users WHERE kind = 'human' LIMIT 1` |
| `founder_name` | auth-route.ts, settings.ts | `users.name WHERE kind = 'human'` |
| `founder_email` | auth-route.ts, settings.ts | `users.email WHERE kind = 'human'` |

### API contract renames

| Old name | New name | File |
|----------|----------|------|
| `SettingsAgent` | `SettingsUser` | api-contract/settings.ts |
| `SettingsResponse.agents` | `SettingsResponse.users` | api-contract/settings.ts |

### Frontend renames

| Old name | New name | File |
|----------|----------|------|
| `AgentSetting` | `UserSetting` | SettingsPanel.tsx |
| `SettingsData.agents` | `SettingsData.users` | SettingsPanel.tsx |
| `agents` (tab label) | "Agents" (keep as display text) | SettingsPanel.tsx |

The "Agents" tab label in SettingsPanel stays as "Agents" because the tab shows AI users managed by the human. The concept doc's vocabulary lock says not to use "agent" for the IDENTITY concept, but as a UI display label for the AI user category, "Agents" is the user-facing term. This is a naming-at-the-UI-layer call, not a data model concern.

---

## Risks and ambiguities

1. **SQLite ALTER TABLE RENAME and FK references.** SQLite's ALTER TABLE RENAME TO updates internal FK references automatically when `PRAGMA foreign_keys = ON`. The 6 tables with FKs to `agents` should automatically point to `users` after the rename. However, the Drizzle migration journal tracks table names in its snapshot -- we need to update the Drizzle snapshot JSON to reflect the new table name. **Mitigation:** After writing the hand-written migration, run `bun run db:generate` with the updated schema to regenerate the snapshot metadata. If Drizzle generates a second migration, we use only the snapshot and discard the generated SQL (since our hand-written SQL is authoritative).

2. **`user_skills` column rename (agent_id -> user_id).** SQLite doesn't support `ALTER TABLE RENAME COLUMN` reliably across all versions. For SQLite, we need the create-copy-drop approach for user_skills. Actually, SQLite 3.25.0+ DOES support `ALTER TABLE RENAME COLUMN`. Better-sqlite3 bundles SQLite 3.45+, so this is safe. For the PG path, `ALTER TABLE user_skills RENAME COLUMN agent_id TO user_id` is straightforward. **Update to migration SQL:**
   ```sql
   -- After ALTER TABLE agent_skills RENAME TO user_skills:
   ALTER TABLE `user_skills` RENAME COLUMN `agent_id` TO `user_id`;
   ```

3. **Drizzle snapshot drift.** After hand-writing migrations, the Drizzle snapshot in `drizzle/meta/` and `drizzle-pg/meta/` must match the new schema. If it doesn't, `bun run db:generate` will try to produce a "fix" migration. **Mitigation:** After writing hand-written migrations, update the schema files (Task 2), then run `bun run db:generate` to sync the snapshot. If it produces a new migration file, inspect it -- if empty or trivial, it means the snapshot is aligned. If it produces substantial changes, the hand-written migration missed something.

4. **E2E test fixture stability.** The 16 E2E tests use "u-founder" as a participant/identity string. Since the seed still creates a user with id "u-founder" (now as `kind = "human"` in the users table), these tests should work without changing the string. The risk is if any test hardcodes a factorySettings lookup that no longer exists. **Mitigation:** grep all E2E files for "founder_name", "founder_email", "founder_id" -- if they appear, those tests need updating.

5. **`agents` variable shadowing in SettingsPanel.** The `AgentsTab` component in SettingsPanel.tsx receives `agents` as a prop. This is a local variable name, not tied to the DB table. The prop can stay named `agents` (it's component-internal) or be renamed to `users` for consistency. **Decision:** Rename to `users` for consistency with the data model, since the SettingsData type's field changes to `users`.

---

## Summary of new files

| File | Purpose |
|------|---------|
| `packages/db/drizzle/0017_P2_rename_agents_to_users.sql` | SQLite migration |
| `packages/db/drizzle-pg/0012_P2_rename_agents_to_users.sql` | PG migration |
| `packages/server/src/routes/org.ts` | Org chart API routes |
| `packages/server/src/services/org-routing.ts` | Review recipient resolution |
| `packages/db/src/__tests__/P2-user-schema.test.ts` | User table schema tests |
| `packages/db/src/__tests__/P2-org-edges.test.ts` | Org edges CRUD tests |
| `packages/server/src/__tests__/P2-user-routes.test.ts` | User API endpoint tests |
| `packages/server/src/__tests__/P2-org-routes.test.ts` | Org API endpoint tests |
| `packages/server/src/__tests__/P2-auth-resolution.test.ts` | Auth resolution tests |
| `packages/server/src/__tests__/P2-fallback-routing.test.ts` | Fallback routing tests |

## Summary of deleted files

| File | Reason |
|------|--------|
| `packages/server/src/routes/agents.ts` | Replaced by `routes/users.ts` |
| `packages/server/src/__tests__/agents.test.ts` | Replaced by `__tests__/users.test.ts` |

## Summary of modified files (non-test, 30 files)

| Package | Files | Change type |
|---------|-------|-------------|
| `packages/db` | schema.ts, schema.pg.ts, index.ts, seed.ts, seed-pg.ts | Table/type renames, add columns, add orgEdges |
| `packages/shared` | types.ts, index.ts | Type renames (AgentRole -> UserRole etc.) |
| `packages/server` | app.ts, auth.ts (middleware), auth.ts (route), settings.ts, threads.ts, coach.ts, status.ts, products.ts | Import renames, auth rewrite, settings rewrite |
| `packages/server` (services) | session-provisioning.ts, session-lifecycle.ts, team-management.ts, handoff-protocol.ts | Import renames |
| `packages/server` (skill-tools) | send-message.ts, write-memory.ts, handoff-to.ts, tool-registry.ts | Import renames |
| `packages/fabric` | session-context.ts, cost-cap.ts, silence-policy.ts, lifecycle-propagation.ts, routine-scheduler.ts, materialization.ts, role-community-map.ts, relevance-scoring.ts, index.ts | Import renames, founder lookup replacement |
| `packages/api-contract` | settings.ts | Type renames |
| `packages/web` | SettingsPanel.tsx, useSettings.ts | Prop/field renames |
