# Agent Model

Who agents are: composition principles, identity, the categories, lifecycle, and the one-agent-one-team rule.

## 1. Principles

1. **Agent = identity + context + skills.** The identity says who they are — an `agent_file` knowledge document bound to the agent, injected as the `## Identity` section of every session prompt (`layers/agent-orchestration/run-orchestration/src/context.ts`). Context is what they know, assembled just-in-time by the knowledge fabric. Skills are what they can do (tools injected separately at session start). All three are composable and independently swappable.

2. **Process first, agents second.** Design how work flows, then staff it. HyperIdle ships no opinion about what roles a process needs: a new team is one empty agent, and you shape it — or install a plugin that brings a shaped team.

3. **Context is the product.** Agents are disposable; context survives. The company's real asset is its accumulated context — product knowledge, practice patterns, brand, decisions, customer insights. Replace every agent tomorrow and the new ones are productive within one session, because an identity is a knowledge document like any other, and identity survives replacement.

4. **Hire and fire freely.** Agents spin up and down with the work. A new team starts with one agent; you add the rest, or a plugin does (see [teams](../process-layer/teams.md)).

5. **Trust agents; humans own the consequential.** Agents hold their own credentials, run their own tools, and work with broad self-permission. We design to give agents *more* power, not less — never for paranoia or a hypothetical rogue agent (`ETHOS.md` §2). Humans step in at consequential moments via review — a collaboration checkpoint, not a cage. Every review waits for a human's own verdict; the agent's verdict-history approval rate (`layers/core-api/policy/src/approval-rate.ts`, per AD4) is shown as a track record on its profile, never used to auto-resolve or skip a review. Review surfaces are described in [review-primitive](../human-interface-layer/review-primitive.md).

## 2. Identity

Agent identity has two parts, and they live in two different tables:

- **Who the agent is to the org** — `users`: the stable `users.id` (kind = `'ai'`) every session attaches to, plus `role`, `status`, `teamId`, `agentCategory`.
- **How the agent runs** — `agent_run_config`: harness, model, and concurrency. Keyed one row per `agent_user_id`. **Not** the identity — that is a knowledge document (§2.1).

Which table a field belongs in is a package-boundary question, and the boundary is machine-enforced — see [`tools/governance/README.md`](../../tools/governance/README.md). Do not infer it from surrounding code.

Agents are created from an `AgentScaffoldSpec`. `persistScaffoldedAgents` is the single writer of agent `users` rows: specs go in, real rows come out with ids assigned and mechanism fields attached (`layers/core-api/org/src/scaffold-agents.ts`).

### `users` — org-facing fields

| Field | Column | Purpose |
|---|---|---|
| Role | `role` (text, not null) | Functional role — open string (`builder`, `product_manager`, `facilitator`, `assistant`, …). |
| Status | `status` (text, not null) | Lifecycle state: `active` \| `paused` \| `retired` (`UserStatus`, `framework/domain-model/src/types.ts`). |
| Category | `agent_category` (text, nullable) | `team` \| `individual`. Null for humans and system rows. (`strategy` removed in BA9d — existing rows migrated to `individual`.) |
| Team | `team_id` (text, nullable) | Single nullable FK; null means factory-wide. |
| Owner | `owner_user_id` (text, nullable) | Single nullable FK to another `users` row — the person this agent belongs to (`individual` category). A check constraint (`users_belonging_ck`) enforces a team, a person, or neither, never two: `owner_user_id IS NULL OR (kind = 'ai' AND team_id IS NULL)`. Written once at creation (`insertUser`); no update path exists yet. |

### `agent_run_config` — run-facing fields

One row per agent, primary-keyed on `agent_user_id`.

| Field | Column | Purpose |
|---|---|---|
| Harness type | `harness_type` (text, nullable) | Preferred adapter (`claude-code`, `codex`, `opencode`, `cursor-agent`); null means any available adapter. |
| Model | `model_id`, `model_provider` (text, nullable) | Per-agent model override. Resolution order is owned by [model-routing-and-cost](./model-routing-and-cost.md). |
| Concurrency | `max_concurrent_sessions` (int, not null, default 1) | Max parallel sessions. Every agent starts at 1; the operator raises it. |

