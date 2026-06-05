# X8 Concept: Eval Scenario Library

## What this workpackage is

X8 builds the eval scenario library — the "sheet music" for the X7 eval instrument. When a scenario scores low, we don't fix the scenario. We fix the feature: better tool descriptions, better soul prompts, better knowledge injection, better harness logic. The eval library is HyperIdle's tuning instrument for agent-facing quality.

## Core concept: Interactions

An **interaction** is a unit of contact between an agent and HyperIdle. If this were a human using the system, an interaction would be one thing they do: call a tool, read their workspace, receive a prompt, get authorized or denied. Each interaction is an independently tunable surface — we can change its parameters (tool description, Zod schema, handler logic, prompt section, materialization strategy) and measure the effect on agent quality.

HyperIdle has **24 interactions**:

### Tools (15 interactions)

Each tool the agent calls is one interaction. The tool's description, schema, handler logic, and error messages all affect how well agents use it.

| # | Interaction | What the agent does |
|---|-------------|---------------------|
| 1 | `write_memory` | Capture knowledge (layer, kind, scope, format) |
| 2 | `query_practice` | Search existing knowledge (FTS, layer filter) |
| 3 | `write_session_notes` | Document work (file + DB dual write, append mode) |
| 4 | `create_artifact` | Record a deliverable (12 kinds, preview validation) |
| 5 | `create_item` | Surface something for human attention (10 kinds, routing, thread management) |
| 6 | `create_task` | Break work into subtasks (proposed state, betId derivation) |
| 7 | `log_task` | Record progress on a task (append-only prose) |
| 8 | `read_inbox` | Check messages (participant filtering, newest first) |
| 9 | `send_message` | Message another agent (thread reuse/creation) |
| 10 | `submit_review` | Post a review on a bet (bet thread, 2 message types) |
| 11 | `handoff_to` | Transfer work (3 target types, atomic transaction, ends session) |
| 12 | `route_item` | Route item to correct view (facilitator-only, partial updates) |
| 13 | `score_attention` | Set attention priority (facilitator-only, 2 modes) |
| 14 | `promote_knowledge` | Advance knowledge lifecycle (facilitator-only, 8-state machine, conflict gate) |
| 15 | `create_conflict_review` | Flag conflicting knowledge (facilitator-only, version guard, dedup) |

### Session and environment interactions (4 interactions)

These are systemic — the agent doesn't call them, but they shape every session.

| # | Interaction | What the agent experiences |
|---|-------------|---------------------------|
| 16 | Session | The full lifecycle: start, work, end. Cost caps, adapter selection, workspace creation, teardown. 11 phases, each tunable. |
| 17 | Materialized knowledge | Files appear in the workspace before the session starts. 4 scopes (L2/L3/L4/factory), ranking, budgeting, read-only context zone. Does the agent find and use them? |
| 18 | Composed prompt | The agent's identity and instructions: soul prompt + task context + tool descriptions + workspace orientation. Template variable substitution, token budget truncation. Does the agent understand who it is? |
| 19 | Tool authorization | What the agent can and can't do. 4 facilitator-only tools filtered at provisioning. Layer enforcement inside write_memory. Does the agent adapt when tools are absent? |

### Knowledge and routine workflow interactions (5 interactions)

These are compound workflows where the system and agents interact through mechanisms beyond tool calls.

| # | Interaction | What happens |
|---|-------------|--------------|
| 20 | Knowledge writeback | Agent writes/edits files in the `knowledge/` workspace zone. The file watcher detects changes, debounces, and syncs them back to the DB as knowledge items. No tool call — the agent writes a file and the system responds. Tunable: watcher debounce timing, writeback logic, what gets synced vs ignored. |
| 21 | Built-in routines | 5 system routines that execute without creating sessions: cost sentinel (heartbeat, 15min), practice meeting (weekly), post-bet retro (event-triggered on bet completion), portfolio retro (monthly), knowledge decay (daily). Each writes directly to DB — creating items, threads, knowledge items. Tunable: trigger configs, thresholds, output quality. These are the CoS and PF's primary recurring work. |
| 22 | Routine sessions | Lightweight sessions created by the routine scheduler — no workspace, no knowledge materialization, no file watcher. Used for the sleep-time pattern (Letta-inspired): agent stays current on context by running periodic background sessions that update its memory without producing review items. Tunable: what context the agent sees without a workspace, how it updates memory. |
| 23 | Skill autonomy | Agents earn autonomy levels (L1-L4) per skill through successful routine execution. At L1, every routine run produces a review item for human approval. At L4, the routine runs silently. The autonomy system gates how much human oversight an agent needs. Tunable: promotion thresholds, success/failure counting, the review item quality at each level. |
| 24 | Delegation | When a routine owner is at their WIP limit (maxConcurrentSessions), the system can delegate execution to a teammate with the same skill (if delegationAllowed=true). The delegate executes but the owner retains memory ownership. Tunable: delegation eligibility, teammate selection, context transfer quality. |

