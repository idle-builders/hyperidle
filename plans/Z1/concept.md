# Z1 Concept Pass -- Primitive Inventory and Canonical Vocabulary

## Purpose

This document identifies every primitive the product story must explain, verifies terminology against the canonical docs, surfaces terminology conflicts between docs, and recommends a narrative structure for introducing concepts to first-time readers.

The audience for Z1 is developers and founders evaluating HyperIdle for the first time. They need to understand what HyperIdle is, why it exists, and how it differs from alternatives -- in under 5 minutes per document, under 2000 words each.

---

## 1. Primitive Inventory

Every primitive below must appear in the product story with a concrete example (per AC3). The canonical definition is the single sentence the product docs should use; the source citation is where the architecture docs define it.

### 1.1 The Three Layers (architectural frame)

The product story must introduce the three-layer model early because every other concept lives inside it.

| Primitive | Canonical Definition | Source |
|---|---|---|
| **Human Interface** | The single desktop app ("the Factory") where founders review, plan, and curate -- three views plus a sidebar. | `docs/architecture/system-overview.md`, `docs/human-interface-layer/one-app-two-form-factors.md` |
| **Meta Layer** | The organizational kernel that manages who works on what, what they know, how they coordinate, and how humans stay in the loop -- without calling models or executing tools. | `docs/architecture/system-overview.md` |
| **Agent Runtime** | The adapter boundary where agent harnesses (Claude SDK, etc.) actually run sessions -- HyperIdle manages the orchestration, the runtime does the execution. | `docs/architecture/system-overview.md` |
| **Kernel / Strategy split** | The Meta Layer splits into Kernel (stable protocols: routing, persistence, events) and Fabric (volatile heuristics: scoring, propagation, notifications); the kernel never imports from fabric. | `docs/architecture/system-overview.md` |

### 1.2 The Five Process Primitives

These are the structural backbone. The product story must present them as a complete set.

| Primitive | Canonical Definition | Source |
|---|---|---|
| **Team** | A small, persistent group of agents bound to a product (not a bet) that accumulates muscle memory across successive bets. | `docs/process-layer/teams-persistent-product-bound.md` |
| **Bet** | A shaped, committed, time-boxed unit of work owned by a team, with an explicit done condition and a money appetite (never a duration cap). | `docs/process-layer/bets-shape-commit-change-ship.md` |
| **Task** | A unit of work picked up by an agent, with state, owner, dependencies, done condition, cost cap, and artifact references. Tasks are the unique producers of artifacts. | `docs/process-layer/the-five-primitives.md` |
| **Session** | A single agent's bounded run on a task -- the natural unit of resumability. A session ends when the context window is about to compact. | `docs/process-layer/tasks-and-sessions.md` |
| **Routine** | A recurring trigger attached to a named agent with persistent state across runs -- calendar-shaped, event-shaped, or heartbeat-shaped. | `docs/process-layer/recurring-routines.md` |

Concepts that are NOT primitives and must NOT be introduced as such: Workflow, Plan, Crew, Squad, Job, Run. The docs explicitly reject these as collapsed into the five primitives.

### 1.3 The Three Cross-Domain Primitives

These bridge the three views (Conversations, Work, Knowledge).

| Primitive | Canonical Definition | Source |
|---|---|---|
| **Thread** | An append-only, chronologically-ordered container of typed messages, attached to exactly one host entity. Threads have no shape of their own -- differences between "review", "chat", "coach" live on the messages and on the thread's configuration. | `docs/human-interface-layer/thread-primitive.md`, HIL `4.5` |
| **Block** | A derived structural unit of a markdown body -- addressable, stable-id, runtime-only. Blocks are never stored; the on-disk format stays GitHub-flavored markdown. | HIL `4.6` |
| **Artifact** | A function-agnostic, task-rooted, persistent record of something the team has produced. Artifacts root on tasks; higher-level surfaces aggregate, never own. | `docs/process-layer/artifact-primitive.md`, HIL `4.7` |

### 1.4 Knowledge Architecture

