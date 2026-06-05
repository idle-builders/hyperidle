# AB0 Architecture: Agent Structure Implementation

**Status:** Locked. This is the implementation plan for the builder.

**Concept input:** `plans/AB0/concept.md` (locked).

---

## Required reading for the builder

Before implementing, read these files:

- `plans/AB0/concept.md` -- the locked concept doc
- `docs/agent-layer/agent-structure.md` -- ground-truth concept doc
- `packages/shared/src/types.ts` -- current USER_ROLES, lines 92-105
- `packages/shared/src/index.ts` -- current exports
- `packages/db/src/schema.ts` -- users and teams tables
- `packages/db/src/seed.ts` -- current seed logic
- `packages/db/src/seed-fixtures.ts` -- practice communities, routine seeds
- `packages/server/src/routes/agents.ts` -- agent CRUD routes and Zod schemas
- `packages/server/src/skill-tools/tool-registry.ts` -- tool authorization
- `packages/fabric/src/role-community-map.ts` -- ROLE_TO_COMMUNITY record
- `packages/fabric/src/relevance-scoring.ts` -- KNOWN_USER_ROLES, isUserRole guard
- `packages/fabric/src/materialization.ts` -- MaterializationConfig.agentRole
- `packages/fabric/src/session-context.ts` -- SessionContextConfig.agentRole
- `packages/server/src/services/session-provisioning.ts` -- agent.role cast
- `packages/server/src/services/session-lifecycle.ts` -- CreateSessionParams.agentRole
- `packages/eval/src/seeding.ts` -- eval seeding uses UserRole

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `USER_ROLES` is a closed 6-value tuple | Confirmed: `types.ts:102-104` | Replace with open string + catalog |
| `KERNEL_USER_ROLES` / `FABRIC_USER_ROLES` split exists | Confirmed: `types.ts:102-103` | Remove both; replace with `AGENT_CATEGORIES` |
| `users.role` is `text` column | Confirmed: `schema.ts:39` | No schema change needed for role column |
| No `agentCategory` column exists | Confirmed: grep found nothing | Add via migration |
| No `functions` column on `teams` | Confirmed: grep found nothing | Add via migration |
| `ROLE_TO_COMMUNITY` is `Record<UserRole, string>` | Confirmed: `role-community-map.ts:15` | Replace with function |
| `z.enum(USER_ROLES)` used in agent routes | Confirmed: `agents.ts:32,42` | Change to `z.string().min(1)` |
| `toolsForRole(role: UserRole)` signature | Confirmed: `tool-registry.ts:142` | Change to `string` |
| `ToolDefinition.roles` is `UserRole[]` | Confirmed: `tool-registry.ts:58` | Change to `string[]` |
| Test asserts `role: "invalid_role"` returns 400 | Confirmed: `X3-agents.test.ts:260-267` | Update: only empty string is invalid |
| Tests assert `KERNEL_USER_ROLES` has 3, `FABRIC_USER_ROLES` has 3, `USER_ROLES` has 6 | Confirmed: `types.test.ts:79-107`, `o1-type-split.test.ts:42-82` | Update tests to reflect new structure |
| `session-provisioning.ts` casts `agent.role as UserRole` | Confirmed: line 229 | Remove cast; role is now `string` |
| Facilitator tools list specific role strings in `roles` | Confirmed: 4 tools list `["chief_of_staff", "practice_facilitator", "product_manager"]` | Keep as-is; role strings still valid |
| Eval seeding uses `UserRole` type | Confirmed: `seeding.ts:26,95,258,331` | Change to `string` |
| Soul templates seeded for 3 roles only | Confirmed: `seed.ts:248-252` | Add templates for new roles |

---

## Acceptance criteria + verification

### AC1: Agent Category type system
**Criterion:** `AGENT_CATEGORIES` const tuple and `AgentCategory` type exist in `packages/shared/src/types.ts`. Exported from `packages/shared/src/index.ts`.
**Verification:** `npm run check` passes. Import test: `import { AGENT_CATEGORIES, type AgentCategory } from "@hyperidle/shared"` compiles.

### AC2: Agent Role Catalog
**Criterion:** `AGENT_ROLE_CATALOG` constant exists in `packages/shared/src/agent-roles.ts` with entries for all 16 known roles per the concept doc. Each entry has: `role`, `label`, `category`, `description`, `community`, `teamFunctions`, `hasTemplate`. Exported from index.
**Verification:** Unit test asserts catalog has 16 entries, each with required fields. Test asserts every legacy role (`builder`, `growth`, `product_manager`, `practice_facilitator`, `chief_of_staff`, `brand_voice`) has a catalog entry.

