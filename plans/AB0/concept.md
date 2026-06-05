# AB0 Concept: Agent Structure

**Status:** Locked. This concept is the fixed input for `/architecture` and all downstream AB-track workpackages.

---

## Required reading for downstream skills

These files must be read by `/architecture`, `/write-tests`, and `/write-code` for AB0:

- `docs/agent-layer/agent-structure.md` -- the ground-truth concept doc (written alongside this file)
- `docs/agent-layer/the-two-categories.md` -- the prior two-category model (superseded by this concept)
- `docs/agent-layer/agent-identity.md` -- identity fields on the users table
- `docs/agent-layer/principles.md` -- the five agent principles
- `docs/agent-layer/lifecycle-scaling.md` -- team scaling by lifecycle phase
- `packages/shared/src/types.ts` -- current USER_ROLES definition
- `packages/db/src/schema.ts` -- users table schema
- `packages/db/src/seed.ts` -- current seed data
- `packages/db/src/seed-fixtures.ts` -- practice communities and routine seeds
- `packages/server/src/routes/agents.ts` -- agent CRUD routes
- `packages/server/src/skill-tools/tool-registry.ts` -- role-based tool authorization
- `packages/fabric/src/role-community-map.ts` -- role-to-community mapping
- `packages/fabric/src/materialization.ts` -- materialization uses agentRole
- `packages/fabric/src/session-context.ts` -- session context uses UserRole

---

## 1. The three Agent Categories

An **Agent Category** is a structural classification that determines where an agent lives, who controls it, and how it is provisioned. Every AI agent belongs to exactly one category. The category is immutable after creation.

### 1.1 Team agents

Bound to a team. Domain specialists whose role maps to the team's functional focus. Provisioned from the default roster when a team is created. The user freely edits their soul, name, and configuration.

- **Binding:** `users.teamId` is non-null. Always references a `teamMembers` group.
- **Provisioning:** Auto-provisioned from the default roster based on team function. Can also be created manually by the founder.
- **Editability:** Fully user-controlled. The soul template is a starting point; the user customizes from there.
- **Examples:** builder, designer, QA engineer, growth agent, ops agent, product manager, support agent, sales agent.

### 1.2 Strategy agents

Bound to the strategy (factory-wide). Exist across all teams or operate cross-team. The strategy controls their operational behavior. The user can tweak the soul but changes may be refreshed on strategy updates.

- **Binding:** `users.teamId` is null. Operate at factory scope.
- **Provisioning:** Auto-provisioned by the strategy at factory setup. Not tied to team creation.
- **Editability:** Soul is editable but marked as "managed by strategy." Operational config (tools, knowledge injection) is strategy-controlled.
- **Examples:** practice facilitator (one per community of practice), infra agent, platform agent, scout.

### 1.3 Personal agents

Bound to a human user. Serve the individual founder, not a team. Fully user-controlled.

- **Binding:** `users.teamId` is null. References a human user via org edge or a dedicated column.
- **Provisioning:** Auto-provisioned per human user at setup. One personal agent per human user by default (Chief of Staff).
- **Editability:** Fully user-controlled. The strategy provides a starting template but does not refresh.
- **Examples:** chief of staff.

### 1.4 Category is NOT

- **Not a role.** Category is structural (where the agent lives). Role is functional (what it does). A builder and a designer are both team agents with different roles.
- **Not an access level.** All agents have the same technical capabilities. Category determines organizational placement.
- **Not a deployment tier.** Strategy agents are not "more important" than team agents.

### 1.5 Category contracts

- **Closure:** Closed enum: `team | strategy | personal`. Adding a fourth requires a concept-doc update.
- **Cardinality:** Every AI agent has exactly one category.
- **Immutability:** Category cannot be changed after creation.
- **Storage:** New `agentCategory` column on the `users` table. Null for human users.
- **Invariant:** Strategy agents always have null `teamId`. Team agents always have non-null `teamId`. Personal agents have null `teamId` but are associated with a human user.

---

## 2. Agent Role (open string with catalog)

An **Agent Role** is the functional specialty of an agent. It determines which soul template applies, which tools are authorized, and which practice community maps to the agent.

### 2.1 From closed enum to open string

The current `USER_ROLES` is a closed 6-value tuple:
```
builder | growth | product_manager | practice_facilitator | chief_of_staff | brand_voice
```

This cannot scale. Teams have diverse functions (marketing, development, design, sales) and each brings domain-specific roles. The enum must accommodate: designer, QA engineer, ops engineer, support agent, sales agent, content writer, data analyst, and user-defined custom roles.

**Decision:** Role becomes an open `string`. The system ships a **Role Catalog** of known roles with metadata (category, soul template, tool access, community mapping), but users can create agents with any role string. Unknown roles get base tools and no template.

### 2.2 Role Catalog

The catalog replaces `KERNEL_USER_ROLES`, `FABRIC_USER_ROLES`, and `USER_ROLES`. It is a typed constant in `packages/shared/`:

```ts
interface AgentRoleCatalogEntry {
  role: string;                    // e.g. "builder"
  label: string;                   // e.g. "Builder"
  category: AgentCategory;         // e.g. "team"
  description: string;             // one-line description
  community: string;               // practice community mapping (e.g. "building")
  teamFunctions: string[];         // which team functions this role belongs to
  hasTemplate: boolean;            // whether a soul template exists
}
```

Known roles in the catalog:

| Role | Label | Category | Community | Team Functions |
|---|---|---|---|---|
| `builder` | Builder | team | building | development |
| `designer` | Designer | team | product | design |
| `product_manager` | Product Manager | team | product | product |
| `qa_engineer` | QA Engineer | team | building | development |
| `growth` | Growth | team | growth | marketing |
| `brand_voice` | Brand Voice | team | growth | marketing |
| `ops` | Ops | team | ops | operations |
| `support` | Support | team | ops | support |
| `sales` | Sales | team | growth | sales |
| `content` | Content Writer | team | growth | marketing |
| `data_analyst` | Data Analyst | team | product | research |
| `practice_facilitator` | Practice Facilitator | strategy | (per-scope) | -- |
| `chief_of_staff` | Chief of Staff | personal | ops | -- |
| `scout` | Scout | strategy | product | -- |
| `infra` | Infra Agent | strategy | ops | -- |
| `platform` | Platform Agent | strategy | building | -- |

### 2.3 Role is NOT

- **Not a closed enum.** Users can create agents with any role string.
- **Not a category.** "practice_facilitator" is a role whose category is "strategy."
- **Not a permission set.** Tool access is derived from category + catalog entry, not from the role string alone.

### 2.4 Role contracts

- **Closure:** Open vocabulary. Any non-empty string is valid.
- **Mutability:** An agent's role can be changed via PATCH. Changing the role does not auto-update the soul.
- **Tool authorization:** Known roles get category-appropriate tools. Unknown roles get base tools (the shared set available to all agents). Facilitator tools (route_item, score_attention, promote_knowledge, create_conflict_review) are restricted to strategy-category agents, not to specific role strings.
- **Community mapping:** Known roles have an explicit community. Unknown roles default to "ops".
- **Backward compatibility:** The old `USER_ROLES` tuple is removed. The `UserRole` type becomes `string`. All `z.enum(USER_ROLES)` validation is replaced with `z.string().min(1)`.

---

## 3. Team Function

A **Team Function** is a domain label on a team that determines which agent roles are relevant for that team's default roster.

### 3.1 Known functions

| Function | Label | Default agent roles |
|---|---|---|
| `development` | Development | builder, qa_engineer |
| `product` | Product | product_manager |
| `design` | Design | designer |
| `marketing` | Marketing | growth, brand_voice, content |
| `sales` | Sales | sales |
| `operations` | Operations | ops |
| `support` | Support | support |
| `research` | Research | data_analyst |

### 3.2 Cross-functional teams

A team has one or more functions. The default roster is the union of roles from all functions, deduplicated. Example: a team with functions `[development, product, design]` gets: builder, qa_engineer, product_manager, designer.

### 3.3 Function contracts

- **Closure:** Open vocabulary with a known catalog. Users can add custom functions.
- **Cardinality:** A team has one or more functions.
- **Storage:** New `functions` column on the `teams` table, stored as a JSON array of strings.
- **Hard rule:** The default roster is computed as the union of roles for all functions.

### 3.4 Function is NOT

- **Not a team phase.** Phase is lifecycle (discover, build, grow). Function is domain (development, marketing). Orthogonal.
- **Not exclusive.** A team can have multiple functions.
- **Not a department.** HyperIdle has flat teams, not hierarchies.

---

## 4. Soul and Agent Prompt composition

### 4.1 Soul (SOUL.md equivalent)

The **Soul** is the user-authored personality layer of an agent. It answers "who are you?" -- personality, communication style, values, domain expertise framing. Stored as the `soulPrompt` column on the `users` table.

- The soul is what the user writes or edits.
- A soul template provides a starting point; the user customizes from there.
- The soul is category-invariant: every agent has a soul regardless of category.

### 4.2 Agent Prompt (AGENT.md equivalent)

The **Agent Prompt** is the strategy-materialized operational prompt composed at session start. It is NOT stored -- it is computed by `composePrompt()` during session provisioning (phase 8.5).

The agent prompt is assembled from:
1. **Soul** -- user-authored personality (always first)
2. **Role definition** -- from the role catalog (what this role does, its scope, its tools)
3. **Session context** -- task, bet, team (from `buildSessionContextData()`)
4. **Knowledge items** -- materialized from the knowledge fabric
5. **Tool descriptions** -- from `toolsForRole()`

### 4.3 Composition boundary

| Aspect | Authored by | Stored where | When composed |
|---|---|---|---|
| Soul | User | `users.soulPrompt` column | Written at agent creation, edited anytime |
| Role definition | Strategy (catalog) | `AGENT_ROLE_CATALOG` constant | Read at session start |
| Session context | System | Computed from DB | Computed at session start |
| Knowledge items | Knowledge fabric | Materialized to workspace | Computed at session start |
| Tool descriptions | Tool registry | `ALL_TOOL_DEFINITIONS` | Computed at session start |