| Concept | Canonical Definition | Source |
|---|---|---|
| **Knowledge Fabric** | The sync layer between one canonical store (`knowledge_items` table) and two client types (humans via web UI, agents via file workspaces). One store, two projections. | `docs/knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md` |
| **The Five Knowledge Layers (L0-L4)** | L0 Session (ephemeral working set), L1 Task (structured per-task data), L2 Product (product-level docs + state), L3 Practice (cross-product learning), L4 Factory (company principles and focus). Lower layers are more agent-native; higher layers are more human-native. | `docs/knowledge-architecture/the-five-layers.md` |
| **Canonical Store** | The single `knowledge_items` table in SQLite where all knowledge lives. Split into kernel (structural identity, content, scope) and strategy extension (layer, attention_score, confidence). | `docs/knowledge-architecture/the-canonical-store.md` |
| **TOON** | A compact serialization format giving approximately 40% fewer tokens than JSON for structured data. Used in L0 session packs and L3 practice packs for agent consumption. | `docs/knowledge-architecture/the-five-layers.md` |
| **Materialization** | The process of projecting a relevant slice of the canonical store into files in an agent's workspace at session start. Load what you need, nothing more. | `docs/knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md` |
| **Knowledge Item Status** | The lifecycle: CAPTURED, PROVISIONAL, NEEDS_HUMAN, VALIDATED, ACTIVE, STALE, ARCHIVED. Most items never need a human. | `docs/knowledge-architecture/the-facilitators-the-most-undervalued-role-in-the-factory.md` |
| **Attention Score** | A continuous score per knowledge item computed from novelty, impact, conflict, repetition, confidence, taste sensitivity, recency of review, and usage frequency. When it crosses a threshold, the item enters a human's queue. | Same source |

### 1.5 Agent Architecture

| Concept | Canonical Definition | Source |
|---|---|---|
| **Agent Identity** | Agent = soul (system prompt) + context (L0-L4 memory, loaded JIT) + skills (packaged scripts). All three are composable and independently swappable. | `docs/agent-layer/principles.md` |
| **Soul Prompt** | Short system prompt (under 500 tokens) defining the agent's personality, constraints, and relationship to its role, stored in the `users` table. | `docs/agent-layer/agent-identity.md` |
| **Central Agents** | Factory-wide agents: Chief of Staff (COO brain), Practice Facilitators (one per community), Infra Agent, Platform Agent, Scout. | `docs/agent-layer/the-two-categories.md` |
| **Product Team Agents** | Per-product agents: Product Manager (team lead), Builder(s), Growth Agent, Ops Agent. Roster flexes with product lifecycle phase. | Same source |
| **Facilitator** | A dedicated agent per knowledge layer whose job is to organize knowledge, score what needs human attention, and collect exactly the feedback that converts information into knowledge. Three levels: Chief of Staff (L4), Practice Facilitator (L3), Product Manager (L2). | `docs/knowledge-architecture/the-facilitators-the-most-undervalued-role-in-the-factory.md` |
| **Practice / Community of Practice** | Cross-product learning community for a discipline (building, product, growth, ops, facilitation). All agents of the same role share the same practice. Knowledge from one product is available to all. | `docs/knowledge-architecture/the-five-layers.md` |
| **One Agent, One Team** | An agent belongs to exactly one team (or is central). No multi-team membership. Sub-agents within a session are internal and invisible to the meta layer. | `docs/agent-layer/one-agent-one-team-sub-agents-are-internal.md` |
| **Model Tiers** | Reasoning (complex), Workhorse (standard), Fast (formatting, sleep-time). Closed vocabulary. The deployer maps tiers to actual models. | `docs/agent-layer/model-routing-and-cost.md` |
| **Lifecycle Scaling** | Teams scale agents up/down as the product moves through Discover, Define, Build, Ship, Grow, Maintain, Sunset. Pausing preserves context. | `docs/agent-layer/lifecycle-scaling.md` |

### 1.6 Human Interface