### AC3: Team Function type system
**Criterion:** `TEAM_FUNCTIONS` const tuple of known function strings and `TeamFunction` type exist in `packages/shared/src/agent-roles.ts`. `DEFAULT_ROSTER` function computes roster from functions.
**Verification:** Unit test asserts `defaultRoster(["development"])` returns `["builder", "qa_engineer"]`. Test asserts `defaultRoster(["development", "product"])` returns `["builder", "qa_engineer", "product_manager"]` (deduplicated).

### AC4: UserRole type becomes string
**Criterion:** `UserRole` type alias is `string` (no longer a union of literals). `USER_ROLES`, `KERNEL_USER_ROLES`, `FABRIC_USER_ROLES` are removed. All imports updated.
**Verification:** `npm run check` passes with zero errors across all packages. Existing tests updated to not assert on removed constants.

### AC5: Schema migration adds `agent_category` and `functions` columns
**Criterion:** Migration `0022_AB0_agent_structure.sql` adds:
- `agent_category text` column to `users` table (nullable)
- `functions text` column to `teams` table (nullable)
**Verification:** Migration runs without error on `createTestDb()`. Schema test verifies columns exist via SQL query.

### AC6: Schema.ts updated with new columns
**Criterion:** `users` table in `schema.ts` has `agentCategory` column. `teams` table has `functions` column.
**Verification:** `npm run check` passes. Drizzle inferred types include the new columns.

### AC7: ROLE_TO_COMMUNITY replaced with function
**Criterion:** `role-community-map.ts` exports `communityForRole(role: string): string` instead of the `ROLE_TO_COMMUNITY` record. Uses the role catalog for lookup. Falls back to `"ops"` for unknown roles.
**Verification:** Unit test asserts `communityForRole("builder")` returns `"building"`, `communityForRole("unknown_custom_role")` returns `"ops"`.

### AC8: Agent routes accept open role strings
**Criterion:** `POST /api/agents` and `PATCH /api/agents/:id` accept any non-empty role string (not just `USER_ROLES` members). `POST /api/agents` also accepts optional `agentCategory` field.
**Verification:** Integration test creates agent with `role: "designer"` -- returns 201. Test creates with `role: ""` -- returns 400.

### AC9: Seed data updated
**Criterion:** `seed.ts` sets `agentCategory` on all seeded agents. Existing agents get correct categories: builder -> team, product_manager -> team, chief_of_staff -> personal, practice_facilitator -> strategy, system:propagation -> null. Seed team gets `functions: '["development","product"]'`.
**Verification:** Seed integration test runs seed(), queries users for `agentCategory` values, asserts correct assignment.

### AC10: New soul templates
**Criterion:** Soul template files exist in `docs/souls/` for new roles: `builder.md`, `growth.md`, `designer.md`, `qa-engineer.md`, `ops.md`. Seed loads them into `factorySettings` as `soul_template:<role>`.
**Verification:** Seed test verifies `factorySettings` contains entries for new template roles.

### AC11: Session provisioning and lifecycle updated
**Criterion:** `session-provisioning.ts` no longer casts `agent.role as UserRole`. `session-lifecycle.ts` `CreateSessionParams.agentRole` is `string`. `MaterializationConfig.agentRole` is `string`. `SessionContextConfig.agentRole` is `string`.
**Verification:** `npm run check` passes with zero errors.

### AC12: Relevance scoring updated
**Criterion:** `relevance-scoring.ts` removes `KNOWN_USER_ROLES` and `isUserRole` guard. Uses `communityForRole()` from the updated role-community-map.
**Verification:** `npm run check` passes. Existing relevance scoring tests still pass.

### AC13: Concept doc exists
**Criterion:** `docs/agent-layer/agent-structure.md` exists with the concept from Phase 5.
**Verification:** File exists (static property -- verified by tree inspection, not a test).

### AC14: Eval seeding updated
**Criterion:** `packages/eval/src/seeding.ts` uses `string` instead of `UserRole` type.
**Verification:** `npm run check` passes.

---

## Ordered task list

### Task 1: New types and catalog (`packages/shared/`)

**Files to create:**
- `packages/shared/src/agent-roles.ts`

**Files to modify:**
- `packages/shared/src/types.ts`
- `packages/shared/src/index.ts`

**What to do:**

1. Create `packages/shared/src/agent-roles.ts`:

```ts
import type { AgentCategory } from "./types.js";

/**
 * AB0: catalog entry for a known agent role.
 */
export interface AgentRoleCatalogEntry {
  readonly role: string;
  readonly label: string;
  readonly category: AgentCategory;
  readonly description: string;
  readonly community: string;
  readonly teamFunctions: readonly string[];
  readonly hasTemplate: boolean;
}

/**
 * AB0: known team functions. Open vocabulary -- users can add custom functions.
 */
export const TEAM_FUNCTIONS = [
  "development",
  "product",
  "design",
  "marketing",
  "sales",
  "operations",
  "support",
  "research",
] as const;

export type TeamFunction = (typeof TEAM_FUNCTIONS)[number];

/**
 * AB0: The canonical catalog of known agent roles. Open vocabulary --
 * agents can have roles not in this catalog (they get base tools and
 * no template). The catalog provides metadata for known roles.
 *
 * @lore AB0: This replaces USER_ROLES, KERNEL_USER_ROLES, and
 * FABRIC_USER_ROLES. The old kernel/fabric split was about system layer,
 * not agent category. The new category system (team/strategy/personal)
 * is the structural distinction.
 */
export const AGENT_ROLE_CATALOG: readonly AgentRoleCatalogEntry[] = [
  // Team agents
  { role: "builder", label: "Builder", category: "team", description: "Engineer. Implements features, writes code, tests, deploys.", community: "building", teamFunctions: ["development"], hasTemplate: true },
  { role: "designer", label: "Designer", category: "team", description: "Product designer. UX research, interaction design, visual design.", community: "product", teamFunctions: ["design"], hasTemplate: true },
  { role: "product_manager", label: "Product Manager", category: "team", description: "Team lead. Shapes pitches, coordinates cycles, decomposes bets.", community: "product", teamFunctions: ["product"], hasTemplate: true },
  { role: "qa_engineer", label: "QA Engineer", category: "team", description: "Quality assurance. Test plans, regression testing, bug triage.", community: "building", teamFunctions: ["development"], hasTemplate: true },
  { role: "growth", label: "Growth", category: "team", description: "Marketer. Landing pages, content, email, SEO, analytics.", community: "growth", teamFunctions: ["marketing"], hasTemplate: true },
  { role: "brand_voice", label: "Brand Voice", category: "team", description: "Brand guardian. Tone, messaging, style consistency.", community: "growth", teamFunctions: ["marketing"], hasTemplate: false },
  { role: "ops", label: "Ops", category: "team", description: "SRE and operations. Deploys, monitors, handles incidents.", community: "ops", teamFunctions: ["operations"], hasTemplate: true },
  { role: "support", label: "Support", category: "team", description: "Customer support. Ticket triage, knowledge base, escalation.", community: "ops", teamFunctions: ["support"], hasTemplate: false },
  { role: "sales", label: "Sales", category: "team", description: "Sales specialist. Lead qualification, outreach, pipeline.", community: "growth", teamFunctions: ["sales"], hasTemplate: false },
  { role: "content", label: "Content Writer", category: "team", description: "Content creation. Blog posts, documentation, social media.", community: "growth", teamFunctions: ["marketing"], hasTemplate: false },
  { role: "data_analyst", label: "Data Analyst", category: "team", description: "Analytics and insights. Data pipelines, dashboards, reporting.", community: "product", teamFunctions: ["research"], hasTemplate: false },
  // Strategy agents
  { role: "practice_facilitator", label: "Practice Facilitator", category: "strategy", description: "L3 facilitator. Runs practice meetings, synthesizes findings.", community: "ops", teamFunctions: [], hasTemplate: true },
  { role: "scout", label: "Scout", category: "strategy", description: "Analyst. Finds and evaluates market opportunities.", community: "product", teamFunctions: [], hasTemplate: false },
  { role: "infra", label: "Infra Agent", category: "strategy", description: "SRE. Maintains shared infrastructure.", community: "ops", teamFunctions: [], hasTemplate: false },
  { role: "platform", label: "Platform Agent", category: "strategy", description: "DX engineer. Maintains shared tools, templates, CI/CD.", community: "building", teamFunctions: [], hasTemplate: false },
  // Personal agents
  { role: "chief_of_staff", label: "Chief of Staff", category: "personal", description: "L4 facilitator. Routes work, compiles portfolio retros, coaches PMs.", community: "ops", teamFunctions: [], hasTemplate: true },
];

/**
 * Lookup a role catalog entry by role string. Returns undefined for unknown roles.
 */
export function findRoleCatalogEntry(role: string): AgentRoleCatalogEntry | undefined {
  return AGENT_ROLE_CATALOG.find((entry) => entry.role === role);
}

/**
 * Get the practice community for a role. Falls back to "ops" for unknown roles.
 *
 * @lore AB0: Replaces the old ROLE_TO_COMMUNITY Record<UserRole, string>.
 * The old record required exhaustive keys matching the closed UserRole union.
 * This function works with open role strings via catalog lookup + fallback.
 */
export function communityForRole(role: string): string {
  const entry = findRoleCatalogEntry(role);
  return entry?.community ?? "ops";
}

/**
 * Compute the default agent roster for a set of team functions.
 * Returns deduplicated role strings sorted alphabetically.
 */
export function defaultRoster(functions: readonly string[]): readonly string[] {
  const functionSet = new Set(functions);
  const roles = new Set<string>();
  for (const entry of AGENT_ROLE_CATALOG) {
    if (entry.category === "team" && entry.teamFunctions.some((f) => functionSet.has(f))) {
      roles.add(entry.role);
    }
  }
  return [...roles].sort();
}
```

