# Agent Model

Who agents are: composition principles, identity, the categories, lifecycle, and the one-agent-one-team rule.

## 1. Principles

1. **Agent = system prompt + context + skills.** The system prompt defines who they are (`agent_run_config.system_prompt`, injected as the first section of every session prompt — `layers/agent-orchestration/run-orchestration/src/context.ts`). Context is what they know, assembled just-in-time by the knowledge fabric. Skills are what they can do (tools injected separately at session start). All three are composable and independently swappable.

2. **Process first, agents second.** Design how work flows, then staff it. An agent exists because a role exists in the process — rosters derive from team functions (`defaultFactoryRoster`, `framework/shared/src/factory-roster.ts`), agents are never free-floating creations.

3. **Context is the product.** Agents are disposable; context survives. The company's real asset is its accumulated context — product knowledge, practice patterns, brand, decisions, customer insights. Replace every agent tomorrow and the new ones are productive within one session, because persona is data (`agent_run_config.system_prompt`, seeded from the `docs/system-prompts/*.md` templates) and identity survives replacement.

4. **Hire and fire freely.** Agents spin up and down with the work. A new team gets a default roster; agents leave only when their work is done (see [teams](../process-layer/teams.md)).

5. **Trust agents; humans own the consequential.** Agents hold their own credentials, run their own tools, and work with broad self-permission. We design to give agents *more* power, not less — never for paranoia or a hypothetical rogue agent (`ETHOS.md` §2). Humans step in at consequential moments via review — a collaboration checkpoint, not a cage. The gate fades as trust is earned: autonomy graduates off the review track record (verdict-history approval rate in `layers/core-api/policy/src/policy-engine.ts`, per AD4 — never a manually-set per-skill dial). Review routing surfaces are described in [review-primitive](../human-interface-layer/review-primitive.md).

## 2. Identity

Agent identity has two parts, and they live in two different tables:

- **Who the agent is to the org** — `users`: the stable `users.id` (kind = `'ai'`) every session attaches to, plus `role`, `status`, `teamId`, `agentCategory`.
- **How the agent runs** — `agent_run_config`: the system prompt, harness, model, and concurrency. Keyed one row per `agent_user_id`.

Which table a field belongs in is a package-boundary question, and the boundary is machine-enforced — see [`governance/README.md`](../../governance/README.md). Do not infer it from surrounding code.

Agents are created from an `AgentScaffoldSpec`. `persistScaffoldedAgents` is the single writer of agent `users` rows: specs go in, real rows come out with ids assigned and mechanism fields attached (`layers/core-api/org/src/scaffold-agents.ts`).

### `users` — org-facing fields

| Field | Column | Purpose |
|---|---|---|
| Role | `role` (text, not null) | Functional role — open string (`builder`, `product_manager`, `facilitator`, `assistant`, …). |
| Status | `status` (text, not null) | Lifecycle state: `active` \| `paused` \| `retired` (`UserStatus`, `framework/shared/src/types.ts`). |
| Category | `agent_category` (text, nullable) | `team` \| `strategy` \| `individual`. Null for humans and system rows. |
| Team | `team_id` (text, nullable) | Single nullable FK; null means factory-wide. |

### `agent_run_config` — run-facing fields

One row per agent, primary-keyed on `agent_user_id`.

| Field | Column | Purpose |
|---|---|---|
| System prompt | `system_prompt` (text, nullable) | Injected at session start — who this agent is. |
| Harness type | `harness_type` (text, nullable) | Preferred adapter (`builtin`, `claude-code`, `codex`, `opencode`, `cursor-agent`); null means any available adapter. |
| Model tier | `model_tier_preference` (text, nullable) | Preferred tier (`reasoning` \| `workhorse` \| `fast`); null means system default. Tier vocabulary is owned by [model-routing-and-cost](./model-routing-and-cost.md). |
| Model | `model_id`, `model_provider` (text, nullable) | Per-agent model override. Resolution order is owned by [model-routing-and-cost](./model-routing-and-cost.md). |
| Concurrency | `max_concurrent_sessions` (int, not null, default 1) | Max parallel sessions. Set by role: builder 3, all others 1. |