| Concept | Canonical Definition | Source |
|---|---|---|
| **The Factory** | The single desktop app (macOS, Electron) that is the entire human interface. One window, four zones: IconRail, Submenu, Main Pane, Rail. | `docs/human-interface-layer/one-app-two-form-factors.md` |
| **Conversations View** | The Slack of the factory -- messaging and reviews, all as threads. Where most interaction happens. Agents and humans are equal participants. | HIL `4.1` |
| **Work View** | The Linear of the factory -- bets and tasks. Planning (Canvas with shaped/committed pitches) and tracking (task list per bet). Five-level drill-down: Portfolio, Product, Bet, Task, Session. | HIL `4.3` |
| **Knowledge View** | The company wiki -- a catalogue of knowledge items organized by practice and product. Three scopes: Practice, Product, Factory. The critical async curation surface. | HIL `4.4` |
| **The Rail** | Right sidebar, always present. Factory vital signs: active bets, blocked agents, cost burn, knowledge additions, system health, unread count. Ambient, not interruptive. | HIL `4.2` |
| **Verdict Actions** | The closed set of 10 interaction actions. Five are binding verdicts (approve, approve-with-comments, request-changes, edit, reject). Three are review actions (comment, inline-comment, reply). Two are sidecar operations (snooze, escalate). | `docs/human-interface-layer/verdict-actions.md` |
| **ArtifactView Shapes** | Five renderers for review-message embeds: text_diff, content_preview, visual_comparison, action_summary, data_metrics. | HIL `4.1` |

### 1.7 Coordination and Cost

| Concept | Canonical Definition | Source |
|---|---|---|
| **Handoff** | The coordination primitive. An agent decides at runtime to transfer work to another agent (or human) via a structured message with context, artifacts, remaining work, and status. Not a workflow -- decided at runtime by the agent closest to the work. | `docs/process-layer/handoff-the-coordination-primitive.md` |
| **Decentralized Decomposition** | Each team member decomposes the part of the bet in their work stream, using practice knowledge (L3). The Product Manager integrates, not dictates. No central planner. | `docs/process-layer/decomposition-practice-grounded-decentralized.md` |
| **Money Appetite** | Budget axis for bets and tasks: money cap in a specific currency (integer minor units, precision-safe). Never a duration cap. | `docs/process-layer/wip-and-cost-limits.md` |
| **WIP Limits** | Three nested levels: agent (max concurrent sessions + money cap), team (max parallel tasks + team money cap), factory (aggregate + factory money cap). When a cap is reached, work stops and a review thread fires. | Same source |
| **Autonomy Levels (L1-L4)** | Per-agent-per-skill trust dial. L1 = every action approved. L4 = autonomous unless blocked. Moves up over time as success rate justifies it. | `docs/human-interface-layer/trust-building-slow-cumulative.md` |

### 1.8 Builder Ethos (the "why")

| Principle | Canonical Definition | Source |
|---|---|---|
| **Boil the Lake** | When the cost of thoroughness drops to near-zero (because AI does it), do everything thoroughly. A "lake" is bounded by the task; an "ocean" is scope creep. | `ETHOS.md` |
| **Search Before Building** | Prize first principles above tried-and-true patterns and new-and-popular conventions. Check existing codebase, ecosystem, then reason from constraints. | `ETHOS.md` |
| **User Sovereignty** | AI recommends, humans decide. The system's value comes from human judgment applied at the right moments, not from autonomous execution. | `ETHOS.md` |

---

## 2. Canonical Vocabulary

Terms the product docs must use consistently. This is the glossary the writing must enforce.

### Use these terms