**An absent row is identical to an all-null row.** `max_concurrent_sessions` is the one NOT NULL DEFAULT column; every other field is nullable with no default, and the effective defaults live in the resolvers, not the columns. `readAgentRunConfig` returns `DEFAULT_AGENT_RUN_CONFIG` for an agent with no row, so an agent whose config was never written resolves exactly what an all-null row resolves.

### 2.1 Identity is a knowledge document

Who an agent is lives where every other piece of knowledge lives: an
`agent_file` document parented to the agent — `parentKind='agent'`, `parentId`
the agent's id — with `role='agent_file'`, which is what that role has always
meant. Its body is read, edited, versioned and reviewed like any document,
through the one knowledge edit endpoint. Editing it changes what the agent's
next session runs with.

The identity is seeded once, where an agent comes into existence, and is the
person's from then on. An agent with no identity document runs with no `##
Identity` section at all — a valid state, and the state a new team's agent
starts in.

HyperIdle ships no role personas. A Builder, a Designer, a Product Manager are
things a plugin brings: a plugin's agent declares an `identity` file, and
installing it materialises that document. See
[plugins](../architecture/plugins.md).

Identities stay short — ideally under 500 tokens (guidance, not enforced) —
because they load into every session, and the prompt assembler truncates to the
token budget rather than overflowing it.

At session start the run orchestrator loads the identity, queries the knowledge
layers, and packs the result into TOON. The agent doesn't know about layers; it
gets a context pack.

## 3. The Three Categories

Every AI agent belongs to exactly one structural category. Category determines scope, visibility, binding, and provisioning. The enum is closed — `team | individual` (`AGENT_CATEGORIES`, `framework/domain-model/src/types.ts`); adding a third requires a concept-doc update first. Stored in `users.agentCategory` (`framework/db/src/schema.ts`); human and system rows carry null.

> **`strategy` category was removed in BA9d (migration 0065).** All former `strategy` rows (facilitator, scout, infra, platform) migrated to `individual`. Plugin-provided agents use BA9a's detach-and-restore mechanism — no special category needed.

| Category | Binding | Provisioned by | Editability | Roles in catalog |
|---|---|---|---|---|
| **Team** | Bound to a team (`teamId` non-null) | One at team creation; the rest by you or a plugin | Fully user-controlled | Any role — a role is a string, not a list |
| **Individual** | Bound to a human user (`ownerUserId` non-null, `teamId` null) OR a factory-wide plugin agent | Per-user at registration, or plugin install | Fully user-controlled | `assistant` for the per-human one; any role for a plugin's |

### 3.1 Team agents

The visible workforce — prominent in the Work view, session activity, and review threads. They do the work that ships. The roster is not fixed: role is an open string, and the roster flexes with the work.

### 3.2 Plugin agents

A plugin can contribute agents that serve the whole factory or one team. They
arrive with their own identity (an `identity` file in the plugin), and the
plugin service records every one in its ownership registry, so disabling or
uninstalling the plugin takes its agents down with it.

The factory itself provisions none of them. The old `defaultFactoryRoster` —
five facilitators, one per practice community — is gone: the facilitator
personas never worked and were retired in BA9d, and the roster concept left the
core entirely in BA9g. What survives of that idea is the document-management
plugin's `librarian` agent (`plugins/document-management/`, [archived design
sketch](../archive/facilitators.md)) — a real plugin-provided agent that
triages and decays documents on a schedule, not a hardcoded role category.

### 3.3 Individual agents — the Assistant

Each human gets exactly one assistant: a personal operator scoped to that user. It sees what the user can see and does what the user can do — no factory-wide omniscience. Each user's assistant has its own identity document and
its own session history; the overlay opens an ordinary direct thread with it, like any direct thread between a user and one agent. **The assistant is the one agent HyperIdle ships with a
persona** — it is what you talk to on a fresh install, and it carries extra
rights. It is edited through `/api/agents/:id` and the `edit_document` action, like every other agent; the `GET/PATCH /api/users/:userId/assistant`
pair that used to be its private editor was deleted in BA9f.

**Lifecycle.** Created at user registration (`layers/core-api/src/routes/users.ts`); its thread is created on the overlay's first send (`send_message` with `recipients: [assistantId]`), the same as any other direct thread. There is no dedicated assistant thread route and no auto-pin: it starts and stays an ordinary direct thread.

**Task drafting.** `edit_task` (no `id` creates) is one of the ordinary action-projected tools every agent kind sees, unrestricted by role — the Assistant has the same full tool surface as every other agent kind (AU27). Creating a task requires a resolvable `teams.id`; the calling thread context determines whether that is available.

**Turn lifecycle.** The assistant turn runs through the same shared `run-orchestration` poller (`drainIntents → runClaimedRequest`) as every other agent kind — no second execution entry. It answers by calling `send_message` during the session, the same mechanism every other agent kind uses to post into a thread. The session's return gate requires the assistant to call `send_message` before ending; the loop is capped at `MAX_TOOL_ITERATIONS=3` (~5 effective rounds via the force-return reset) and always persists a reply — never silent, even on cap exhaustion.

### 3.4 Category is not role

Category is structural: scope + visibility. Role is functional: what the agent
does within its category.

**A role is data, not a list.** It is an open string on an agent
(`UserRole = string`). The roles that exist are the distinct roles among the
agents you can see — that is what the role pickers offer — and typing a new one
introduces it. A plugin introduces one by declaring an agent with it.
`roleLabel` (`framework/domain-model/src/agent-roles.ts`) derives a display name
from any string, so nothing needs a registry to render.

The hardcoded `AGENT_ROLE_CATALOG` — 17 roles with labels, categories, template
flags and team-function mappings — was deleted in BA9g.

Category is not a permission system — tool authorization is role-based filtering, never a category check. Category is not a UI grouping: team agents are prominent in Work, individual agents (including facilitators) are visible per role. Whether category is immutable after creation is unverified in code (`users.ts` update route).

### 3.5 A new team is one agent

Creating a team creates one agent, with no identity, carrying the neutral role
`agent`. You shape it, or install a plugin that brings a shaped team.

There is no roster and no team "functions". A team used to declare functions
(`development`, `product`, …) that mapped through the role catalog to
auto-provision a Builder, a Product Manager and a QA Engineer, and a team that
produced no agents was rejected. All of it — the mapping, the `functions`
column, the rejection — was removed in BA9g.

### 3.6 Rename lore (AD8)

- **AD8a** — category value `personal` renamed `individual` (migration `0027_AD8a_agent_type_rename.sql`; pre-AD8a DBs may still hold `personal`).
- **AD8b** — role `chief_of_staff` renamed `assistant`.
- **AD8c** — role `practice_facilitator` renamed `facilitator`.

## 4. Lifecycle

Agents are **paused or retired, never deleted**. `status` is `active | paused | retired`; a paused agent's context persists in the DB and the adapter pool skips it for scheduling (`adapter-pool.ts` S4). Reactivated agents read their persisted session notes and pick up where they left off. Pausing is not dismissal.

## 5. One Agent, One Team — Sub-Agents Are Internal

An agent belongs to exactly one team, or is factory-wide (`teamId` null, e.g. system assistant and plugin-provided facilitators). No multi-team membership — `users.teamId` is a single nullable FK (`framework/db/src/schema.ts`), and there is no membership join table for agents. This keeps identity clean, context unambiguous, and scheduling simple: every session loads one team's context.

### 5.1 Sub-agents within a session

An agent is one identity, one sandbox, one team — the unit the process layer sees and schedules. But *inside a session* an agent can spawn sub-agents to parallelize or specialize, where the harness supports it (the `subAgents` capability flag — see [harness-capability-descriptor](./harness-capability-descriptor.md)).

The process layer never sees sub-agents. They are internal to the session the way functions are internal to a program: they share the session's sandbox and context, end when the session ends, and their work is part of the parent session's output.

Consequences:

- **Specialist capabilities** (security review, accessibility audit) ship as skills the agent invokes in-session — possibly via sub-agents — not as separate top-level agents the factory manages.
- **The team roster stays small.** A team is 3–6 agents, not 15. Specialization happens inside sessions, not at the org-chart level.
- **Spend is not tracked.** There are no cost columns anywhere — not on sessions, not on `users`, not on `team_members` — and no accumulator behind them. The spend ceiling is the upstream provider account, not HyperIdle. [wip-and-cost-limits](../process-layer/wip-and-cost-limits.md) records the deletion and why nothing replaced it.
- **What IS bounded is concurrency.** A team's capacity is a WIP ceiling on parallel work, backed by `team_members.capacity` — same doc.
