# AE3 — Assistant System Tools: Architecture Plan

## Required reading

- `packages/server/src/skill-tools/tool-registry.ts` — ToolDefinition, ToolContext, toolsForRole, buildToolRegistry
- `packages/server/src/skill-tools/tool-result.ts` — ok/err helpers
- `packages/server/src/skill-tools/create-item.ts` — canonical tool implementation pattern
- `packages/server/src/skill-tools/create-conflict-review.ts` — role-restricted tool pattern
- `packages/server/src/skill-tools/__tests__/tool-registry-role.integration.test.ts` — role authorization test pattern
- `packages/shared/src/agent-roles.ts` — AGENT_ROLE_CATALOG, defaultRoster, findRoleCatalogEntry
- `packages/server/src/routes/teams-routes.ts` — POST /teams implementation (existing team creation logic)
- `packages/server/src/routes/agents.ts` — POST /agents implementation (existing agent creation logic)
- `packages/server/src/routes/bets.ts` — POST /bets implementation (existing bet creation logic)
- `packages/server/src/routes/routines-routes.ts` — POST /routines, PATCH /:id (existing routine logic)
- `packages/server/src/services/team-management.ts` — createTeam, addMember service functions
- `packages/db/src/schema.ts` — teams, users, teamMembers, bets, routines table definitions

## Phase 0 — Interrogation

### Q1: Authorization mechanism — role string list vs category-based filtering?

The spec says "restricted to personal-category agents." The existing `ToolDefinition.roles` field is `readonly UserRole[]` (string list). `UserRole` is `string` (open vocabulary). The only individual-category role in the catalog today is `chief_of_staff` (soon to be `assistant` per AD8b).

**Decision: Use the existing role-string mechanism.** Set `roles: ["chief_of_staff"]` on each management tool. When AD8b renames the role to `assistant`, update the role string in each tool definition (same migration pattern as the `@lore AD8a` comments already scattered across the codebase). No framework change needed. Adding a `categories` filter to ToolDefinition is over-engineering for a single-role use case today, and would add complexity to toolsForRole() that every existing test would need to absorb.

**Trade-off:** If a second individual-category role is added later, each management tool needs its roles array updated. That is a 5-line diff, not an architectural concern.

### Q2: Audit trail — new event type vs existing tool_call_recorded?

The session provisioning orchestrator (session-provisioning.ts:621-632) already emits a `tool_call_recorded` event for every tool invocation, with `toolName` and a scrubbed `argsSummary`. This fires regardless of tool type.

**Decision: No additional audit mechanism.** The existing `tool_call_recorded` event provides the audit trail. Each tool invocation is already logged with the tool name, session context, and argument summary. The AC says "every tool invocation creates an audit trail" — it already does, for all tools, at the harness level.

### Q3: Confirmation messages — tool return value vs thread message insert?

The AC says "each management action produces a confirmation message in the thread." Two options: (1) the tool returns a success payload and the LLM composes the confirmation message, or (2) the tool inserts a message into the assistant thread.

**Decision: The tool returns a structured success payload.** The LLM naturally produces a confirmation response after a successful tool call — that is standard tool-use behavior. The LLM's response IS the confirmation message in the thread. Inserting a message from within the tool would create a duplicate (the tool's inserted message + the LLM's response about the tool result). This matches every existing tool's pattern (return ok({...}), LLM interprets the result).

## Plan reconciliation: spec vs reality

| Spec assumption | Codebase reality | Resolution |
|---|---|---|
| "REST endpoints for all CRUD operations" | Teams POST exists in teams-routes.ts:312. Agents POST in agents.ts:150. Bets POST in bets.ts:562. Routines POST in routines-routes.ts:134, PATCH in :459. | Confirmed. |
| "The skill-tools system registers tools per role" | `ToolDefinition.roles` field, `toolsForRole(role)` filter in tool-registry.ts:142. | Confirmed. |
| "`defaultRoster(functions)` computes optimal agent roster" | Exists in agent-roles.ts:219. Takes `readonly string[]`, returns deduplicated role strings. | Confirmed. |
| "Soul templates stored in factorySettings" | Key pattern `soul_template:${role}` in seed.ts:290 and agents.ts:101. | Confirmed. |
| "personal-category agents" | AGENT_ROLE_CATALOG has one individual-category entry: `chief_of_staff`. | The `roles` field will use `["chief_of_staff"]`. |
| "create a team with specified functions and auto-generated agent roster" | teams-routes.ts POST creates a team with hardcoded builder+PM. `defaultRoster()` exists but is not called. `teams.functions` column exists in schema. | Tool will call `defaultRoster()`, insert team, teamMembers, and agents. Richer than the route's hardcoded pattern. |
| "Service-layer functions" for teams | `team-management.ts` has `createTeam()` but it only creates the teamMembers row and assigns agents — it does NOT create the teams row. The teams-routes.ts POST creates both. | Tool must do the full creation inline (teams row + teamMembers row + agents), similar to teams-routes.ts. No single service function covers the full flow. |