2. Modify `packages/shared/src/types.ts`:

```ts
// REMOVE these lines (92-105):
// export const KERNEL_USER_ROLES = ["builder", "growth", "product_manager"] as const;
// export const FABRIC_USER_ROLES = ["practice_facilitator", "chief_of_staff", "brand_voice"] as const;
// export const USER_ROLES = [...KERNEL_USER_ROLES, ...FABRIC_USER_ROLES] as const;
// export type UserRole = (typeof USER_ROLES)[number];

// ADD these lines:
/**
 * AB0: Agent categories. Closed enum — adding a fourth requires a concept-doc update.
 * - team: bound to a team, domain specialist
 * - strategy: factory-wide, strategy-controlled
 * - personal: bound to a human user
 *
 * @lore AB0: Replaces the KERNEL_USER_ROLES / FABRIC_USER_ROLES split which was
 * about system layer, not agent category. The category system is orthogonal to
 * the role system.
 */
export const AGENT_CATEGORIES = ["team", "strategy", "personal"] as const;
export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

/**
 * AB0: Agent role is an open string. The role catalog in agent-roles.ts provides
 * known roles with metadata, but any non-empty string is a valid role.
 *
 * @lore AB0: This replaces the closed USER_ROLES tuple. The old 6-value enum
 * could not accommodate new domain-specific roles (designer, QA, ops, etc.)
 * without code changes. Open string + catalog avoids the enum expansion problem.
 */
export type UserRole = string;
```

3. Modify `packages/shared/src/index.ts`:

Remove exports: `FABRIC_USER_ROLES`, `KERNEL_USER_ROLES`, `USER_ROLES`.
Add exports: `AGENT_CATEGORIES`, `AgentCategory`.
Add re-exports from `agent-roles.ts`: `AgentRoleCatalogEntry`, `AGENT_ROLE_CATALOG`, `findRoleCatalogEntry`, `communityForRole`, `defaultRoster`, `TEAM_FUNCTIONS`, `TeamFunction`.
Keep exporting: `UserRole` (now `string`).

**Depends on:** Nothing.
**Proves:** AC1, AC2, AC3, AC4.

---

### Task 2: Schema migration (`packages/db/`)

**Files to create:**
- `packages/db/drizzle/0022_AB0_agent_structure.sql`

**Files to modify:**
- `packages/db/src/schema.ts`
- `packages/db/drizzle/meta/_journal.json`

**What to do:**

1. Create migration SQL:

```sql
-- AB0: Add agent_category to users and functions to teams
ALTER TABLE "users" ADD COLUMN "agent_category" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "functions" text;
```

Note: No backfill in the SQL migration. Backfill happens in seed.ts (for dev/test) and as a separate one-time script for production (if there is production data -- currently pre-launch, so seed is sufficient).

2. Update `schema.ts` -- add columns:

On the `users` table, after `modelTierPreference`:
```ts
/**
 * AB0: Agent category — team | strategy | personal.
 * Null for human users and system users.
 * @lore AB0: This replaces the KERNEL_USER_ROLES / FABRIC_USER_ROLES
 * split which was about system layer, not agent category.
 */
agentCategory: text("agent_category"),
```

On the `teams` table, after `principlesPath`:
```ts
/**
 * AB0: Team functions as JSON array of strings.
 * Determines which agent roles appear in the default roster.
 * @lore AB0: Open vocabulary. Known functions: development, product,
 * design, marketing, sales, operations, support, research.
 */
functions: text("functions"),
```

3. Update `_journal.json` -- add entry at idx 22:
```json
{
  "idx": 22,
  "version": "7",
  "when": 1782961400000,
  "tag": "0022_AB0_agent_structure",
  "breakpoints": true
}
```

**Depends on:** Nothing (can run in parallel with Task 1).
**Proves:** AC5, AC6.

---

