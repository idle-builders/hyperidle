# Agent Model

Who agents are: composition principles, identity, the three categories, lifecycle, and the one-agent-one-team rule. Ownership of identity (Kernel mechanism vs Strategy persona) is defined in [kernel-strategy-split](../architecture/kernel-strategy-split.md).

## 1. Principles

1. **Agent = system prompt + context + skills.** The system prompt defines who they are (`users.system_prompt`, injected as the first section of every session prompt — `packages/fabric/src/context-assembly-prompt.ts:203-220`). Context is what they know, assembled just-in-time by the knowledge fabric. Skills are what they can do (tools injected separately at session start). All three are composable and independently swappable.

2. **Process first, agents second.** Design how work flows, then staff it. An agent exists because a role exists in the process — rosters derive from team functions (`packages/fabric/src/roster.ts:69`), agents are never free-floating creations.

3. **Context is the product.** Agents are disposable; context survives. The company's real asset is its accumulated context — product knowledge, practice patterns, brand, decisions, customer insights. Replace every agent tomorrow and the new ones are productive within one session, because persona is data (`users.system_prompt` + `factory_settings` templates) and identity survives replacement.

4. **Hire and fire freely.** Agents spin up and down with the work. A new team gets a default roster; agents leave only when their work is done (see [teams](../process-layer/teams.md)).

5. **Trust agents; humans own the consequential.** Agents hold their own credentials, run their own tools, and work with broad self-permission. We design to give agents *more* power, not less — never for paranoia or a hypothetical rogue agent (`ETHOS.md` §2). Humans step in at consequential moments via review — a collaboration checkpoint, not a cage. The gate fades as trust is earned: autonomy graduates off the review track record (verdict-history approval rate in `packages/fabric/src/services/policy-engine.ts`, per AD4 — never a manually-set per-skill dial). Review routing surfaces are described in [review-primitive](../human-interface-layer/review-primitive.md).

## 2. Identity

Agent identity has two parts with different owners:

- **Agent user-id** — the stable `users.id` (kind = `'ai'`) the Kernel owns. Every session attaches to a user-id. The Kernel owns the `users` table and all mechanism fields.
- **Agent persona** — the system prompt / role that defines *who the agent is*. This is Strategy-owned; the persona/Kernel split boundary is defined in [kernel-strategy-split](../architecture/kernel-strategy-split.md).

The persona arrives as an `AgentScaffoldSpec` from the active Strategy at creation time; the Kernel persists `systemPrompt` into `users.system_prompt` and attaches mechanism fields (`packages/server/src/services/scaffold-agents.ts:112-116`).

### `users` agent fields

| Field | Column | Owner | Purpose |
|---|---|---|---|
| System prompt | `system_prompt` (text, nullable) | **Strategy** (content) / **Kernel** (persistence) | Injected at session start — who this agent is. Null under the Minimal Strategy. |
| Harness type | `harness_type` (text, nullable) | **Kernel** | Preferred adapter type (`builtin`, `claude-code`, `codex`, `opencode`, `cursor-agent`); null means any available adapter. Set by `persistScaffoldedAgents` (default `builtin`); never carried on the Strategy spec. |
| Model tier | `model_tier_preference` (text, nullable) | **Kernel** | Preferred tier (`reasoning` \| `workhorse` \| `fast`); null means system default. Tier vocabulary is owned by [model-routing-and-cost](./model-routing-and-cost.md). |
| Concurrency | `max_concurrent_sessions` (int) | **Kernel** | Max parallel sessions. Set by role: builder 3, all others 1 (`scaffold-agents.ts:116`). |
| Role | `role` (text) | **Strategy** (decision) / **Kernel** (persistence) | Functional role — open string (`builder`, `product_manager`, `facilitator`, `assistant`, …). |
| Status | `status` (text) | **Kernel** | Lifecycle state: `active` \| `paused` \| `retired` (`packages/shared/src/types.ts:145`). |

System prompts stay short — ideally under 500 tokens (guidance, not enforced) — because they load into every session.

Templates for standard roles are seeded into `factory_settings` under `system_template:<role>` at setup (`packages/db/src/factory-bootstrap.ts:207`). The template is a Strategy-side starting point; `users.system_prompt` is the single runtime source of truth, and founders can edit it after creation. Template content lives in [system-prompts](../system-prompts/index.md).

> **X3:** The prior `system_prompt_path` column (file on disk) is deprecated — still in the schema, ignored by all runtime code. All system prompt content is stored inline in `system_prompt`.

At session start the fabric loads the system prompt from `users.system_prompt`, queries the knowledge layers, and packs the result into TOON. The agent doesn't know about layers; it gets a context pack.

## 3. The Three Categories

Every AI agent belongs to exactly one structural category. Category determines scope, visibility, binding, and provisioning. The enum is closed — `team | strategy | individual` (`AGENT_CATEGORIES`, `packages/shared/src/types.ts:132`); adding a fourth requires a concept-doc update first. Stored in `users.agentCategory` (`packages/db/src/schema.ts:94`); human and system rows carry null.

| Category | Binding | Provisioned by | Editability | Roles in catalog |
|---|---|---|---|---|
| **Team** | Bound to a team (`teamId` non-null) | Default roster per team function | Fully user-controlled | 11 roles: builder, designer, product_manager, qa_engineer, growth, ops, brand_voice, support, sales, content, data_analyst |
| **Strategy** | Factory-wide (`teamId` null) | Strategy at factory setup | System prompt editable; operational config strategy-managed | facilitator, scout, infra, platform |
| **Individual** | Bound to a human user (`teamId` null) | Per-user at registration | Fully user-controlled | assistant |

### 3.1 Team agents

The visible workforce — prominent in the Work view, session activity, and review threads. They do the work that ships. The roster is not fixed: role is an open string, and the roster flexes with the work.