| Term | Meaning | Do NOT use instead |
|---|---|---|
| Team | Persistent product-bound agent group | Crew, Squad, Group, Department |
| Bet | Shaped, committed, time-boxed work unit | Sprint, Epic, Project, Task (at this level), Story |
| Task | Agent-level work unit | Ticket, Issue, Job, Item (at this level) |
| Session | One bounded agent run on a task | Run, Execution, Job run |
| Routine | Recurring trigger with persistent state | Cron job, Scheduled task, Job (as a primitive) |
| Thread | Container for messages, attached to one host | Conversation (as a primitive), Chat (as a primitive), Dialog |
| Message | Typed element inside a thread | Post, Comment, Entry |
| Block | Derived structural unit of a markdown body | Section, Chunk, Notion block |
| Artifact | Task-rooted persistent record of team output | Output, File, Deliverable, Result, Asset, Document |
| Knowledge Item | A row in `knowledge_items` -- the atomic unit of knowledge | Doc, Page, Note, Card, Entry |
| Facilitator | Agent whose job is to organize, score, and route knowledge | Manager (except Product Manager), Orchestrator, Supervisor |
| Product Manager | Team lead agent for a product | Project Manager, Scrum Master, Team Manager |
| Chief of Staff | Factory-level facilitator (COO brain) | CEO agent, Manager, Coordinator |
| Practice | Cross-product learning community for a discipline | Guild (acceptable in conversation but not canonical), Community (too generic) |
| Practice Facilitator | Agent that curates a practice community | Guild Lead (acceptable informally), Practice Manager |
| Soul Prompt | Agent personality/constraints system prompt | Persona, Character, Role prompt |
| Pitch | Shaped description of what a bet could be (before commitment) | Spec, Brief (at this level), Proposal |
| Done Condition | Explicit statement of what "done" means for a bet or task | Definition of Done (DoD), Acceptance Criteria (at this level) |
| Appetite | Money cap (and optional token cap) for a bet | Budget (acceptable informally but Appetite is canonical), Timebox, Estimate |
| Verdict | One of 5 binding responses to a review message | Decision (overloaded), Action (overloaded), Approval |
| Review Action | One of 5 non-binding responses to a review message | (see Verdict Actions section) |
| The Factory | The single desktop app | The App, Dashboard, Console, HQ |
| The Rail | Right sidebar showing vital signs | Dashboard, HUD (acceptable informally), Status Bar |
| Canvas | The planning surface in Work view for shaped/committed bets | Board, Backlog, Pipeline |
| Materialization | Loading relevant knowledge into an agent workspace at session start | Injection, Loading, Syncing (too vague) |
| Knowledge Fabric | The sync layer between canonical store and two projections | Knowledge Layer, Memory System, Knowledge Base |
| Attention Score | Computed score determining when a knowledge item needs human eyes | Priority Score, Importance Rating |
| Handoff | Runtime coordination primitive: structured transfer of work between agents | Assignment, Routing (at this level), Delegation |

### Terms that are acceptable shorthand but not canonical

| Shorthand | Canonical form | Context where shorthand is OK |
|---|---|---|
| Review thread | Thread containing a review message awaiting a verdict | Conversational use only; never in data models |
| Chat thread | Thread with no unanswered review or questionnaire message | Same |
| Coach thread | Thread hosted on the user, with Chief of Staff, pinned | Same |
| Guild | Practice / Community of Practice | Informal explanation only |
| Budget | Appetite (money) + optional token cap | When explaining costs casually |
| HUD | The Rail | When drawing analogies to other tools |

---

## 3. Terminology Conflicts Found

### 3.1 Confirmed conflicts (must resolve before writing)

**"Item" overload.** The word "Item" appears in three distinct senses across the docs:

1. **Knowledge Item** -- a row in `knowledge_items`. Used throughout `docs/knowledge-architecture/`.
2. **Item (routing)** -- the Router's working set: a surfaced thing with an `Item.kind` for routing decisions. Used in `docs/architecture/components.md` (section 2.2) and `docs/human-interface-layer/routing-how-items-find-the-right-view.md`.
3. **Knowledge item** (lowercase, generic) -- used loosely to mean "a piece of knowledge" in running prose.

The routing `Item` is described as a "derived projection" that may eventually be replaced by reading message types directly (HIL 4.5.10, rules 2 and 4). The product story should avoid the routing sense of "Item" entirely and use "Knowledge Item" only in the knowledge context. When referring to things surfaced in Conversations, use "thread" or "review message."

**"Blocking/blocked" overload.** The docs note this themselves (process-layer/tasks-and-sessions.md, vocabulary note): lowercase `blocked` is a task workflow state (situational -- the agent hit something it cannot resolve alone), while uppercase `Block` is the content primitive. Additionally, "blocking" appears as a derived property on threads (an agent cannot continue without an answer). The product story must be careful to disambiguate these three senses. Recommendation: when writing about tasks, say "a task is stuck" or "a blocked task"; when writing about threads, say "a blocking thread" or "the agent is waiting for a response"; never use "block" as a verb in the content-primitive context -- say "section" or "structural unit" in plain language.

### 3.2 Inconsistencies between docs (minor, not blocking)