## Acceptance criteria and verification

### AC-1: create_team tool

The Assistant can create a new team with specified functions and auto-generated agent roster.

**Verification:** Integration test creates a ToolContext with role `chief_of_staff`, invokes `create_team` with `{ name: "Marketing", functions: ["marketing"] }`, asserts:
- A teams row exists with the given name and functions stored as JSON
- A teamMembers row exists linked to the team
- Agent (users) rows exist for each role returned by `defaultRoster(["marketing"])` — specifically `growth` and `brand_voice` (the marketing-function roles)
- Each agent has `kind: "ai"`, `status: "active"`, `teamId` pointing to the teamMembers row
- Each agent with `hasTemplate: true` in the catalog has its `soulPrompt` populated from factorySettings
- The tool returns `ok({ teamId, teamMembersId, agentIds: [...] })`

### AC-2: add_agent tool

The Assistant can add an agent to an existing team with a specified role and soul template.

**Verification:** Integration test seeds a team with teamMembers, invokes `add_agent` with `{ teamId: "<teams.id>", role: "qa_engineer", name: "QA Bot" }`, asserts:
- A new users row exists with the given role, name, kind="ai", status="active"
- The user's teamId references the team's teamMembers row (looked up from teamMembers WHERE teamId = input.teamId)
- The user's soulPrompt is populated from factorySettings `soul_template:qa_engineer` if the template exists
- The tool returns `ok({ agentId, name, role })`
- Invoking with a nonexistent teamId returns `err("NOT_FOUND", ...)`

### AC-3: create_bet tool

The Assistant can create a bet on a specified team with a description.

**Verification:** Integration test seeds a team, invokes `create_bet` with `{ teamId: "<teams.id>", description: "Launch the landing page" }`, asserts:
- A bets row exists with status="draft", the given teamId and description
- The tool returns `ok({ betId, status: "draft" })`
- Invoking with a nonexistent teamId returns `err("NOT_FOUND", ...)`

### AC-4: create_routine and update_routine tools

The Assistant can create or modify routines.

**Verification for create_routine:** Integration test seeds a team and agent, invokes `create_routine` with `{ name: "Daily standup", teamId, ownerAgentId, triggerType: "calendar", triggerConfig: '{"cron":"0 9 * * 1-5"}' }`, asserts:
- A routines row exists with the given name, teamId, ownerAgentId, triggerConfig
- A stub task exists (routines.stubTaskId is not null)
- The tool returns `ok({ routineId, name })`
- Invalid cron expression returns `err("INVALID_INPUT", ...)`

**Verification for update_routine:** Integration test seeds a routine, invokes `update_routine` with `{ routineId, updates: { name: "Weekly sync", state: "paused" } }`, asserts:
- The routine row is updated with the new name and state
- `active` boolean is synced (paused -> active=false)
- The tool returns `ok({ routineId, name, state })`
- Nonexistent routineId returns `err("NOT_FOUND", ...)`
- Soft-deleted routine returns `err("NOT_FOUND", ...)`

### AC-5: Authorization — individual-category restriction

System-management tools are restricted to personal-category agents (individual-category in the code).

**Verification:** Integration test:
- Builds a registry for role `chief_of_staff` — asserts all 5 management tools are present in definitions
- Builds a registry for role `builder` — asserts none of the 5 management tools are present
- Invokes a management tool via a builder registry — asserts `err("FORBIDDEN", ...)`
- Builds a registry for role `practice_facilitator` — asserts none of the 5 management tools are present

### AC-6: Audit trail

Every tool invocation creates an audit trail.

**Verification:** This is already enforced by the session provisioning harness (session-provisioning.ts:621-632) which emits `tool_call_recorded` for every tool call. No new test needed — the existing `tool-registry.integration.test.ts` and session provisioning tests cover this. Static verification: confirm the 5 new tools are registered in `ALL_TOOL_DEFINITIONS` (which is the prerequisite for the harness to emit events for them).