### 3.2 Strategy agents

Knowledge-scoped; users rarely interact with them directly. They curate knowledge, surface cross-domain patterns, and maintain taxonomy health — they facilitate, never build. Facilitators are seeded one per practice community (`build`, `product`, `growth`, `ops`, `facilitation` — `packages/db/src/seed-fixtures.ts`); their duties are detailed in [facilitators](../knowledge-architecture/facilitators.md). Strategy agents are never part of a team roster — they are provisioned at factory setup via the `FactoryRosterSpec` seam and serve all teams.

### 3.3 Individual agents — the Assistant

Each human gets exactly one assistant: a personal operator scoped to that user. It sees what the user can see and does what the user can do — no factory-wide omniscience. Each user's assistant has its own system prompt (GET/PATCH `/api/users/:userId/assistant`), its own pinned thread, and its own session history.

**Lifecycle.** Created at user registration (`packages/server/src/routes/users.ts:140`) or lazily via resolve-or-create (GET `/api/threads/assistant`). The thread starts unpinned, pins after the first real AI response, and stays pinned (`packages/fabric/src/services/assistant-dispatcher.ts`).

**Draft-bet capability (AK4).** The Assistant holds a real back-and-forth with the founder and, when the conversation calls for it, produces a draft bet in the thread as a `BetCard`. The founder reviews, edits in WorkBet, and commits — the Assistant **never commits autonomously**. One living draft per conversation, refined in place via `edit_bet`.

The conversational tool loop runs with a bounded registry of exactly two tools: `create_bet` and `edit_bet` (`packages/server/src/tools/assistant-draft-registry.ts`). No other tools exist in this path — the Assistant cannot create teams, add agents, or submit reviews from the thread. The team for any draft is resolved server-side and hard-injected; `edit_bet` is forced to the current draft; the model cannot redirect either. This is the User Sovereignty line drawn in code.

**Turn lifecycle (AR4a).** The conversational turn (`runAssistantTurn`) delegates to real `provisionSession` in conversational mode — real sandbox, real MCP bridge, all harnesses, with an ephemeral stub task (`conv-stub-task-*`) satisfying the session's task FK (`packages/server/src/services/assistant-turn.ts`). The loop is capped at `MAX_TOOL_ITERATIONS=3` and always persists a reply — never silent, even on cap exhaustion.

### 3.4 Category is not role

Category is structural: scope + visibility. Role is functional: what the agent does within its category. Role is an **open string** (`UserRole = string`); `AGENT_ROLE_CATALOG` (`packages/shared/src/agent-roles.ts`) supplies metadata for known roles (label, category, template flag, team-function mapping). Unknown roles are valid — they get base tools, no template, and default to category `team`.

Category is not a permission system — tool authorization is role-based filtering, never a category check. Category is not a UI grouping either: team agents are prominent in Work, strategy agents are mostly invisible, the assistant surfaces through its overlay. Whether category is immutable after creation is unverified in code (`users.ts` update route).

### 3.5 Team functions and the default roster

A team function is a domain label determining which roles appear in the default roster. Known functions: `development`, `product`, `design`, `marketing`, `sales`, `operations`, `support`, `research` (`TEAM_FUNCTIONS`, `agent-roles.ts:21-30`) — the catalog is open. On team creation the system auto-provisions the union of catalog roles across the team's functions (`defaultRoster()`, `agent-roles.ts:223`). Whether provisioning is idempotent (skips roles that already have an agent) is unverified in code.

### 3.6 Rename lore (AD8)

- **AD8a** — category value `personal` renamed `individual` (migration `0027_AD8a_agent_type_rename.sql`; pre-AD8a DBs may still hold `personal`).
- **AD8b** — role `chief_of_staff` renamed `assistant`.
- **AD8c** — role `practice_facilitator` renamed `facilitator`.

## 4. Lifecycle

Agents are **paused or retired, never deleted**. `status` is `active | paused | retired`; a paused agent's context persists in the DB and the adapter pool skips it for scheduling (`adapter-pool.ts` S4). Reactivated agents read their persisted session notes and pick up where they left off. Pausing is not dismissal.

## 5. One Agent, One Team — Sub-Agents Are Internal

An agent belongs to exactly one team or is factory-wide (category `strategy`). No multi-team membership — `users.teamId` is a single nullable FK (`packages/db/src/schema.ts:47`), and there is no membership join table for agents. This keeps identity clean, context unambiguous, and scheduling simple: every session loads one team's context.

### 5.1 Sub-agents within a session

An agent is one identity, one sandbox, one team — the unit the process layer sees and schedules. But *inside a session* an agent can spawn sub-agents to parallelize or specialize, where the harness supports it (the `subAgents` capability flag — see [harness-capability-descriptor](./harness-capability-descriptor.md)).

The process layer never sees sub-agents. They are internal to the session the way functions are internal to a program: they share the session's sandbox and context, end when the session ends, and their work is part of the parent session's output.

Consequences:

- **Specialist capabilities** (security review, accessibility audit) ship as skills the agent invokes in-session — possibly via sub-agents — not as separate top-level agents the factory manages.
- **The team roster stays small.** A team is 3–6 agents, not 15. Specialization happens inside sessions, not at the org-chart level.
- **Spend rolls up to the agent.** Sessions carry no cost columns (O2); sub-agent spend accumulates with everything else on `users.costActual` / `teamMembers.costActual`. Session cost shape: [the-five-primitives](../process-layer/the-five-primitives.md) §Sessions. Cap grammar: [wip-and-cost-limits](../process-layer/wip-and-cost-limits.md).
- **Artifact cost is a projection.** An artifact's cost is computed strategy-side, never a stored column — see [artifact-primitive](../process-layer/artifact-primitive.md).