### Task 3: Update role-community-map (`packages/fabric/`)

**Files to modify:**
- `packages/fabric/src/role-community-map.ts`

**What to do:**

Replace the entire file:

```ts
/**
 * AB0: role-to-community mapping via the agent role catalog.
 *
 * @lore AB0: Previously this was a Record<UserRole, string> requiring
 * exhaustive keys for the closed UserRole union. With open role strings,
 * it is now a re-export of communityForRole() from the catalog.
 */
export { communityForRole } from "@hyperidle/shared";
```

All consumers that import `ROLE_TO_COMMUNITY` from this file need updating:
- `packages/fabric/src/materialization.ts` -- change `ROLE_TO_COMMUNITY[config.agentRole]` to `communityForRole(config.agentRole)`
- `packages/fabric/src/relevance-scoring.ts` -- change `ROLE_TO_COMMUNITY[agentRole]` to `communityForRole(agentRole)`, remove `KNOWN_USER_ROLES`, `isUserRole`

**Depends on:** Task 1 (needs `communityForRole` export).
**Proves:** AC7, AC12.

---

### Task 4: Update materialization and session context types (`packages/fabric/`)

**Files to modify:**
- `packages/fabric/src/materialization.ts` -- `MaterializationConfig.agentRole: UserRole` -> no type change needed (UserRole is now `string`)
- `packages/fabric/src/session-context.ts` -- `SessionContextConfig.agentRole: UserRole` -> no type change needed
- `packages/fabric/src/relevance-scoring.ts` -- remove `KNOWN_USER_ROLES`, `isUserRole`, update `computeRoleMatch` to use `communityForRole()`

The `UserRole` type import stays but now resolves to `string`. The import statements do not need to change. The casts and guards that narrowed `string` to `UserRole` are no longer needed.

**Detailed changes to `relevance-scoring.ts`:**

Remove lines 69-80 (`KNOWN_USER_ROLES` array and `isUserRole` function).

Update `computeRoleMatch` (lines 82-99):
```ts
// Before:
function computeRoleMatch(item: KnowledgeItemWithFabric, agentRole: string): number {
  if (!isUserRole(agentRole)) {
    return 0;
  }
  const community = ROLE_TO_COMMUNITY[agentRole];
  ...
}

// After:
function computeRoleMatch(item: KnowledgeItemWithFabric, agentRole: string): number {
  const community = communityForRole(agentRole);
  ...
}
```

Update import: replace `ROLE_TO_COMMUNITY` import from `./role-community-map.js` with `communityForRole`.

**Depends on:** Task 3.
**Proves:** AC11, AC12.

---

### Task 5: Update agent routes (`packages/server/`)

**Files to modify:**
- `packages/server/src/routes/agents.ts`

**What to do:**

1. Remove `USER_ROLES` import. The `createAgentSchema` and `patchAgentSchema` change:

```ts
// Before:
const createAgentSchema = z.object({
  ...
  role: z.enum(USER_ROLES),
  ...
});

// After:
const createAgentSchema = z.object({
  ...
  role: z.string().min(1).max(100),
  agentCategory: z.enum(AGENT_CATEGORIES).optional(),
  ...
});
```

```ts
// Before:
const patchAgentSchema = z.object({
  ...
  role: z.enum(USER_ROLES).optional(),
  ...
});

// After:
const patchAgentSchema = z.object({
  ...
  role: z.string().min(1).max(100).optional(),
  ...
});
```

2. In the POST handler, when inserting the new user, set `agentCategory`:

```ts
// If agentCategory is provided, use it. Otherwise, derive from the role catalog.
const catalogEntry = findRoleCatalogEntry(data.role);
const category = data.agentCategory ?? catalogEntry?.category ?? "team";

await db.insert(users).values({
  ...
  agentCategory: category,
  ...
});
```

3. In the GET handler, include `agentCategory` in the response.

4. In the PATCH handler, add `agentCategory` to `buildPatchUpdateSet` if needed. But per concept: category is immutable. Do NOT allow patching category.

**Depends on:** Task 1, Task 2.
**Proves:** AC8.

---

### Task 6: Update session provisioning (`packages/server/`)

**Files to modify:**
- `packages/server/src/services/session-provisioning.ts`
- `packages/server/src/services/session-lifecycle.ts`

**What to do:**

1. In `session-provisioning.ts` line 229, remove the unsafe cast:

```ts
// Before:
const agentRole = agent.role as UserRole;

// After:
const agentRole = agent.role;
```

2. In `session-lifecycle.ts`, `CreateSessionParams.agentRole` type is already `UserRole` which is now `string`. No code change needed, but verify the import still works.