**"Factory" double meaning.** "The Factory" is both (a) the desktop app name and (b) the organizational metaphor for the entire system. `docs/human-interface-layer/one-app-two-form-factors.md` says "the Factory" is the app. `docs/knowledge-architecture/` uses "the factory" (lowercase) to mean the organization. The product story should use "the Factory app" when referring to the software and "the factory" when referring to the organizational system.

**Knowledge Item status list varies slightly.** `docs/knowledge-architecture/the-facilitators-the-most-undervalued-role-in-the-factory.md` lists 7 statuses: CAPTURED, PROVISIONAL, NEEDS_HUMAN, VALIDATED, ACTIVE, STALE, ARCHIVED. `docs/knowledge-architecture/the-canonical-store.md` lists 6: captured, provisional, validated, active, stale, archived (no NEEDS_HUMAN). `docs/knowledge-architecture/summary.md` lists a different 7-step flow. This is a minor mismatch -- `NEEDS_HUMAN` appears to be a facilitator-computed attention signal rather than a stored status column. The canonical store schema says `status` defaults to `'captured'` with the list "captured/provisional/validated/active/stale/archived" -- 6 values. The product story should use the 6-value lifecycle from the schema and mention the attention-score mechanism separately for surfacing items to humans.

**"Product" overload.** "Product" is both a domain entity (a product the company builds, like Ambrovia or Nimmly) and a generic English word. In the process layer, teams are "product-bound." The product story should always say "a product" (the thing being built) and never use "product" to refer to HyperIdle itself in contexts where confusion is possible.

**Threads schema: legacy columns.** The thread-primitive doc mentions legacy columns (`kind`, `recipient_id`, `subject`, `body`) being dropped. The architecture components doc still shows an `items` and `responses` table. The product story should describe the current Thread/Message model and ignore legacy constructs entirely.

### 3.3 Terms used in only one place (clarify or drop)

**"Durability"** -- task-level opt-in for event-sourced replay (null, checkpoint, temporal). Appears in `docs/process-layer/tasks-and-sessions.md` section 6.4. Too implementation-specific for the product story. Omit.

**"File lease"** -- mutual exclusion mechanism for artifacts. Appears in `docs/architecture/components.md` schema. Too implementation-specific. Omit.

**"Propagation log"** -- internal infrastructure for lifecycle state changes. Appears in `docs/process-layer/lifecycle-propagation.md`. Omit.

**"SECI"** -- knowledge management theory reference. The docs themselves say "we're not running SECI rituals" and "we're not naming them anywhere in the interface." Omit.

---

## 4. Narrative Structure Recommendation

The product story must work as a series of documents, each under 2000 words, that a reader can consume in any order but that build on each other when read in sequence.

### Recommended document set

**Document 1: "What is HyperIdle?" (entry point)**
The elevator pitch expanded to a full explanation. Covers:
- The problem: managing AI agent teams is unsolved. Current tools (Slack + Linear + Notion + GitHub) were built for human teams. Agent frameworks (CrewAI, LangGraph) solve execution but not coordination, knowledge, or human oversight.
- The answer: HyperIdle is a meta layer -- it does not call models or execute tools. It manages who works on what, what they know, how they coordinate, and how humans stay in the loop.
- The three-layer model (one paragraph each).
- The single desktop app (the Factory) with three views + the Rail.
- Who uses it: founders and CTOs of AI-first companies running product teams of AI agents.

**Document 2: "How Work Flows" (the process model)**
How work actually moves through the system. Covers:
- Teams: persistent, product-bound, accumulate muscle memory.
- Bets: shaped, committed, time-boxed. Money appetite, not duration. Done condition. The Canvas.
- Tasks: agent-owned, decentralized decomposition using practice knowledge. Task lifecycle states.
- Sessions: bounded agent runs. Context window as the natural session length. Session notes bridge sessions.
- Handoffs: runtime coordination, structured messages, humans in the same matrix.
- What HyperIdle does NOT have: no workflows, no DAGs, no central planner, no duration caps.

**Document 3: "Human + AI Collaboration" (the judgment gradient)**
The trust model -- front and center per AC4. Covers:
- Humans as founders and team leads. Agents as team members. Facilitators as knowledge curators.
- The judgment gradient: autonomy levels L1-L4 per agent per skill. Trust builds over time.
- Conversations: how review threads work. The GitHub PR verdict model (approve / comment / request-changes, not yes/no).
- The facilitator family: Chief of Staff (L4), Practice Facilitators (L3), Product Managers (L2). Their job: organize, score, surface only what needs human judgment.
- Cost transparency: every action shows spend. The Rail shows burn rate. Money caps at three levels.
- What this is NOT: not "zero human companies," not fully autonomous agents, not humans doing agent work.