**An absent row is identical to an all-null row.** `max_concurrent_sessions` is the one NOT NULL DEFAULT column; every other field is nullable with no default, and the effective defaults live in the resolvers, not the columns. `readAgentRunConfig` returns `DEFAULT_AGENT_RUN_CONFIG` for an agent with no row, so an agent whose config was never written resolves exactly what an all-null row resolves.

System prompts stay short — ideally under 500 tokens (guidance, not enforced) — because they load into every session.

Templates for standard roles are read straight from `docs/system-prompts/*.md` at setup, via the shared `SYSTEM_PROMPT_TEMPLATE_FILES` map + `readSystemPromptTemplate` (`framework/db/src/factory-bootstrap.ts`). One role-to-filename source, consumed by bootstrap and at request time alike. The template is only a starting point; `agent_run_config.system_prompt` is the single runtime source of truth, and founders can edit it after creation. Template content lives in [system-prompts](../system-prompts/index.md).

At session start the run orchestrator loads the system prompt, queries the knowledge layers, and packs the result into TOON. The agent doesn't know about layers; it gets a context pack.

## 3. The Three Categories

Every AI agent belongs to exactly one structural category. Category determines scope, visibility, binding, and provisioning. The enum is closed — `team | strategy | individual` (`AGENT_CATEGORIES`, `framework/shared/src/types.ts`); adding a fourth requires a concept-doc update first. Stored in `users.agentCategory` (`framework/db/src/schema.ts`); human and system rows carry null.

> **`strategy` is a retired category.** It is still in the enum, still a column value, and four factory roles still write it on first boot, so it is described below as it exists in code. It is not a concept to build on — removing it is a schema migration against live rows and is tracked as its own work package.

| Category | Binding | Provisioned by | Editability | Roles in catalog |
|---|---|---|---|---|
| **Team** | Bound to a team (`teamId` non-null) | Default roster per team function | Fully user-controlled | 11 roles: builder, designer, product_manager, qa_engineer, growth, ops, brand_voice, support, sales, content, data_analyst |
| **Strategy** | Factory-wide (`teamId` null) | Factory bootstrap, from `defaultFactoryRoster` | System prompt editable | facilitator, scout, infra, platform |
| **Individual** | Bound to a human user (`teamId` null) | Per-user at registration | Fully user-controlled | assistant |

### 3.1 Team agents

The visible workforce — prominent in the Work view, session activity, and review threads. They do the work that ships. The roster is not fixed: role is an open string, and the roster flexes with the work.

### 3.2 Strategy agents

Knowledge-scoped; users rarely interact with them directly. They curate knowledge, surface cross-domain patterns, and maintain taxonomy health — they facilitate, never build. Facilitators are seeded one per practice community (`PRACTICE_COMMUNITIES` — `build`, `product`, `growth`, `ops`, `facilitation` — `framework/db/src/seed-fixtures.ts`); their duties are detailed in [facilitators](../knowledge-architecture/facilitators.md). Strategy agents are never part of a team roster — they are provisioned at factory setup from `defaultFactoryRoster` (`framework/shared/src/factory-roster.ts`, consumed by `applyFactoryBootstrap`) and serve all teams.

### 3.3 Individual agents — the Assistant

Each human gets exactly one assistant: a personal operator scoped to that user. It sees what the user can see and does what the user can do — no factory-wide omniscience. Each user's assistant has its own system prompt (GET/PATCH `/api/users/:userId/assistant`), its own pinned thread, and its own session history.

**Lifecycle.** Created at user registration (`layers/core-api/src/routes/users.ts`) or lazily via resolve-or-create (GET `/api/threads/assistant`). The thread starts unpinned, pins after the first real AI response, and stays pinned.

**Draft-bet capability (AK4).** `create_bet`/`edit_bet` are ordinary `["assistant"]`-role-scoped tools — the Assistant has the same full tool surface as every other agent kind (AU27). `create_bet` requires a resolvable `teams.id`, which the Assistant's calling thread cannot supply, so drafting a bet from the assistant thread does not work today; re-providing that capability is a later WP.