## Type signatures and schemas

### Tool definitions (5 new tools)

```typescript
// create-team.ts
const createTeamInputSchema = z.object({
  name: z.string().min(1).max(200),
  functions: z.array(z.string().min(1)).min(1).max(20),
  repoPath: z.string().max(500).optional(),
});

interface CreateTeamData {
  readonly teamId: string;
  readonly teamMembersId: string;
  readonly agentIds: readonly string[];
  readonly roster: readonly { role: string; name: string; agentId: string }[];
}

export const createTeamTool: ToolDefinition<CreateTeamInput> = {
  name: "create_team",
  description: "Create a new team with the specified functions. Automatically generates an agent roster based on the functions using the role catalog. Each agent is created with appropriate soul prompt templates.",
  inputSchema: createTeamInputSchema,
  handler,
  roles: ["chief_of_staff"],
};
```

```typescript
// add-agent.ts
const addAgentInputSchema = z.object({
  teamId: z.string().min(1),        // teams.id (domain entity)
  role: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  soulPrompt: z.string().max(50_000).optional(), // explicit override; falls back to template
});

interface AddAgentData {
  readonly agentId: string;
  readonly name: string;
  readonly role: string;
  readonly teamId: string;
}

export const addAgentTool: ToolDefinition<AddAgentInput> = {
  name: "add_agent",
  description: "Add a new AI agent to an existing team with the specified role. If no soul prompt is provided, loads the default template for the role from factory settings.",
  inputSchema: addAgentInputSchema,
  handler,
  roles: ["chief_of_staff"],
};
```

```typescript
// create-bet.ts (the skill-tool, not the route)
const createBetInputSchema = z.object({
  teamId: z.string().min(1),
  description: z.string().min(1).max(10_000),
  doneCondition: z.string().max(10_000).optional(),
  hypothesis: z.string().max(10_000).optional(),
});

interface CreateBetData {
  readonly betId: string;
  readonly status: "draft";
  readonly teamId: string;
}

export const createBetTool: ToolDefinition<CreateBetInput> = {
  name: "create_bet",
  description: "Create a new draft bet (time-boxed work commitment) on the specified team. The bet starts in draft status and must be committed separately to become active.",
  inputSchema: createBetInputSchema,
  handler,
  roles: ["chief_of_staff"],
};
```

```typescript
// create-routine.ts (the skill-tool)
const createRoutineInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  teamId: z.string().min(1),
  ownerAgentId: z.string().min(1),
  triggerType: z.literal("calendar"),
  triggerConfig: z.string().min(1),  // JSON with cron field
  costCapPerRunMinor: z.number().int().min(0).optional(),
});

interface CreateRoutineData {
  readonly routineId: string;
  readonly name: string;
  readonly stubTaskId: string;
}

export const createRoutineTool: ToolDefinition<CreateRoutineInput> = {
  name: "create_routine",
  description: "Create a new routine (recurring automated task) for a team agent. Requires a calendar trigger with a cron expression. Creates a stub task for session provisioning.",
  inputSchema: createRoutineInputSchema,
  handler,
  roles: ["chief_of_staff"],
};
```

```typescript
// update-routine.ts
const updateRoutineInputSchema = z.object({
  routineId: z.string().min(1),
  updates: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    state: z.enum(["active", "paused"]).optional(),
    triggerConfig: z.string().optional(),
    costCapPerRunMinor: z.number().int().min(0).nullable().optional(),
    costCapMonthlyMinor: z.number().int().min(0).nullable().optional(),
  }),
});

interface UpdateRoutineData {
  readonly routineId: string;
  readonly name: string;
  readonly state: string;
}

export const updateRoutineTool: ToolDefinition<UpdateRoutineInput> = {
  name: "update_routine",
  description: "Update an existing routine's configuration — name, description, schedule, state, or cost caps.",
  inputSchema: updateRoutineInputSchema,
  handler,
  roles: ["chief_of_staff"],
};
```

### ToolContext — no changes

The existing `ToolContext` provides `db`, `eventBus`, `agentId`, `sessionId`, `taskId`, `teamId`, `workspacePath`, and `watcher`. The management tools only need `db` (for all CRUD) and `agentId` (for identity in created entities). No ToolContext extension needed.

## Design-it-twice: create_team implementation strategy

### Option A: Inline all creation logic (like teams-routes.ts POST)

Each tool does its own DB inserts: teams row, teamMembers row, users rows. The create_team tool is ~80 lines, similar to the POST /teams handler but richer (uses `defaultRoster()` and loads soul templates).