**Document 4: "How Knowledge Compounds" (the knowledge system)**
The knowledge architecture -- what makes the 10th bet faster than the 1st. Covers:
- The five knowledge layers (L0-L4). Lower = more agent-native. Higher = more human-native.
- The canonical store: one table, two projections (rich UI for humans, workspace files for agents).
- Communities of Practice: cross-product learning. What a Builder learns on one product is available to every Builder.
- The Knowledge view: async curation. Humans as editors of collective intelligence, not graders of homework.
- Retros: every shipped or killed bet produces learning that flows back up.
- Routines: how the system stays current without daemons (sleep-time routines, practice sessions).

### Introduction order for primitives within the narrative

The key constraint: each concept should be introduced before it is needed by a later concept. The dependency graph of explanation is:

```
Three Layers (architectural frame)
  |
  v
The Factory app (what the human sees)
  |
  +-> Conversations, Work, Knowledge, Rail (the four zones)
  |
  v
Team (persistent, product-bound)
  |
  v
Bet (the unit of committed work, owned by a team)
  |
  v
Task (the unit of agent work, inside a bet)
  |
  v
Session (one bounded run on a task)
  |
  v
Handoff (how work transfers between agents)
  |
  v
Artifact (what tasks produce)
  |
  v
Thread (how everyone communicates -- crosses all three views)
  |
  v
Facilitator family (Chief of Staff, Practice Facilitator, Product Manager)
  |
  v
Knowledge Layers (L0-L4) and the Knowledge Fabric
  |
  v
Autonomy Levels and the trust gradient
  |
  v
Routines (recurring work with memory)
  |
  v
Cost model (money appetite, WIP limits, model tiers)
```

### What to emphasize vs. what to mention briefly

**Emphasize (differentiators per AC2/AC4):**
- Teams persist across bets (vs. CrewAI's per-task crews)
- No workflows, no DAGs (vs. workflow-engine thinking)
- Humans validate, agents execute (vs. "zero human companies")
- Money appetite not duration (vs. Shape Up sprints, sprint-based tools)
- Decentralized decomposition (vs. central planner agents)
- Knowledge compounds across products (vs. context lost per task)
- Facilitators as the nervous system (vs. dump-on-humans or auto-drift)

**Mention briefly (important but not differentiating):**
- TOON format (one sentence -- "a compact format for token efficiency")
- Model tiers (one sentence -- "the system picks the right model size for each task")
- Kernel/Strategy split (one sentence if at all -- architecture detail)
- Block primitive (mention that markdown bodies have addressable sections for discussion)
- ArtifactView shapes (list them, do not explain each)

**Omit entirely (implementation details):**
- Durability options (Temporal, checkpoints)
- File leases
- Event Bus internals
- Propagation log
- Schema column names
- SECI, Kata, Toyota references (the docs themselves say not to surface these)
- WebSocket push contract
- Harness adapter interface signatures

---

## 5. Self-Critique

**What this concept pass does well:**
- Covers every primitive the AC requires (team, bet, task, session, knowledge, routine, agent -- AC3)
- Identifies the judgment gradient and facilitator roles that AC4 demands
- Catches three genuine terminology conflicts that would produce confusion in product docs
- Provides a dependency-ordered narrative structure that avoids forward references

**What could be stronger:**
- The "How it differs from alternatives" angle needs sharpening during the writing phase. The concept pass identifies WHAT to explain; the writer must develop the SPECIFIC comparisons (e.g., "CrewAI forms a crew per task; HyperIdle forms a team per product" needs a concrete example with named products).
- The AC5 ("features that exist today" vs. "coming soon") boundary cannot be drawn from docs alone. The writer will need to check the running system and the pipeline manifest to know what has actually shipped vs. what is spec-only.
- The four-document structure is a recommendation. The writer may find that three documents or five serve better once drafting begins. The narrative dependency graph is the durable artifact; the document boundaries are flexible.