## Per-interaction eval diversity

**Evals always run scoped to one interaction** (`npm run eval --feature write_memory`). This means each interaction's scenario set must be self-sufficient — it must produce stable, non-flaky results on its own. A developer changes a tool description and runs that tool's evals to see the effect.

This has a critical implication for how many scenarios each interaction needs:

### The diversity question

For each interaction, the designer must ask: **"Can this interaction happen differently given the role or the domain?"**

- If **yes** — the interaction needs coverage across the roles and domains that create genuinely different judgment patterns. Not blunt coverage (every role x every domain), but coverage driven by what creates diversity in the eval set. A PM creating tasks for a healthcare compliance bet exercises different judgment than a PM creating tasks for a marketing campaign — that's real diversity. A PM creating tasks in "software A" vs "software B" may not be — that's padding.

- If **no** — the interaction is genuinely universal (same judgment regardless of role/domain). A small set of 3-5 scenarios with different angles is sufficient for statistical stability.

### What creates real diversity

Diversity in an eval set comes from scenarios that exercise genuinely different judgment patterns. Sources of real diversity:

1. **Role differences** — a builder and a PM use `create_task` differently. The builder decomposes their own technical work; the PM decomposes a bet across a team. Different judgment, same tool.

2. **Domain differences** — a PM decomposing a healthcare compliance bet faces regulatory constraints that a PM decomposing a marketing campaign doesn't. The "good" answer looks genuinely different.

3. **Parameter variants** — `write_memory` with layer L3 (practice knowledge, facilitator-only) exercises different authorization logic than L1 (team knowledge, anyone). Different code path, not just different label.

4. **Situational context** — `handoff_to` when work is completed vs when the agent is genuinely blocked. Different status values, different context quality expectations.

5. **Soul prompt diversity within roles** — a builder with a DevOps soul prompt and a builder with a frontend soul prompt exercise different judgment when choosing artifact kinds or writing knowledge items.

### What does NOT create real diversity

- Same test with a different domain label when the domain doesn't change the judgment
- Same role doing the same thing but in a "consulting" context vs "software" context when both produce identical tool calls
- Adding scenarios just to hit a coverage number

### Implications for scenario counts

More common agents (builders are the majority of real-world usage) need proportionally more scenarios because they use more interactions in more varied contexts. Facilitator-only interactions (route_item, promote_knowledge, etc.) have a smaller user base but high complexity — they need depth on the parameter space, not breadth on roles.

The total scenario count is NOT a target. It's an output. The designer works through each interaction, identifies the diversity that matters, and defines exactly the scenarios needed. If that's 150 scenarios total, then it's 150. If it's 80, then it's 80. The number emerges from the analysis.

## Interaction complexity

Each interaction has a different depth of variability — different numbers of parameters, code paths, authorization gates, and quality dimensions. This complexity, combined with the diversity analysis, determines how many eval scenarios we need.

### HIGH complexity

These interactions have many parameters, multiple code paths, role-dependent behavior, or compound effects. They need thorough scenario coverage from multiple angles — both parameter depth and role/domain diversity.