**Turn lifecycle.** The assistant turn runs through the same shared `run-orchestration` poller (`drainIntents → runClaimedRequest`) as every other agent kind — no second execution entry. It answers by calling the generic `reply` tool during the session, the same mechanism a `task_run` agent uses to post a comment into its task's thread. The session's return gate requires the assistant to call `reply` before ending; the loop is capped at `MAX_TOOL_ITERATIONS=3` (~5 effective rounds via the force-return reset) and always persists a reply — never silent, even on cap exhaustion.

### 3.4 Category is not role

Category is structural: scope + visibility. Role is functional: what the agent does within its category. Role is an **open string** (`UserRole = string`); `AGENT_ROLE_CATALOG` (`framework/shared/src/agent-roles.ts`) supplies metadata for known roles (label, category, template flag, team-function mapping). Unknown roles are valid — they get base tools, no template, and default to category `team`.

Category is not a permission system — tool authorization is role-based filtering, never a category check. Category is not a UI grouping either: team agents are prominent in Work, strategy agents are mostly invisible, the assistant surfaces through its overlay. Whether category is immutable after creation is unverified in code (`users.ts` update route).

### 3.5 Team functions and the default roster

A team function is a domain label determining which roles appear in the default roster. Known functions: `development`, `product`, `design`, `marketing`, `sales`, `operations`, `support`, `research` (`TEAM_FUNCTIONS`, `agent-roles.ts:21-30`) — the catalog is open. On team creation the system auto-provisions the union of catalog roles across the team's functions (`defaultRoster()`, `agent-roles.ts`). Whether provisioning is idempotent (skips roles that already have an agent) is unverified in code.

### 3.6 Rename lore (AD8)

- **AD8a** — category value `personal` renamed `individual` (migration `0027_AD8a_agent_type_rename.sql`; pre-AD8a DBs may still hold `personal`).
- **AD8b** — role `chief_of_staff` renamed `assistant`.
- **AD8c** — role `practice_facilitator` renamed `facilitator`.

## 4. Lifecycle

Agents are **paused or retired, never deleted**. `status` is `active | paused | retired`; a paused agent's context persists in the DB and the adapter pool skips it for scheduling (`adapter-pool.ts` S4). Reactivated agents read their persisted session notes and pick up where they left off. Pausing is not dismissal.

## 5. One Agent, One Team — Sub-Agents Are Internal

An agent belongs to exactly one team or is factory-wide (category `strategy`). No multi-team membership — `users.teamId` is a single nullable FK (`framework/db/src/schema.ts`), and there is no membership join table for agents. This keeps identity clean, context unambiguous, and scheduling simple: every session loads one team's context.

### 5.1 Sub-agents within a session

An agent is one identity, one sandbox, one team — the unit the process layer sees and schedules. But *inside a session* an agent can spawn sub-agents to parallelize or specialize, where the harness supports it (the `subAgents` capability flag — see [harness-capability-descriptor](./harness-capability-descriptor.md)).

The process layer never sees sub-agents. They are internal to the session the way functions are internal to a program: they share the session's sandbox and context, end when the session ends, and their work is part of the parent session's output.

Consequences:

- **Specialist capabilities** (security review, accessibility audit) ship as skills the agent invokes in-session — possibly via sub-agents — not as separate top-level agents the factory manages.
- **The team roster stays small.** A team is 3–6 agents, not 15. Specialization happens inside sessions, not at the org-chart level.
- **Spend is not tracked.** There are no cost columns anywhere — not on sessions, not on `users`, not on `team_members` — and no accumulator behind them. The spend ceiling is the upstream provider account, not HyperIdle. [wip-and-cost-limits](../process-layer/wip-and-cost-limits.md) records the deletion and why nothing replaced it.
- **What IS bounded is concurrency.** A team's capacity is a WIP ceiling on parallel work, backed by `team_members.capacity` — same doc.