**Depends on:** Task 1.
**Proves:** AC11.

---

### Task 7: Update tool registry types (`packages/server/`)

**Files to modify:**
- `packages/server/src/skill-tools/tool-registry.ts`

**What to do:**

The `ToolDefinition.roles` field is typed as `readonly UserRole[]`. Since `UserRole` is now `string`, this becomes `readonly string[]` automatically. No code change needed.

The `toolsForRole(role: UserRole)` signature becomes `toolsForRole(role: string)` automatically. No code change needed.

The `BuildToolRegistryOptions.role: UserRole` becomes `string` automatically. No code change needed.

Verify: `npm run check` passes without changes to this file.

**Depends on:** Task 1.
**Proves:** AC11 (part of).

---

### Task 8: Update seed data (`packages/db/`)

**Files to modify:**
- `packages/db/src/seed.ts`
- `packages/db/src/seed-fixtures.ts`

**What to do:**

1. In `seed.ts`, add `agentCategory` to every agent insert:

```ts
// u-founder: human, no category
// seed-agent-builder: agentCategory: "team"
// seed-agent-cos: agentCategory: "personal"
// system:propagation: agentCategory: null (system user, not a real agent)
// seed-agent-pm-nimmly: agentCategory: "team"
// seed-agent-pf-*: agentCategory: "strategy"
```

2. Set `functions` on the seed team:

```ts
await db
  .insert(teams)
  .values({
    id: "seed-product-1",
    name: "Nimmly",
    phase: "build",
    functions: JSON.stringify(["development", "product"]),
    createdAt: now,
  })
  .onConflictDoNothing();
```

3. Add new soul templates to the `soulTemplates` array:

```ts
const soulTemplates: Array<{ role: string; filename: string }> = [
  { role: "product_manager", filename: "product-manager.md" },
  { role: "practice_facilitator", filename: "practice-facilitator.md" },
  { role: "chief_of_staff", filename: "chief-of-staff.md" },
  { role: "builder", filename: "builder.md" },
  { role: "growth", filename: "growth.md" },
  { role: "designer", filename: "designer.md" },
  { role: "qa_engineer", filename: "qa-engineer.md" },
  { role: "ops", filename: "ops.md" },
];
```

4. Backfill `agentCategory` for existing agents (idempotent patch after inserts):

```ts
// AB0: backfill agentCategory on existing agents
const categoryByRole: Record<string, string> = {
  builder: "team",
  growth: "team",
  product_manager: "team",
  brand_voice: "team",
  practice_facilitator: "strategy",
  chief_of_staff: "personal",
};
for (const [role, category] of Object.entries(categoryByRole)) {
  await db
    .update(users)
    .set({ agentCategory: category })
    .where(and(eq(users.role, role), eq(users.kind, "ai")));
}
```

**Depends on:** Task 1, Task 2.
**Proves:** AC9, AC10.

---

### Task 9: Create new soul templates (`docs/souls/`)

**Files to create:**
- `docs/souls/builder.md`
- `docs/souls/growth.md`
- `docs/souls/designer.md`
- `docs/souls/qa-engineer.md`
- `docs/souls/ops.md`

**What to do:**

Create soul templates following the pattern of existing templates (chief-of-staff.md, product-manager.md, practice-facilitator.md). Each template has:
- YAML frontmatter with `role` and `version`
- Role-specific personality, scope, mission, what they do NOT do, tools, escalation

Example for `builder.md`:
```md
---
role: builder
version: 1
---

# You are a Builder on the `{{product}}` team

Your scope is one product. You write code, ship features, and maintain
the codebase.

## Your mission

- Implement features assigned via tasks. Think, plan, build, test, review.
- Write clean, tested, documented code.
- Surface technical risks early — do not hide complexity.
- Capture implementation decisions as knowledge items for the practice.

## You do NOT

- Make product decisions. The Product Manager shapes what to build.
- Deploy to production without review. Ops handles deployment.
- Skip tests. Every change has automated verification.

## Tools

- Standard shared tools: `read_inbox`, `send_message`, `write_memory`,
  `query_practice`, `create_item`, `handoff_to`, `write_session_notes`,
  `log_task`, `create_task`, `submit_review`, `create_artifact`.

## Escalation

Escalate to the Product Manager when requirements are ambiguous or
when a task crosses product boundaries.
```

Templates for growth, designer, qa-engineer, ops follow the same structure with role-appropriate content.

**Depends on:** Nothing.
**Proves:** AC10.

---

### Task 10: Update eval seeding (`packages/eval/`)

**Files to modify:**
- `packages/eval/src/seeding.ts`

