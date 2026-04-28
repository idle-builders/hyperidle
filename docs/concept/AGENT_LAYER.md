# Agent Layer — v1.0

How agents are defined, staffed, and composed. This doc covers agent identity, the two categories of agents (central and product-team), how agents scale with product lifecycle, and how the model-routing and cost model works.

For how agents *work together* (teams, tasks, sessions, handoffs), see `PROCESS_LAYER.md`.
For what agents *know* (five knowledge layers, memory, practices), see `KNOWLEDGE_ARCHITECTURE.md`.
For how agents *meet humans* (the Factory app — Conversations, Work, Knowledge, and the Rail), see `HUMAN_INTERFACE_LAYER.md`.
For where agents *run* (harnesses, workspaces, skills, durability), see `RESEARCH_EXECUTION_LAYER.md`.

> **Vocabulary note (Thread primitive — see HUMAN_INTERFACE_LAYER.md §4.5).** Where this doc uses phrases like "review thread", "chat thread", or "Coach thread", the structural reality is a single Thread primitive — a container attached to exactly one host (bet, task, knowledge item, artifact, agent, user) carrying typed messages (plain / review / questionnaire). Agents and humans participate in the same matrix of threads — an agent initiating a thread to a founder uses the same primitive a founder uses to initiate a thread to an agent. The Coach thread is a *configuration* (host = user, pinned) of that primitive, not a separate concept. Skill-change reviews land as a *review message* on a thread attached to the proposed change; cross-team tasks (`PROCESS_LAYER.md` §8.5) carry a thread attached to the cross-team task itself.

---

## 1. Principles

1. **Agent = soul + context + skills.** Soul is who they are (system prompt). Context is what they know (L0–L4 memory, loaded JIT). Skills are what they can do (packaged scripts calling CLIs/APIs). All three are composable and independently swappable.

2. **Process first, agents second.** Design how work flows, then staff it with agents — not the other way round. An agent exists because a role exists in the process, not because someone wanted to create an agent.

3. **Context is the product.** Agents are disposable. Context survives. The company's real asset is its accumulated context — product knowledge, practice patterns, brand, decisions, customer insights. If every agent is replaced tomorrow, the new ones should be productive within one session because the context is intact.

4. **Hire and fire freely.** Agents spin up and down. A new product hires a team. A sunset dissolves it. A spike in demand temporarily borrows an agent from another team. But agents only leave a team when their work is done (see `PROCESS_LAYER.md` §4.3).

5. **Humans validate, agents execute.** Agents can do everything. But risk-based validation means founders stay in control without being bottlenecks. The trust dial (L1–L4 autonomy per skill) moves gradually, not in a single leap.

---

## 2. Agent Identity

An agent is defined by three files:

```
agents/
  nimmly-builder/
    SOUL.md           # system prompt — who this agent is, its personality, its constraints
    SKILLS.md         # list of skill packages this agent can use (references to skill dirs)
    IDENTITY.md       # metadata: name, role, team, practices, max_concurrent_sessions
```

**SOUL.md** is the system prompt. It defines personality, constraints, and the agent's relationship to its role. A Builder's soul knows it's an engineer who thinks → plans → builds → reviews → tests. A Practice Facilitator's soul knows it surfaces patterns and synthesizes, not decides. Souls are short — ideally under 500 tokens — because they're loaded into every session.

**SKILLS.md** references the skill packages the agent is authorized to use. Each skill is a directory with a SKILL.md instruction file, bundled scripts, and resources. Skills call CLIs and APIs directly — no protocol layer. Skill changes require human approval via a review thread.