**Trade-off:** Duplicates some logic between the route handler and the tool. If team creation rules change, two places need updating.
**Reject reason for the duplication concern:** The route handler creates a hardcoded 2-agent team. The tool creates a roster-driven team. They do different things. Extracting a shared function would require an options bag covering both cases, adding complexity for a theoretical DRY benefit.

### Option B: Extract a shared `createTeamWithRoster()` service function

Move the creation logic to a service function called by both the route and the tool. The route passes hardcoded roles; the tool passes `defaultRoster()` output.

**Trade-off:** Cleaner separation. But the route handler is about to be superseded — AE2 redesigns team creation around function selection, and the tool IS the primary creation path going forward. Extracting a service function to share with a route that will change is premature.

### Decision: Option A (inline).

The tool owns its logic. The route handler is legacy for this specific operation. When AE2 lands, the route may delegate to the tool or be simplified. No shared function extraction now.

## Ordered task list

### Task 1: Create the 5 tool implementation files

**Files:**
- `packages/server/src/skill-tools/create-team.ts`
- `packages/server/src/skill-tools/add-agent.ts`
- `packages/server/src/skill-tools/create-bet.ts`
- `packages/server/src/skill-tools/create-routine.ts`
- `packages/server/src/skill-tools/update-routine.ts`

**Pattern:** Follow `create-conflict-review.ts` for structure:
1. Zod input schema
2. Input type alias
3. Output data interface
4. async handler function returning `Promise<ToolResult<T>>`
5. Exported `ToolDefinition` constant with `roles: ["chief_of_staff"]`

**Dependencies:** None (pure new files).

### Task 2: Register tools in tool-registry.ts

**File:** `packages/server/src/skill-tools/tool-registry.ts`

**Changes:**
- Add 5 imports for the new tool constants
- Add 5 entries to `ALL_TOOL_DEFINITIONS` array (after the G1 facilitator tools block)

**Also update:** `packages/server/src/skill-tools/index.ts` — add 5 exports.

**Dependencies:** Task 1.

### Task 3: Write integration tests for each tool

**Files:**
- `packages/server/src/skill-tools/__tests__/create-team.integration.test.ts`
- `packages/server/src/skill-tools/__tests__/add-agent.integration.test.ts`
- `packages/server/src/skill-tools/__tests__/create-bet.integration.test.ts`
- `packages/server/src/skill-tools/__tests__/create-routine.integration.test.ts`
- `packages/server/src/skill-tools/__tests__/update-routine.integration.test.ts`

**Pattern:** Follow `create-conflict-review.integration.test.ts`:
- Use `test` from `../../test-fixtures.js` for `{ db }` injection
- Use `_helpers.ts` `makeContext` where applicable, extend with role override
- Seed minimal domain data per test
- Test success path, NOT_FOUND, INVALID_INPUT, FORBIDDEN (via builder registry)

**Dependencies:** Tasks 1 + 2.

### Task 4: Write role-authorization integration test

**File:** `packages/server/src/skill-tools/__tests__/tool-registry-role.integration.test.ts` (extend existing)

**Changes:**
- Add test: "chief_of_staff registry includes management tools"
- Add test: "builder registry excludes management tools"
- Add test: "builder invoke of create_team returns FORBIDDEN"
- Update the existing tool count assertion (B3 test: "chief_of_staff registry includes all N tools" — update from 15 to 20)

**Dependencies:** Task 2.

### Task 5: Update existing test expectations

The existing `tool-registry-role.integration.test.ts` line 93 asserts `expect(names).toHaveLength(15)` for chief_of_staff. With 5 new tools, this becomes 20.

The `tool-schemas.integration.test.ts` may also assert on the total count of ALL_TOOL_DEFINITIONS.

**File:** `packages/server/src/skill-tools/__tests__/tool-registry-role.integration.test.ts`
**File:** `packages/server/src/skill-tools/__tests__/tool-schemas.integration.test.ts`

**Dependencies:** Task 2.

## Implementation details per tool

### create_team handler