- **Session** — 11 phases, cost cap enforcement (agent/team/factory levels), adapter selection, workspace lifecycle, MCP bridge, event stream handling, token accumulation. Changes here affect every agent session.
- **Materialized knowledge** — 4 scope levels, relevance ranking, token budgeting, read-only enforcement, manifest generation. This is the primary way agents receive context.
- **Built-in routines** — 5 distinct routines with different trigger types, output patterns, and ownership. The CoS and PF's primary recurring work.
- **handoff_to** — 3 target types (agent/role/human), atomic transaction across 4 tables, ends the session.
- **create_item** — 10 kinds, 6 verbs, thread auto-creation, automatic routing to views, risk tier assessment.
- **submit_review** — 2 distinct message paths (full review vs plain fallback), bet thread management.
- **promote_knowledge** — 8-state machine with allowed transitions, conflict gate, race protection.
- **score_attention** — 2 modes (override vs recompute), encoding asymmetry, items table no-op.
- **Composed prompt** — Persona truncation, template variable substitution, tool descriptions. Affects every session's agent identity.

### MEDIUM complexity

Meaningful variants and parameters but fewer code paths. Need several scenarios from different angles to establish quality signal.

- **write_memory** — Layer enforcement (L0-L2 vs L3-L4), scope derivation, 8 knowledge kinds, format choice.
- **Routine sessions** — Lightweight sessions for sleep-time pattern. Different from full sessions.
- **Skill autonomy** — L1-L4 progression, review item gating, promotion mechanics.
- **Tool authorization** — 4 restricted tools, dual-gate enforcement, silent filtering.
- **Knowledge writeback** — File watcher debounce, sync logic, what gets persisted.
- **create_task** — betId derivation from parent, proposed state, no cross-bet injection.
- **create_artifact** — 12 artifact kinds, optional preview, kind/preview match validation.
- **read_inbox** — Participant filtering via JSON parse, overscan pattern, limit parameter.
- **send_message** — Direct thread reuse/creation, optional subject handling.
- **route_item** — Partial updates, view computation from riskTier/kind/verb.
- **create_conflict_review** — Version guard, dedup guard, proposer identity enforcement.
- **Delegation** — Teammate selection, context transfer, owner memory preservation.

### LOW complexity

Simple interactions with few parameters and straightforward behavior. A small number of well-chosen scenarios is sufficient for statistical stability.

- **query_practice** — FTS search with layer filter and limit. Read-only, no authorization.
- **write_session_notes** — Append vs overwrite, dual persistence (file + DB). Universal, simple.
- **log_task** — Append-only prose with timestamp prefix. Minimal variants.

## Roles (AB0 role model)

AB0 restructured the agent role system from 6 hard-coded roles to 16 catalog roles across 3 structural categories. Roles are now **open strings** — any non-empty string is a valid role. The catalog provides metadata for known roles, but custom roles are allowed.

### Three agent categories

| Category | Binding | Example roles | Provisioning |
|----------|---------|---------------|-------------|
| **Team** | Bound to a team via `teamId` | builder, designer, pm, qa, growth, brand_voice, ops, support, sales, content, data_analyst | Auto-provisioned per team based on team functions |
| **Strategy** | Factory-wide, no team binding | practice_facilitator, scout, infra, platform | Provisioned once at factory setup |
| **Personal** | Per-user, no team binding | chief_of_staff | Provisioned per founder |

### 16 catalog roles

**Team agents (11 roles):**

| Role | Community | Team functions | Soul prompt |
|------|-----------|----------------|-------------|
| `builder` | building | development | Yes |
| `designer` | product | design | Yes |
| `product_manager` | product | product | Yes |
| `qa_engineer` | building | development | Yes |
| `growth` | growth | marketing | Yes |
| `brand_voice` | growth | marketing | No template |
| `ops` | ops | operations | Yes |
| `support` | ops | support | No template |
| `sales` | growth | sales | No template |
| `content` | growth | marketing | No template |
| `data_analyst` | product | research | No template |

**Strategy agents (4 roles):**

| Role | Community | Description |
|------|-----------|-------------|
| `practice_facilitator` | ops | L3 facilitator per community |
| `scout` | product | Market analyst |
| `infra` | ops | SRE / infrastructure |
| `platform` | building | DX engineer / CI/CD |

**Personal agents (1 role):**

| Role | Community | Description |
|------|-----------|-------------|
| `chief_of_staff` | ops | L4 facilitator, factory-wide |