**IDENTITY.md** carries metadata: which team the agent is on (or teams, if it's on more than one), which practices it belongs to, its role, and operational limits (max concurrent sessions, autonomy levels per skill).

When the Knowledge Fabric builds an L0 session context for this agent, it loads the soul, queries the knowledge layers for the relevant context, and packs it into TOON format. The agent doesn't "know" about layers; it just gets a context pack.

---

## 3. The Two Categories

### 3.1 Central Agents (Factory-Wide)

These agents serve all products. They're the shared infrastructure and coordination layer.

| Agent | Role | Key responsibility |
|-------|------|--------------------|
| **Chief of Staff** | COO brain. L4 facilitator. | Routes work, compiles portfolio-level retros, manages the Coach thread with founders, proposes changes to PRINCIPLES.md and FOCUS.md. Owns cross-product routines (portfolio cost sentinel, monthly retros). |
| **Practice Facilitators** (one per community of practice) | L3 facilitators. | Run practice "meetings," synthesize findings into knowledge, curate the practice tree, score items for human attention. Communities: building, product, growth, ops, facilitation. |
| **Infra Agent** | SRE. | Maintains shared infrastructure — servers, networking, monitoring, backups. Serves all products. |
| **Platform Agent** | DX engineer. | Maintains shared tools, templates, CI/CD, design system. Makes product teams more productive. |
| **Scout** | Analyst. | Finds and evaluates market opportunities. Produces structured idea briefs for the Work view. |

Practice Facilitators are special: they're central agents (one per community, serving all products) but they participate in every product team that has members in their community. The Build Practice Facilitator is connected to every Builder across all teams. This is how knowledge flows across products without explicit cross-team coordination.

### 3.2 Product Team Agents

Each product has a persistent team (see `PROCESS_LAYER.md` §4). The team's agents are:

| Agent | Role | Key responsibility |
|-------|------|--------------------|
| **Product Manager** | Team lead. L2 facilitator. | Shapes pitches, coordinates cycles, decomposes bets (integrating the team's proposed tasks), resolves handoffs, unblocks the team, drafts retros. |
| **Builder** (one or more) | Engineer. | Implements features, writes code, tests, deploys. May specialize (frontend, backend, full-stack). |
| **Growth Agent** | Marketer. | Landing pages, content, email, SEO, community, analytics. Distributes and measures. |
| **Ops Agent** | SRE + support. | Deploys, monitors, handles support, incident response. |

The roster is not fixed. It flexes with the product's lifecycle phase. Specialist capabilities (security review, brand-voice check, accessibility audit) are skills invoked within sessions — possibly via sub-agents — not separate top-level agents on the team.

---

## 4. Lifecycle Scaling

Teams scale up and down as the product moves through its lifecycle. Agents are paused (context persists, no active sessions) or reactivated, never deleted while the product is alive.

| Phase | Typical active agents | Why |
|-------|----------------------|-----|
| Discover | Scout (central) | Just evaluating the idea — no product team yet. |
| Define | Product Manager | Shaping the spec, no code yet. |
| Build | Product Manager + Builder(s) + Growth (for landing page) | Active development. |
| Ship | Full team: Product Manager + Builder(s) + Growth + Ops | Launch requires everyone. |
| Grow | Growth + Ops + Product Manager (light touch) | Builder paused unless features needed. |
| Maintain | Ops (+ Builder on-call) | Minimal. Recurring routines keep things ticking. |
| Sunset | Ops + Growth (for comms), then team dissolves | Graceful shutdown. Knowledge archived to Practice layer. |

Pausing is not dismissal. A paused Builder's context (L2 product memory, L3 practice knowledge) persists. When reactivated for a feature sprint, it reads its last session notes and picks up where it left off.

---

## 5. One Agent, One Team — Sub-Agents Are Internal

An agent belongs to exactly one team (or is central). No multi-team membership. This keeps identity clean, context unambiguous, and scheduling simple: every session loads one product's L2, one team's context, no ambiguity.

When a product team needs expertise it doesn't have on roster, the answer is **cross-team tasks** (see `PROCESS_LAYER.md` §8.5) — a chat thread to the providing team, a task on the requesting bet, the providing agent does the work. Not multi-team membership.

### 5.1 Sub-agents within a session

An "agent" in the factory's sense is one identity, one workspace, one team — the unit the meta layer sees and schedules. But *inside a session*, an agent can spawn sub-agents to parallelize or specialize work. A Builder might spin up a security review sub-agent, a test-writing sub-agent, and a code-review sub-agent within a single session, using Claude SDK subagents or equivalent harness-level primitives.

The meta layer does not see sub-agents. They are internal to the session, the way functions are internal to a program. Sub-agents share the session's workspace, the session's cost budget, and the session's context. When the session ends, sub-agents end. Their work is part of the parent session's output.

This means:
- **Specialist capabilities** (security review, accessibility audit, brand-voice check) are packaged as skills that the agent invokes, possibly via sub-agents — not as separate top-level agents the factory manages.
- **The team roster stays small.** A product team is 3–6 agents, not 15. Specialization happens inside sessions, not at the org chart level.
- **Cost tracking is per session.** Sub-agent token spend rolls up into the parent session's cost. The factory doesn't need a separate cost line per sub-agent.

---

## 6. Model Routing and Cost

Agents don't pick their own model. The meta layer assigns models based on the task's requirements, the agent's role, and the factory's current cost posture.

### 6.1 Model tiers

| Tier | When to use | Examples (as of April 2026) |
|------|------------|-----------------------------|
| **Reasoning** | Complex analysis, code generation, product decisions, skill execution for high-risk tasks | Claude Opus, o3, Gemini Ultra |
| **Workhorse** | Standard task execution, content creation, routine code, most sessions | Claude Sonnet, GPT-4o, Gemini Pro |
| **Fast** | Formatting, classification, bulk processing, context compaction, summarization, sleep-time routine runs | Claude Haiku, Gemini Flash, Cerebras, local models (Ollama) |

### 6.2 Routing logic

The Scheduler (see `ARCHITECTURE.md` §2.3) picks the model tier when starting a session:

- **Risk tier high** → Reasoning tier.
- **Risk tier medium** → Workhorse tier.
- **Risk tier low** → Workhorse tier (default), Fast tier if the skill declares it.
- **Sleep-time routines** → Fast tier (they're memory-only, no artifact production).
- **Context compaction / session note writing** → Fast tier.
- **Facilitator synthesis** → Workhorse or Reasoning, depending on scope (portfolio-level retros → Reasoning; weekly practice meeting → Workhorse).

### 6.3 Cost posture

The factory has a daily cost ceiling (see `PROCESS_LAYER.md` §10.3). When cost burn approaches the ceiling:

1. New sessions that would use Reasoning tier are downgraded to Workhorse.
2. Low-priority routines are deferred.
3. If the ceiling is breached, non-essential work pauses and a review thread fires to the founder.

The model tier is a suggestion, not a hard contract — the deployer configures which actual model each tier maps to. A solo builder on a laptop might map all three tiers to Claude Sonnet. A funded team might map Reasoning to Claude Opus and Fast to a local Llama model. The meta layer doesn't care which model it is; it cares about the tier.

---

## 7. Founder Responsibility Routing

The Chief of Staff knows which founder to route items to based on the domain:

| Domain | Routes to |
|--------|-----------|
| Market & opportunity, business model, pricing, growth strategy, customer relationships, partnerships, portfolio health (keep/kill) | CEO |
| Product vision & spec, UX & design quality, technical architecture, content quality, build prioritization, launch readiness | CPO |
| Strategic decisions (new product, major pivot, sunset) | Both founders |

This routing is soft — founders can override by replying in each other's threads — but it's the default for the Chief of Staff and the facilitators when they produce items for the Factory Inbox.

---

## 8. What This Document Does Not Cover

- **How agents coordinate on work** (teams, bets, tasks, sessions, handoffs, decomposition) → `PROCESS_LAYER.md`
- **What agents know and how knowledge flows** (five layers, practices, promotion, curation) → `KNOWLEDGE_ARCHITECTURE.md`
- **How agents meet humans** (the Factory app — Conversations, Work, Knowledge, and the Rail) → `HUMAN_INTERFACE_LAYER.md`
- **Where agents run** (harnesses, workspaces, skills format, durability, MCP critique) → `RESEARCH_EXECUTION_LAYER.md`

This doc defines *who agents are*. The others define *what they do, what they know, how they work together, and where they live*.