```
1. Validate input (Zod)
2. Generate teamId = `team-${randomUUID()}`, teamMembersId = `team-${randomUUID()}`
3. Insert teams row: { id: teamId, name, phase: "build", functions: JSON.stringify(functions), createdAt: now }
4. Insert teamMembers row: { id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: now }
5. Compute roster: defaultRoster(functions) -> role strings
6. For each role:
   a. Generate agentId = `agent-${role}-${randomUUID()}`
   b. Look up catalog entry: findRoleCatalogEntry(role)
   c. Derive agent name: `${name} ${catalogEntry.label}` (e.g. "Marketing Growth")
   d. Look up soul template: SELECT value FROM factorySettings WHERE key = `soul_template:${role}`
   e. Derive agentCategory from catalog entry
   f. Insert users row: { id, kind: "ai", name, role, agentCategory, soulPrompt: template ?? null, status: "active", maxConcurrentSessions: 1, teamId: teamMembersId, createdAt: now }
7. Set leadAgentId on teamMembers to the first agent (product_manager if present, else first by sort order)
8. If repoPath provided, update teams.factoryDbPath
9. Return ok({ teamId, teamMembersId, agentIds, roster })
```

### add_agent handler

```
1. Validate input (Zod)
2. Verify team exists: SELECT FROM teams WHERE id = input.teamId
3. Find teamMembers: SELECT FROM teamMembers WHERE teamId = input.teamId
4. Look up soul template if no explicit soulPrompt: SELECT value FROM factorySettings WHERE key = `soul_template:${input.role}`
5. Derive agentCategory from catalog: findRoleCatalogEntry(input.role)?.category ?? "team"
6. Generate agentId = randomUUID()
7. Insert users row: { id: agentId, kind: "ai", name: input.name, role: input.role, agentCategory, soulPrompt: input.soulPrompt ?? template ?? null, status: "active", maxConcurrentSessions: 1, teamId: teamMembers.id, createdAt: now }
8. Return ok({ agentId, name, role, teamId: input.teamId })
```

### create_bet handler

```
1. Validate input (Zod)
2. Verify team exists: SELECT FROM teams WHERE id = input.teamId
3. Generate betId = randomUUID()
4. Insert bets row: { id: betId, teamId, description, doneCondition, hypothesis, status: "draft", createdAt: now }
5. Return ok({ betId, status: "draft", teamId: input.teamId })
```

### create_routine handler

```
1. Validate input (Zod)
2. Verify team exists: SELECT FROM teams WHERE id = input.teamId
3. Verify agent exists: SELECT FROM users WHERE id = input.ownerAgentId
4. Parse and validate cron: parseCron(JSON.parse(triggerConfig).cron)
5. Create stub task (same pattern as routines-routes.ts:186-228):
   a. Find a bet for the team (or create a system bet if none)
   b. Insert stub task
6. Compute nextRunAt from cron
7. Insert routines row
8. Return ok({ routineId, name, stubTaskId })
```

### update_routine handler

```
1. Validate input (Zod)
2. Verify routine exists and is not soft-deleted: SELECT FROM routines WHERE id AND deletedAt IS NULL
3. Build updates object from input.updates (only include fields that are present)
4. If state is set, sync active boolean
5. UPDATE routines SET updates WHERE id
6. Return ok({ routineId, name: updated.name, state: updated.state })
```

## Security and abuse cases