### Tool authorization

Tool authorization is community-based. The community is derived from the role via `communityForRole(role)`. Facilitator-only tools (route_item, score_attention, promote_knowledge, create_conflict_review) are restricted to facilitator communities. The authorization model didn't change in AB0 — only the role-to-community mapping now goes through the catalog instead of a static record.

### Eval implications

- All 16 catalog roles should be exercised where they create genuinely different judgment patterns
- The `agentCategory` field must be set correctly in seeding (team agents need `teamId`, strategy/personal don't)
- Team `functions` field determines default roster — eval scenarios should seed teams with appropriate functions
- New roles with soul prompts (designer, qa_engineer, ops) offer fresh evaluation surfaces
- Roles without soul prompt templates (brand_voice, support, sales, content, data_analyst) test whether agents function without persona guidance
- Custom/unknown roles get base tools and no template — worth testing as an edge case

## Domains

Domains are the realistic contexts in which agents work. Different domains exercise different judgment patterns — a PM decomposing a healthcare compliance bet should create different tasks than a PM decomposing a marketing campaign.

Domains don't change code paths — tools work identically regardless of domain. But domains change what "good judgment" looks like, which is exactly what evals measure. The right number of domains per interaction emerges from the diversity analysis: how many domains are needed to detect whether a change helps broadly or only in one context?

## Scenario design principles

1. **Scenarios test agent decisions within HyperIdle, not generic LLM capability.** "Did it use create_task correctly given its role and context" is an eval question. "Can it write Python" is not.

2. **Each scenario tests one interaction from one angle.** A scenario for write_memory tests knowledge capture, not also messaging and task creation. The agent may use multiple tools in a session, but the rubric judges the primary interaction.

3. **Scenarios vary by role, domain, and parameter combination — where that variation creates real diversity.** For write_memory: one scenario tests layer enforcement (growth denied L3), another tests kind selection (builder choosing "decision" vs "reflection"), another tests scope derivation (factory vs team). Each exercises a different tunable surface that would produce different results if the interaction parameters were changed.

4. **Scenario count per interaction is determined by domain analysis, not formula.** The designer works through each interaction, identifies the diversity that matters, and defines exactly the scenarios needed. The count is an output of the analysis, not an input.

5. **Every scenario must be diagnosable.** When a score is low, the report says which rubric dimension failed, what the agent actually did, and what was expected. This is what makes the eval a tuning instrument.

6. **Evals run scoped to an interaction, not as full suite.** `npm run eval --feature write_memory` runs just the write_memory scenarios. This is the primary usage. Each interaction's scenario set must be self-sufficient for stable results.

7. **Nothing is mocked.** Real LLM calls, real DB, real provisioning. If it's mocked, it's a test, not an eval.

8. **Per-interaction sufficiency.** Each interaction needs enough scenarios that a real quality change is distinguishable from LLM non-determinism noise. If you run `--feature create_task` and get 2 scenarios, that's not enough — one flaky result and you can't tell if your change helped. The minimum for statistical stability depends on the interaction's complexity, but the designer must justify that each set is sufficient.

## What the architecture must produce

For each of the 24 interactions, the architecture pass must:

1. **Analyze the diversity question**: can this interaction happen differently given the role or domain? Which roles and domains create genuinely different judgment patterns for this specific interaction?
2. **Identify every parameter combination, role variant, and quality dimension** that needs eval coverage
3. **Define the specific scenarios needed**, with id, role, domain, seed data, task prompt, and rubric
4. **Justify each scenario** — what tunable surface does it exercise that no other scenario covers? What would we miss if we removed it?
5. **Justify the scenario count** — why is this number sufficient for stable signal? Why isn't it fewer?
6. The reviewer will challenge whether the coverage is sufficient to detect quality changes when interaction parameters are modified

## Framework changes needed

- Add `feature` field to `EvalScenario` (maps to interaction name)
- Add `--feature` CLI flag for scoped runs
- Add per-feature breakdown to `EvalReport`
- Extend seeding library as needed (seedThread, seedMultiAgentWorld, seedItem, seedRoutine, seedUserSkill)
- Extract reusable judge factories to reduce per-scenario boilerplate