### 4.4 Soul contracts

- **Mutability:** Freely editable by the user at any time.
- **Strategy refresh:** For strategy agents, the soul may be refreshed on strategy update. The user is warned in the UI.
- **Hard rule:** The soul is always the FIRST section of the composed agent prompt. It is not mixed into or overridden by strategy content.

### 4.5 Soul is NOT

- **Not the full agent prompt.** The soul is one input to the composed prompt.
- **Not a template.** A template is a starting point. The soul is the stored value.
- **Not configuration.** Model tier, harness type, max sessions are operational config, not soul.

---

## 5. Default Roster

The **Default Roster** is a mapping from team function(s) to a set of agent roles that should be auto-provisioned when a team is created.

### 5.1 Roster definition

The roster is defined in the Role Catalog: each catalog entry lists which `teamFunctions` it belongs to. The roster for a team with functions F1, F2 is:

```
roster(team) = union(catalog.filter(entry => entry.teamFunctions intersects team.functions))
```

### 5.2 Provisioning behavior

When `createTeam()` is called with functions:
1. Compute the roster from the catalog.
2. For each role in the roster, create an agent (user row) with:
   - `kind: 'ai'`
   - `role: <role string>`
   - `agentCategory: 'team'`
   - `soulPrompt: <from template if available, else null>`
   - `teamId: <the new team's teamMembers id>`
   - `status: 'active'`
3. Skip roles that already have an agent on the team (idempotent).

### 5.3 Ramp-up

Not all roster agents need to be active from day one. The lifecycle scaling table from `lifecycle-scaling.md` still applies: in the "Define" phase, only the product manager is active. Others start as "paused" and activate as the team matures.

### 5.4 Roster contracts

- **Identity:** Static lookup in the role catalog. Not a database entity.
- **Hard rule:** Auto-provisioning is idempotent. It does not create duplicate agents for the same role on the same team.
- **Hard rule:** Strategy agents (practice facilitators, scout, infra, platform) are NOT part of the team roster. They are provisioned separately at factory setup.

---

## 6. Migration from current state

### 6.1 What changes

| Current | New |
|---|---|
| `USER_ROLES` closed tuple (6 values) | `AgentRole` = `string`, `AGENT_ROLE_CATALOG` provides known roles |
| `KERNEL_USER_ROLES` / `FABRIC_USER_ROLES` split | Removed. Category replaces the kernel/fabric distinction |
| No `agentCategory` column | New `agent_category` column on `users` table |
| No team functions | New `functions` column on `teams` table |
| `ROLE_TO_COMMUNITY` as `Record<UserRole, string>` | Lookup function using the role catalog with fallback |
| `z.enum(USER_ROLES)` at API boundaries | `z.string().min(1)` with catalog-based validation |
| `toolsForRole(role)` filters by `UserRole` | Filters by category + catalog. Strategy category gets facilitator tools |
| Seed creates fixed agents | Seed creates agents per roster + strategy agents + personal agents |

### 6.2 Backward compatibility

- `users.role` column stays as `text`. No schema migration for existing data.
- Existing role values (`builder`, `growth`, `product_manager`, `practice_facilitator`, `chief_of_staff`, `brand_voice`) all have catalog entries. No data migration needed.
- The `agent_category` column is added with a migration that backfills existing agents: `practice_facilitator`, `scout`, `infra`, `platform` -> `strategy`; `chief_of_staff` -> `personal`; all others -> `team`.
- The `functions` column on `teams` is added with a default of `["development", "product"]` (matching the current seed team's implicit function).

---

## 7. Vocabulary

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **Agent Category** | Structural classification: team, strategy, or personal | agent type, agent kind, agent class, agent tier |
| **Agent Role** | Functional specialty string. Open with catalog | user role, role enum, job title, agent function |
| **Team Function** | Domain label on a team determining relevant agent roles | team type, team category, team domain |
| **Soul** | User-authored personality layer (`soulPrompt`) | persona, character, agent identity (as field name) |
| **Agent Prompt** | Strategy-composed operational prompt. Computed, not stored | system prompt, instruction set |
| **Role Catalog** | Registry of known roles with metadata | role registry, role config |
| **Default Roster** | Function-to-roles mapping for team provisioning | team template, starter pack |

---

## 8. Rationale

The existing two-category model (Central vs Product Team) conflates three structurally different relationships: practice facilitators serve the factory but participate in teams; the chief of staff serves a human, not the factory; and builders serve a team exclusively. Every downstream AB workpackage (profile page, team overview, setup wizard) needs to know which of these three patterns an agent follows -- the two-category model cannot express this, and the flat role enum mixes organizational structure with functional specialty.

Opening the role to a string with a catalog avoids the enum-expansion problem: adding a "designer" role today requires a code change to `USER_ROLES`, a migration, and updates to every `z.enum()` validation. With an open string + catalog, adding a new role is adding a catalog entry -- no schema change, no migration, no API validation change.

The soul/agent-prompt composition boundary formalizes what the code already does (composePrompt assembles soul + context + tools) but makes it visible to the user: "you write the soul, the system handles everything else." This is the key insight for AB3's editing flow.