| Surface | Applicable? | Mitigation |
|---|---|---|
| Rate-limit on POST/PATCH | N/A | Tools are invoked within agent sessions, not directly via HTTP. The session provisioning system already gates concurrency (maxConcurrentSessions). Tool invocations are bounded by the LLM's token budget per session. |
| Input-trust boundary | YES | All agent-authored fields are validated by Zod schemas with explicit min/max lengths. Team names capped at 200 chars, descriptions at 10K, soul prompts at 50K (matching agents.ts). Functions array capped at 20 entries. |
| Secret-handling | N/A | No new credential surfaces. Soul templates are read-only from factorySettings. |
| Path-traversal | N/A if repoPath is optional string stored as-is | The `repoPath` field on create_team is stored in `teams.factoryDbPath` — same as the existing POST /teams route. It is stored, not resolved to a filesystem path within the tool. Session provisioning reads it later with its own guards. |
| SSRF | N/A | No outbound URLs. |
| Cross-team privilege escalation | YES | The Assistant runs as `chief_of_staff` (individual category) with factory-wide scope. It SHOULD be able to create teams and agents across any team — that is the design intent (founder's operator). No cross-team restriction needed; the authorization boundary is "only individual-category agents can use management tools." |
| Unbounded resource creation | MITIGATED | Capped by session token budget. A single session cannot invoke tools indefinitely. The spec explicitly says "one tool per turn; multi-step = conversation." |

## Protected tests

```
protectedTests:
  - packages/server/src/skill-tools/__tests__/tool-registry-role.integration.test.ts
  - packages/server/src/skill-tools/__tests__/tool-registry.integration.test.ts
  - packages/server/src/skill-tools/__tests__/tool-schemas.integration.test.ts
```

These existing tests assert on tool counts and role filtering. They MUST be updated (not deleted) to reflect the 5 new tools:

- `tool-registry-role.integration.test.ts` line 93: `expect(names).toHaveLength(15)` becomes `toHaveLength(20)`
- `tool-schemas.integration.test.ts` lines 9-28: `EXPECTED_TOOL_NAMES` array must add 5 entries: `"create_team"`, `"add_agent"`, `"create_bet"`, `"create_routine"`, `"update_routine"`
- `tool-schemas.integration.test.ts` test.each at line 53: automatically picks up the new names from the updated array — no code change needed beyond the array update

## Migrations

No database migrations needed. All tables already exist with the required columns:
- `teams` — has `functions` column (text, nullable)
- `users` — has all agent fields (soulPrompt, agentCategory, harnessType, etc.)
- `teamMembers` — has all fields needed
- `bets` — has all fields needed
- `routines` — has stubTaskId, costCapPerRunMinor, etc.

## File inventory (new files)

| File | Type | Purpose |
|---|---|---|
| `packages/server/src/skill-tools/create-team.ts` | Tool impl | create_team tool |
| `packages/server/src/skill-tools/add-agent.ts` | Tool impl | add_agent tool |
| `packages/server/src/skill-tools/create-bet.ts` | Tool impl | create_bet tool (skill-tool, not route) |
| `packages/server/src/skill-tools/create-routine.ts` | Tool impl | create_routine tool |
| `packages/server/src/skill-tools/update-routine.ts` | Tool impl | update_routine tool |
| `packages/server/src/skill-tools/__tests__/create-team.integration.test.ts` | Test | create_team tests |
| `packages/server/src/skill-tools/__tests__/add-agent.integration.test.ts` | Test | add_agent tests |
| `packages/server/src/skill-tools/__tests__/create-bet.integration.test.ts` | Test | create_bet tests |
| `packages/server/src/skill-tools/__tests__/create-routine.integration.test.ts` | Test | create_routine tests |
| `packages/server/src/skill-tools/__tests__/update-routine.integration.test.ts` | Test | update_routine tests |

## File inventory (modified files)

| File | Change |
|---|---|
| `packages/server/src/skill-tools/tool-registry.ts` | 5 new imports + 5 entries in ALL_TOOL_DEFINITIONS |
| `packages/server/src/skill-tools/index.ts` | 5 new exports |
| `packages/server/src/skill-tools/__tests__/tool-registry-role.integration.test.ts` | Update tool count assertions (15->20), add management tool authorization tests |
| `packages/server/src/skill-tools/__tests__/tool-schemas.integration.test.ts` | Update total tool count if asserted |

## Risks and ambiguities

1. **AD8b rename:** The role string `chief_of_staff` will become `assistant`. All 5 tools use `roles: ["chief_of_staff"]`. When AD8b lands, all 5 need updating. This is a known, bounded migration — same pattern as the 4 existing facilitator tools that already have `@lore AD8a` comments. Add the same `@lore` comment to each new tool.

2. **create_routine stub task creation:** The routine-routes POST handler has complex logic for finding or creating a system bet to parent the stub task. The tool must replicate this logic. This is the most complex handler of the 5 tools (~40 lines for the stub task section alone).

3. **parseCron import:** The `parseCron` function is in `@hyperidle/fabric`. The tool needs to import it. Verify this is exported from the fabric package's index.

4. **Tool count in existing tests:** The B3 test asserts exactly 15 tools for chief_of_staff. Adding 5 tools changes this to 20. If this test is not updated, it will fail. This is flagged in Task 5.

## Self-critique

- **Scope creep check:** 5 tools, no new abstractions, no schema changes, no new event types. Minimal surface area. PASS.
- **Over-engineering check:** Considered and rejected category-based filtering, shared service extraction, and custom audit events. Each rejection is justified above. PASS.
- **Missing failure modes:** Each tool validates entity existence before writes. Invalid input caught by Zod. Role authorization handled by existing toolsForRole. The create_routine cron validation reuses the existing parseCron. PASS.
- **Naming:** `create_team`, `add_agent`, `create_bet`, `create_routine`, `update_routine` — all follow the existing `verb_noun` convention (cf. `create_item`, `create_task`, `route_item`, `score_attention`). PASS.