**What to do:**

Change `UserRole` type annotations to `string`:
- Line 26: `import type { BetStatus, ModelTier, ScopeKind, TaskState } from "@hyperidle/shared";` (remove `UserRole` import, or keep it since it is now `string`)
- Line 95: `role: string;` (was `role: UserRole;`)
- Line 258: `agentRole?: string;` (was `agentRole?: UserRole;`)
- Line 331: `function buildDefaultSoulPrompt(role: string): string {` (was `role: UserRole`)

Since `UserRole` is now `string`, these changes happen automatically -- no code changes needed. Just verify `npm run check` passes.

**Depends on:** Task 1.
**Proves:** AC14.

---

### Task 11: Update tests

**Files to modify:**
- `packages/shared/src/__tests__/types.test.ts` -- remove/update "User role split" describe block
- `packages/shared/src/__tests__/o1-type-split.test.ts` -- remove/update "User role split" describe block
- `packages/server/src/routes/__tests__/X3-agents.test.ts` -- update "returns 400 when role is invalid" test
- `packages/db/src/__tests__/P2-user-schema.test.ts` -- no changes expected (does not test role enum)

**What to do:**

1. `types.test.ts` lines 78-107: Replace "User role split" describe block:

```ts
describe("Agent categories (AB0)", () => {
  it("AGENT_CATEGORIES has 3 values", () => {
    expect(AGENT_CATEGORIES).toHaveLength(3);
    expect(AGENT_CATEGORIES).toContain("team");
    expect(AGENT_CATEGORIES).toContain("strategy");
    expect(AGENT_CATEGORIES).toContain("personal");
  });
});
```

2. `o1-type-split.test.ts` lines 42-82: Replace "User role split" describe block:

```ts
describe("AB0: Agent categories replace kernel/fabric role split", () => {
  it("AGENT_CATEGORIES is exported from shared", () => {
    expect("AGENT_CATEGORIES" in sharedIndex).toBe(true);
  });

  it("AGENT_CATEGORIES has 3 values", () => {
    const val = (sharedIndex as Record<string, unknown>)["AGENT_CATEGORIES"] as string[];
    expect(Array.isArray(val)).toBe(true);
    expect(val.length).toBe(3);
  });

  it("KERNEL_USER_ROLES is NOT exported from shared after AB0", () => {
    expect("KERNEL_USER_ROLES" in sharedIndex).toBe(false);
  });

  it("FABRIC_USER_ROLES is NOT exported from shared after AB0", () => {
    expect("FABRIC_USER_ROLES" in sharedIndex).toBe(false);
  });

  it("USER_ROLES is NOT exported from shared after AB0", () => {
    expect("USER_ROLES" in sharedIndex).toBe(false);
  });
});
```

3. `X3-agents.test.ts` line 260-267: Update invalid role test:

```ts
it("returns 400 when role is empty string", async () => {
  const res = await app.request("/api/agents", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name: "Test", role: "" }),
  });
  expect(res.status).toBe(400);
});
```

And add a test that custom roles are accepted:

```ts
it("accepts custom role strings not in the catalog", async () => {
  const res = await app.request("/api/agents", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name: "Custom Agent", role: "custom_specialist" }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.role).toBe("custom_specialist");
});
```

**Depends on:** Tasks 1-10.
**Proves:** AC1-AC14 (verification layer).

---

### Task 12: New unit tests for agent-roles module

**Files to create:**
- `packages/shared/src/__tests__/agent-roles.test.ts`

**What to do:**

```ts
describe("AGENT_ROLE_CATALOG", () => {
  it("has 16 entries", () => { ... });
  it("every entry has required fields", () => { ... });
  it("every legacy role has a catalog entry", () => {
    for (const role of ["builder", "growth", "product_manager", "practice_facilitator", "chief_of_staff", "brand_voice"]) {
      expect(findRoleCatalogEntry(role)).toBeDefined();
    }
  });
  it("categories are valid AgentCategory values", () => { ... });
});

describe("communityForRole", () => {
  it("returns building for builder", () => { ... });
  it("returns product for product_manager", () => { ... });
  it("returns ops for unknown role", () => { ... });
});

describe("defaultRoster", () => {
  it("returns builder and qa_engineer for development", () => {
    expect(defaultRoster(["development"])).toEqual(["builder", "qa_engineer"]);
  });
  it("returns deduplicated union for multiple functions", () => {
    const roster = defaultRoster(["development", "product"]);
    expect(roster).toContain("builder");
    expect(roster).toContain("qa_engineer");
    expect(roster).toContain("product_manager");
    expect(new Set(roster).size).toBe(roster.length); // no duplicates
  });
  it("returns empty for unknown function", () => {
    expect(defaultRoster(["custom_function"])).toEqual([]);
  });
});
```

