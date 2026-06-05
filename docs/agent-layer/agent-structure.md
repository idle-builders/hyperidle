## Agent Structure

> **Supersedes:** `the-two-categories.md` (Central vs Product Team split). The prior two-category model is retained for historical reference but is no longer the authoritative taxonomy.

### Agent Categories

Every AI agent belongs to exactly one of three structural categories. The category determines binding, provisioning, and editability.

| Category | Binding | Provisioned by | Editability | Examples |
|---|---|---|---|---|
| **Team** | Bound to a team (`teamId` non-null) | Default roster per team function | Fully user-controlled | builder, designer, product_manager, qa_engineer, growth, ops |
| **Strategy** | Factory-wide (`teamId` null) | Strategy at factory setup | Soul editable; operational config strategy-managed | practice_facilitator, scout, infra, platform |
| **Personal** | Bound to a human user (`teamId` null) | Per-user at setup | Fully user-controlled | chief_of_staff |

Category is a closed enum (`team | strategy | personal`). Adding a fourth requires a concept-doc update. Category is immutable after agent creation.

### Agent Role

The functional specialty of an agent. An open string with a catalog of known roles providing metadata (soul template, tool access, community mapping, team functions). Unknown roles are valid -- they receive base tools and no template.

Known roles and their catalog entries are defined in `packages/shared/src/agent-roles.ts`.

The prior `USER_ROLES` closed enum (`builder | growth | product_manager | practice_facilitator | chief_of_staff | brand_voice`) is replaced. The `KERNEL_USER_ROLES` / `FABRIC_USER_ROLES` split (which was about system layer, not agent category) is removed.

### Team Function

A domain label on a team that determines which agent roles appear in the default roster. A team has one or more functions. The default roster is the union of roles from all functions.

Known functions: `development`, `product`, `design`, `marketing`, `sales`, `operations`, `support`, `research`. The catalog is open -- users can define custom functions.

### Soul and Agent Prompt Composition

| Layer | Authored by | Stored | Composed when |
|---|---|---|---|
| **Soul** (user personality) | User | `users.soulPrompt` | Written at creation, edited anytime |
| **Role definition** | Strategy (catalog) | `AGENT_ROLE_CATALOG` | Read at session start |
| **Session context** | System | Computed from DB | Session start |
| **Knowledge items** | Knowledge fabric | Materialized to workspace | Session start |
| **Tool descriptions** | Tool registry | `ALL_TOOL_DEFINITIONS` | Session start |

The soul is always the first section of the composed agent prompt. It is not mixed into or overridden by strategy content. The user defines the soul; the system provides everything else.

### Default Roster

When a team is created, the system auto-provisions agents based on the team's functions. The roster is the union of roles mapped to those functions in the role catalog. Auto-provisioning is idempotent -- it skips roles that already have an agent on the team.

Strategy agents (practice facilitators, scout, infra, platform) are not part of the team roster. They are provisioned separately at factory setup and serve all teams.

---
