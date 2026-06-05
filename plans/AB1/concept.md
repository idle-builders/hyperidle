# AB1 Concept — Agent Profile & Capabilities

**Status:** Inherited from AB0. No new concept work needed.

## Verification

The AB0 concept (`docs/agent-layer/agent-structure.md`) covers all domain nouns required for AB1:

- **Agent categories** (team | strategy | personal) — closed enum, immutable after creation. Used on the profile to show binding context.
- **Agent role** — open string with `AGENT_ROLE_CATALOG` providing metadata (label, description, community, teamFunctions, hasTemplate). Unknown roles are valid.
- **Soul and agent prompt composition** — five layers (soul, role definition, session context, knowledge, tools). Soul is user-authored (`users.soulPrompt`); everything else is system-composed at session start.
- **Team function** — determines default roster. Relevant for showing which team an agent belongs to.
- **Default roster** — auto-provisioning from team functions. Relevant for navigation context (team page -> agent profile).

## No New Nouns

AB1 introduces a **page** (Agent Profile), not a new domain concept. The page composes existing data:

- `users` table fields (identity, config, status)
- `sessions` table (activity, performance aggregates)
- `userSkills` table (skill access)
- `HarnessCapabilities` interface (what the harness can do)
- `AdapterPool` metadata (harness type, MCP support, model providers)
- `AGENT_ROLE_CATALOG` (role metadata)

The only new *computation* is health signal derivation (failure rate trend, cost trend, idle duration, configuration validity). These are read-side aggregations, not new entities. They do not warrant concept work.

## Concepts That Are NOT Being Introduced

- No "AgentHealth" entity — health signals are computed on-demand from sessions, never stored.
- No "AgentCapability" entity — capabilities come from `HarnessCapabilities` + `toolsForRole()`, both existing.
- No "AgentPerformance" entity — aggregates are computed per-request from session history.