**Depends on:** Task 1.
**Proves:** AC2, AC3.

---

## Security & abuse cases

| Check | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | N/A -- existing rate limiting unchanged | -- |
| Input-trust boundary for agent-authored fields | Yes -- `role` is now open string | `z.string().min(1).max(100)` prevents empty strings and unbounded length |
| Secret-handling for new credential surface | N/A -- no new credentials | -- |
| Path-traversal for path input | N/A -- no new path inputs | -- |
| SSRF for outbound URL | N/A -- no new URLs | -- |
| Category manipulation | Yes -- `agentCategory` on POST | Category validated via `z.enum(AGENT_CATEGORIES)`. Cannot be patched (immutable). |
| Role string injection | Yes -- open role string in DB | Role is `text` column, never interpolated into SQL or executed. Max length 100. |

---

## Protected tests

Tests whose assertions must not be weakened (but can be updated to reflect the new type system):

```
protectedTests:
  - packages/server/src/routes/__tests__/X3-agents.test.ts
  - packages/db/src/__tests__/P2-user-schema.test.ts
  - packages/db/src/__tests__/schema.test.ts
```

The `types.test.ts` and `o1-type-split.test.ts` assertions on `USER_ROLES` counts will be replaced (not weakened) with assertions on `AGENT_CATEGORIES`. The X3 test's "invalid role returns 400" is updated to "empty role returns 400" -- the security intent (reject bad input) is preserved; the boundary moves from "not in enum" to "empty string".

---

## Migration checklist (existing symbols being renamed/removed)

| Symbol | Location | Action | Affected files |
|---|---|---|---|
| `KERNEL_USER_ROLES` | `packages/shared/src/types.ts` | Remove | `types.ts`, `index.ts`, `types.test.ts`, `o1-type-split.test.ts` |
| `FABRIC_USER_ROLES` | `packages/shared/src/types.ts` | Remove | `types.ts`, `index.ts`, `types.test.ts`, `o1-type-split.test.ts` |
| `USER_ROLES` | `packages/shared/src/types.ts` | Remove | `types.ts`, `index.ts`, `types.test.ts`, `o1-type-split.test.ts`, `agents.ts` |
| `UserRole` (union type) | `packages/shared/src/types.ts` | Change to `string` alias | All importers -- type-compatible, no code changes |
| `ROLE_TO_COMMUNITY` | `packages/fabric/src/role-community-map.ts` | Replace with `communityForRole()` | `role-community-map.ts`, `materialization.ts`, `relevance-scoring.ts` |
| `KNOWN_USER_ROLES` | `packages/fabric/src/relevance-scoring.ts` | Remove | `relevance-scoring.ts` |
| `isUserRole` | `packages/fabric/src/relevance-scoring.ts` | Remove | `relevance-scoring.ts` |

---

## Risks and ambiguities

1. **Test count changes.** The `types.test.ts` and `o1-type-split.test.ts` files assert exact counts (3 kernel roles, 3 fabric roles, 6 total). These must be updated, not just deleted. The new assertions on `AGENT_CATEGORIES` (3 values) provide equivalent coverage.

2. **Eval package.** The `packages/eval/src/seeding.ts` imports `UserRole` from shared. Since `UserRole` becomes `string`, no code change is needed -- but `npm run check` must be run to verify.

3. **Scoring config test.** `packages/fabric/src/__tests__/scoring-config.test.ts` and `scoring-config.l22.test.ts` reference `factorySettings` but likely do not reference `UserRole` directly. Verify during implementation.

4. **Build order.** Tasks 1 and 2 can run in parallel. Task 3 depends on 1. Tasks 4-10 depend on 1+2. Task 11 depends on all others.

---

## Task dependency graph

```
Task 1 (shared types) ──┬──> Task 3 (role-community-map) ──> Task 4 (fabric types)
                         ├──> Task 5 (agent routes)
                         ├──> Task 6 (session provisioning)
                         ├──> Task 7 (tool registry - verify only)
                         ├──> Task 10 (eval seeding - verify only)
                         └──> Task 12 (new unit tests)

Task 2 (schema migration) ──┬──> Task 5 (agent routes)
                             └──> Task 8 (seed data)

Task 9 (soul templates) ──> Task 8 (seed data)

Tasks 1-10 ──> Task 11 (update existing tests)
```

Recommended execution order: 1+2+9 (parallel) -> 3 -> 4+5+6+7+8+10+12 (parallel where possible) -> 11 -> verify.
