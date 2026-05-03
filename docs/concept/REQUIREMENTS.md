# HyperIdle — Requirements Document

Version 0.3 — April 2026

HyperIdle is the platform that runs the Product Factory: a meta layer on top of agent harnesses that turns AI agents into persistent employees organized in product teams, with structured knowledge management and a human interface designed for two founders running a portfolio of digital products.

This document captures the usability requirements (what the experience must feel like), the functional requirements (what the platform must do), the system requirements (what the infrastructure must support), and the non-functional requirements (how well it must do all of the above).

Derived from: `AGENT_LAYER.md`, `KNOWLEDGE_ARCHITECTURE.md`, `PROCESS_LAYER.md`, `HUMAN_INTERFACE_LAYER.md`, `RESEARCH_EXECUTION_LAYER.md`, `INFORMATION_ARCHITECTURE.md`, `DESIGN_REVIEW.md`.

---

<!-- @anchor: users-and-their-modes-of-engagement -->
## 1. Users and Their Modes of Engagement

HyperIdle has two categories of users — humans and agents — and the system must serve both equally well. The human experience is an app they open. The agent experience is a set of primitives they interact with programmatically.

### 1.1 Human Users (Founders)

Two founders: a CEO and a CPO. Their time is the scarcest resource in the factory. Every human-facing requirement exists to maximize the value extracted per minute of human attention.

The founders engage through five interaction modes, each with a distinct rhythm and cognitive demand:

**Review (seconds, reactive).** Approve, reject, or comment on concrete proposed actions. The target is 15-second decidability for simple items, with room for multi-turn conversation when the item warrants it. This is the daily driver.

**Prioritize (ambient, daily).** Glance at factory state — active bets, blockers, cost burn, items awaiting ordering. Three minutes with morning coffee. No decisions required, just awareness and occasional nudges.

**Bet (weekly, focused).** Pick which 2–3 shaped options the factory works on next by dragging pitches from shaped to committed in a two-column layout with a hard capacity cap. Fifteen minutes, once a week. Forces trade-offs through explicit limits.

**Coach (monthly, conversational).** Talk with the Chief of Staff agent about how the factory is running — cross-product patterns, recurring obstacles, rule changes. A persistent thread, always available, deliberately engaged monthly.

**Curate (weekly, editorial).** Tend the cross-product knowledge base. Prioritize the agenda, flag wrong-looking items, prune stale knowledge. Twenty minutes, once a week.

### 1.2 Agent Users

Agents interact with HyperIdle through five primitives: workspace, skills, inbox, memory, and rhythm. Agents never see a UI. Their experience is defined by the APIs, schemas, and data stores they read from and write to.

---

<!-- @anchor: usability-requirements -->
## 2. Usability Requirements

### UX-1: One App, One Door

The human interface ships as a single application ("the Factory") with two form factors: desktop and mobile. The human never decides "which app do I open." They open the Factory and the Factory presents the right thing.

**UX-1.1** Desktop is a single window with four persistent zones: an **IconRail** (left, view switching), a **Submenu** (per-view, collapsible), a **Main** pane (active content — Conversations, Work, or Knowledge), and a **Rail** (right sidebar, ambient state — always visible, expandable to full panel or minimizable to icon strip). The Rail is the only notification surface; there is no top-bar bell or global toast stream.

**UX-1.2** Mobile has three tabs: Home (the Rail translated to a phone screen), Conversations (Conversation List + individual threads), and Work (read-only view of bets and tasks with nudge ordering).

**UX-1.3** No Knowledge view on mobile. Curating a knowledge base on a phone is hostile to the user.

**UX-1.4** One codebase for both form factors. PWA first; native mobile wrapper only if push integrations demand it later. Optional Tauri desktop wrapper for OS-native notifications and tray icon.

### UX-2: One Interaction Grammar

**UX-2.1** The threading UI is built once and reused for review items, chat items, the Coach thread, and agent-to-agent threads the human is copied on. One component, written once.

**UX-2.2** Review threads use a streamlined verdict model. Primary actions: approve, request changes, reject, snooze — always visible with keyboard shortcuts (A, R, X, S). Secondary actions in overflow menu: edit, escalate, delegate, comment only. Inline comments on specific artifact parts.

**UX-2.3** Chat threads support reply, start-a-task, close, and escalate.

**UX-2.4** The Coach thread is a pinned thread at the top of the Conversation List, not a separate surface. Same interaction grammar as any other thread.

**UX-2.5** Every thread item carries visible `reasoning` — why the agent surfaced this. Non-negotiable for trust.

### UX-3: Notification Discipline

**UX-3.1** Push notifications fire only for blocking review items (risk ≥ medium) and chat items the agent explicitly flagged as urgent. Everything else is silent.

**UX-3.2** Non-urgent items batch into a daily digest.

**UX-3.3** Quiet hours and silence modes are per-human and per-product. A founder can mute one product without going dark on others.

**UX-3.4** Per-agent notification preferences allow dialing down a noisy agent without system-wide changes.

### UX-4: Ambient Awareness (The Rail)

**UX-4.1** The Rail is always visible on desktop. It shows: active bets with status indicators, current blockers, cost burn rate, unread chat count, and items awaiting ordering.

**UX-4.2** The Rail can change colors, show counters, animate status indicators. It cannot demand attention. If something needs attention, it goes to Conversations.

**UX-4.3** The Rail expanded panel shows: blocked agents (always first), active bets with progress, cost burn, agent activity summary, unread breakdown, knowledge additions, recent completions feed, and system stability.

**UX-4.4** Rail expand/collapse state persists globally across view switches. Expanding the Rail in Conversations keeps it expanded when switching to Work.

**UX-4.5** Keyboard shortcut to toggle Rail expand/collapse.

**UX-4.6** Keyboard-first interaction: arrow keys to move, enter to act, no mouse required.

### UX-5: Work View

**UX-5.1** The Work view has three levels of depth: Portfolio Overview (all products — the default landing screen), Team View (per product — bet canvas + task kanban), and Bet Detail (per bet). Navigation drills down; breadcrumbs navigate back up.

**UX-5.2** Portfolio Overview shows product status cards (with velocity sparklines), portfolio-level metrics, and cycle management (phase indicator, advance action, past cycle summaries with cost variance).

**UX-5.3** Team View has two areas: a bet canvas (top, showing committed bets with capacity indicator) and a task kanban (bottom, showing all tasks across current bets in four columns: Planned, In Progress, Blocked, Done).

**UX-5.4** Pitches are only visible when the founder clicks "Add bet (+)" on the canvas. This opens a pitch selector overlay that replaces the task kanban temporarily. The founder can browse, expand, commit, reshape, kill, or create new pitches. Closing the selector returns to the task kanban.

**UX-5.5** Capacity is a hard limit on the bet canvas. The commit action on a pitch card enforces it — no drag-to-commit. Cards that exceed capacity cannot be committed.

**UX-5.6** No backlog. Pitches not picked drift off after two cycles unless reshaped.

**UX-5.7** Bet status lifecycle: shaped → committed → in-progress → behind → blocked → paused → shipped → killed. Terminal states (shipped, killed) persist in completed bets archive accessible from the portfolio.

**UX-5.8** Cycle management UI: cycle phase indicator (Shaping / Betting / Building / Cool-down), advance-cycle action, past cycle summaries with cost variance (actual vs. appetite per shipped bet).

**UX-5.9** Pitch creation happens in-app via the pitch selector: a "New Pitch" form (title, appetite, problem, solution sketch, rabbit holes, done condition). No external tooling required.

**UX-5.10** Work view is desktop only. Mobile Work tab shows a read-only list of bets and tasks with nudge-up/nudge-down ordering.

### UX-6: Knowledge View

**UX-6.1** The Knowledge view supports three scopes (practice, product, factory) selectable via scope selector. Two main views: Curated (all active items grouped by topic) and Triage (needs attention + drafts + stale, sorted by attention score). Additional sort options within each view.

**UX-6.2** Supports: nudge priority, flag items, merge duplicates, split overloaded topics, rename, archive, and inline edit.

**UX-6.3** Merge workflow: select target item from same-topic list → preview combined result → confirm. Source item archived with redirect. Split workflow: select text section → promote to new item → auto-cross-link both.

**UX-6.4** Every knowledge item shows provenance: origin agent, creation context, evidence links. Related items sidebar shows auto-suggested and manually linked items.

**UX-6.5** Knowledge gap detection: topics with zero active items or no activity in 90+ days are highlighted in the topic browser.

**UX-6.6** Desktop only.

### UX-7: Trust-Building Mechanisms

**UX-7.1** Reasoning visible by default on every item.

**UX-7.2** Cost transparency: every action shows token spend; the Rail has a daily burn-rate strip.

**UX-7.3** Reversibility cues: items tagged "reversible" or "irreversible." Reversible items approve with lower friction.

**UX-7.4** Graduated autonomy per agent per skill, ranging from L1 (every action approved) to L4 (autonomous unless blocked). Levels are per-agent-per-skill (effectively per-team-per-skill, since the same skill in different products needs different oversight) and move up over time as the success rate justifies it.

### UX-8: App Shell & Navigation

**UX-8.1** Global search (⌘K) searches across all views. Results grouped by type: Threads, Bets/Tasks, Knowledge Items. Keyboard navigation through results (arrow keys, Enter to open, Escape to close).

**UX-8.2** No dedicated notification panel in the top bar. The Rail is the notification surface — minimized strip shows counts (blocked, unread, cost burn), expanded panel shows details and links to relevant views. Push notifications (UX-3) route through the Rail's data, not a separate panel.

**UX-8.3** Settings accessible from user avatar: Notifications (per-type toggles, quiet hours, per-product mute), Budgets (cost caps per agent/team/factory), Agents & Permissions (autonomy levels, pause/reactivate), Cycles (length, cool-down, phase management), Knowledge (auto-archive threshold, conflict rules, import/export).

**UX-8.4** Keyboard shortcuts: ⌘K (search), ⌘1/2/3 (switch views), ⌘B (toggle Rail), J/K (next/previous in lists), A/R/X/S (verdict actions in review threads), ? (show shortcut help).

**UX-8.5** Thread filtering in Conversations submenu: filter by product, agent, type (review/chat), status (blocking/open/snoozed/resolved). Thread state actions: snooze with timer, archive, mute.

**UX-8.6** Estimated review time displayed on thread list items. Agent-estimated complexity tag helps triage without opening each thread.

**UX-8.7** Agent confidence indicator visible in review thread headers. Helps founder calibrate scrutiny level for complex decisions.

---

<!-- @anchor: functional-requirements -->
## 3. Functional Requirements

### F-1: Agent Identity and Lifecycle

**F-1.1** Agents are defined by three composable parts: soul (system prompt — who they are), context (what they know, loaded JIT from L0–L4), and skills (what they can do — packaged scripts calling CLIs/APIs). All three are independently swappable.

**F-1.2** The system supports two categories of agents: central (factory-wide, serving all products) and product-team (serving one product, part of a persistent team).

**F-1.3** Central agents: Chief of Staff (L4 facilitator), Practice Facilitators (one per community of practice — building, product, growth, ops, facilitation), Infra Agent, Platform Agent, Scout.

**F-1.4** Product-team agents: Product Manager (team lead), Builder(s), Growth Agent, Ops Agent. The roster flexes by product lifecycle phase. Specialist capabilities (security review, brand-voice check, accessibility audit) are skills invoked within sessions — possibly via sub-agents — not separate top-level agents.

**F-1.5** Agents can be paused (context persists, no active sessions) and reactivated. Agents are only dismissed when a product is sunset and its team dissolves.

**F-1.6** An agent belongs to exactly one team (or is central). No multi-team membership. When a product team needs expertise from another team, cross-team tasks (F-5.4) handle it.

**F-1.7** Within a session, an agent can spawn sub-agents (via harness-level primitives like Claude SDK subagents) to parallelize or specialize work. Sub-agents are internal to the session — the meta layer does not see them. Their cost rolls up into the parent session.

**F-1.8** Model routing is tier-based (Reasoning / Workhorse / Fast), assigned per session by the Scheduler based on task risk tier, routine type, and factory cost posture. Deployers configure which actual model each tier maps to.

### F-2: The Five Process Primitives

**F-2.1 Bet.** A shaped, committed, time-boxed unit of work owned by a team. Required fields: product, team, pitch, appetite (1w/2w/6w), done_condition, hypothesis, status (shaped → committed → in_progress → behind → blocked → paused → shipped → killed), revision_log with timestamped reasoning for every change. The done_condition is non-negotiable: a bet cannot enter `in_progress` without one. Bets are allowed to change as the team learns — done condition, hypothesis, and appetite revisions are first-class events, each requiring a review thread to the founder.

**F-2.2 Task.** A unit of work picked up by an agent. Required fields: bet, product, team, owner, done_condition, state (proposed → accepted → hold → in_progress → blocked → review → done → killed), dependencies (list of Task IDs), sessions, artifacts (with file leases), cost_cap, cost_actual, risk_tier (low/medium/high), attention_score. The `hold` state is for tasks with unmet upstream dependencies — the Dependency Watcher automatically transitions them to `accepted` when all upstream tasks reach `done`. `blocked` is distinct: runtime blocks discovered during execution (human reply needed, external service, design question). Optional thread attachment (only when there's something to discuss). Optional cross_team flag for tasks owned by agents from a different team than the bet's owning team.

**F-2.3 Session.** A single agent's bounded run on a task. Required fields: task, agent, started_at, ended_at, state (active → paused → done → crashed), workspace_snapshot, cost, outcome (made_progress / blocked / completed / handoff / escalated), notes. A session's natural length is the agent's context window — **the session ends when compaction is imminent**, and the agent writes session notes back to the task before ending. This is the "working day" metaphor: the context window is the day, things not written down before compaction are forgotten.

**F-2.4 Team.** A persistent group of agents bound to a product. Required fields: product, members, lead (typically the Product Manager), capacity (max parallel bets, max parallel tasks per member, max daily cost), active_bets, bets_shipped. Teams persist for the life of the product and dissolve only when the product is sunset. Team membership changes go through Conversations as review items. Agents only leave a team when their work is done.

**F-2.5 Routine.** A recurring trigger attached to a named agent with persistent state across runs. Required fields: owner, trigger (cron / event pattern / heartbeat interval), skill, done_condition, state_key (persistent memory across runs), delegation_allowed (bool — can a teammate with the right skill pick it up?), human_review (bool), autonomy_level (L1–L4), active, silent (bool — sleep-time routines that update memory without producing items). Adding a routine always requires human approval via a review thread.

### F-3: Knowledge Architecture (Five Layers + Knowledge Fabric)

**F-3.0 Canonical store.** All knowledge lives in a single `knowledge_items` table in SQLite (see KNOWLEDGE_ARCHITECTURE.md §3). The Knowledge Fabric projects this store into two formats: rich web UI for humans (the Knowledge view) and materialized file workspaces for agents. Sync is continuous — materialization at session start, then a file watcher writes back changes incrementally as the agent works (500ms debounce). No dependency on a clean session-end hook. Optimistic concurrency with per-field last-writer-wins for rare conflicts.

**F-3.1 L0 — Session memory.** Ephemeral. Rebuilt every session by the Knowledge Fabric's materialization engine (KNOWLEDGE_ARCHITECTURE.md §4.2). The fabric selects the relevant slice of knowledge based on task, agent role, and product, applies a materialization budget to stay within token limits, and writes the workspace in three zones: `context/` (read-only reference), `work/` (session scratch), `knowledge/` (proposed changes). Format: TOON packs for structured data, markdown for prose. No human touch.

**F-3.2 L1 — Task memory.** Per-task rows: what was tried, what happened, what differed, what broke. Failures are first-class. Session notes (written before context compaction) are the primary bridge between sessions on the same task. Humans see only generated views.

**F-3.3 L2 — Product memory.** Human-authored prose (BRIEF.md, ARCHITECTURE.md, BRAND.md, PRINCIPLES.md) and agent-native structured data (tasks, decisions, handoffs, cycles, bets). Both stored as rows in `knowledge_items` with appropriate `kind` and `format` fields. Markdown files in Git become exports from SQLite, not the source of truth.

**F-3.4 L3 — Practice memory.** Per community of practice (building, product, growth, ops, facilitation). Knowledge items stored with `layer='L3'`, `scope_id` per community, and `topic` as first-class grouping (e.g. 'auth', 'deployment'). Kind values: pattern, anti_pattern, decision, failure, reflection. Additional fields in `meta` JSON: summary, what_works, evidence_task_ids, last_used, tags. Materialized into agent sessions as TOON packs. Anti-patterns are first-class. Knowledge flows freely between teams without per-change approval; humans curate async via the Knowledge view.

**F-3.5 L4 — Factory memory.** PRINCIPLES.md (5–10 lines, slow-changing), FOCUS.md (current monthly target), PORTFOLIO.md (which products get energy), REFLECTIONS/ (monthly coaching notes). Stored in `knowledge_items` as markdown-format rows, exported to Git for version history. The Chief of Staff proposes changes; humans approve via review threads.

**F-3.6 Writeback.** The Knowledge Fabric runs a file watcher on the agent's `knowledge/` and `work/` directories throughout the session. On each file change (after 500ms debounce), modified files become updates to existing knowledge items (with version checks), new files become new items with status CAPTURED, and deleted files are flagged for facilitator review. Version conflicts trigger per-field merge for structured data, or facilitator review for prose. A final lightweight pass runs at session close to catch any trailing writes. See KNOWLEDGE_ARCHITECTURE.md §5–6.

**F-3.6** Every knowledge item has a lifecycle status: CAPTURED → PROVISIONAL → NEEDS_HUMAN → VALIDATED → ACTIVE → STALE → ARCHIVED. Most items never need a human. Promotion from PROVISIONAL to VALIDATED can happen automatically via repetition (same learning in 5+ products, never contradicted).

**F-3.7** Every knowledge item has an attention score computed from: novelty, impact, conflict, repetition (reduces need), confidence (reduces need), taste sensitivity, recency of review, usage frequency. Crossing a threshold puts the item in a human's queue.

### F-4: Facilitator Agents

**F-4.1** Three tiers: Chief of Staff (L4, one per factory), Practice Facilitators (L3, one per community of practice), Product Managers (L2, one per product team).

**F-4.2** Facilitators continuously organize (merge duplicates, resolve conflicts, archive stale items, link related artifacts, tag for retrievability), score items for human attention, shape the human's queue for their layer, ask for the right kind of feedback (validation / resolution / refresh / judgment / elevation), and close the loop (write human feedback back into the knowledge store).

**F-4.3** Product Managers have a dual role: coordinator (runs cycles, resolves handoffs, unblocks the team, shapes pitches, integrates the team's decomposition, drafts retros) and self-improver (watches own coordination, captures facilitation learnings, proposes process changes).

**F-4.4** Product Managers watch the trajectory of bets and tasks. When trajectory shifts in a way the founder should know about, the facilitator drafts a review thread. This is a judgement call — no numerical thresholds. Certain changes always surface: done_condition, hypothesis, appetite, kill, cross-team tasks.

**F-4.5** Facilitators themselves form a community of practice, with a Practice Facilitator for "facilitation itself."

### F-5: Decomposition and Handoff

**F-5.1** Decomposition is decentralized and practice-grounded. Each team member proposes tasks in their work stream using knowledge from their practice (L3) to identify what tasks are typical for this kind of work. The Product Manager integrates the task list (dedupes, identifies gaps, spots overlap, confirms coverage of the done condition).

**F-5.2** Handoff is the coordination primitive. An agent calls `handoff_to` with the next agent and a message. The session ends, ownership transfers, the new agent is notified on the task thread.

**F-5.3** Handoff to a human uses the same mechanism as handoff to another agent (thread message + state change). Humans are identities in the matrix.

**F-5.4** Cross-team work uses chat threads between team leads plus cross-team tasks on the requesting bet. The providing team's agent owns the task; the requesting bet tracks completion. The goal is product teams with end-to-end ownership — a high cross-team task rate is a smell.

**F-5.5** Replanning is expected. The task list evolves as the team works. Additions, removals, and dependency changes are internal to the team. The Product Manager's judgement determines when to surface changes to the human (see F-4.4).

### F-6: Routing

**F-6.1** Facilitators route items to views based on characteristics: risk-tier ≥ medium → Conversations (review); agent-initiated conversation → Conversations (chat); cross-product pattern / rule change → Coach thread; order/rank-able items → Rail; shaped pitches → Work; knowledge updates → Knowledge.

**F-6.2** Skill changes always route to Conversations (review) — synchronous gate. Skills are powerful and compound.

**F-6.3** When in doubt, route to the less interruptive view. Conversations is the most expensive view (can interrupt the human's day).

**F-6.4** Founder responsibility routing: the Chief of Staff knows which founder to route to based on domain (market/growth/portfolio → CEO; product/design/tech/content → CPO; strategic decisions → both).

### F-7: Top-Down and Bottom-Up Knowledge Flow

**F-7.1** Top-down: founders set direction through PRINCIPLES.md, FOCUS.md (edited via Coach thread → review thread → approval), and bet commitment in the Work view. Every agent reads L4 factory memory at session start.

**F-7.2** Bottom-up: agents accumulate findings during sessions and contribute them to their practice at the next practice meeting. Practice Facilitators synthesize findings into knowledge items. Retros route surprises and patterns to the Practice layer and the Coach thread. Any agent can post a chat thread to the founders directly.

**F-7.3** The two flows meet at the bet. Bets start as top-down commitments (founder picked them) but evolve as bottom-up learning changes the team's understanding. Revisions are logged in the bet's revision_log with reasoning.

### F-8: Practice Contribution Cycle

**F-8.1** Agents accumulate findings during task sessions — patterns noticed, things that worked, things that didn't, things the practice doesn't know yet but should.

**F-8.2** Each practice has a regular meeting rhythm (typically weekly, configurable). At the meeting (a routine on the Practice Facilitator), every agent in that practice contributes findings since the last session. The Practice Facilitator drives discussion and decides which findings become CAPTURED practice items.

**F-8.3** When a team member starts a task session, it queries its practice (L3) for relevant knowledge as part of normal L0 session setup. New knowledge the practice has decided since the last task session is automatically available — no push notification needed.

**F-8.4** The Knowledge view (human surface, async) is where humans curate what practices and products produce. Agents contribute and discuss; humans prune and shape.

### F-9: Retros and Learning

**F-9.1** Every shipped or killed bet produces a retro (auto-fired routine on the Product Manager, cannot be skipped): original hypothesis vs. reality, surprises, practice-worthy patterns, rule-change proposals, reusable artifacts.

**F-9.2** Retro outputs route to two places: Practice layer (patterns become practice items) and Coach thread (rule-shaped insights).

**F-9.3** Monthly cycle retro by the Chief of Staff: portfolio-level patterns, cross-product obstacles, capacity observations, cost trends.

### F-10: WIP and Cost Limits

Cost hierarchy is strictly nested: agent < team < factory. An agent cannot exceed its cap even if the team has headroom.

**F-10.1** Per-agent: WIP limit (max in-progress sessions, default 3) + cost cap (daily budget). Agent stops accepting new sessions when either limit is hit.

**F-10.2** Per-team: WIP limit (max parallel tasks, default: team size × 2) + team cost cap (aggregate of agent caps + overhead). Soft preference for one active bet; multiple parallel bets tracked as a focus cost. **When team cost cap is reached, the team stops** — all agents finish in-progress sessions, no new work until budget resets or cap is raised.

**F-10.3** Per-factory: factory cost cap (aggregate of team caps + overhead). The Cost Sentinel (heartbeat routine on Chief of Staff) monitors burn rate. **When factory cap is reached, everything stops** — all teams finish in-progress sessions, no new work. Critical ops tasks are not killed mid-session but cannot start new sessions.

**F-10.4** Hitting a limit produces a thread item, never a silent drop.

**F-10.5** Cost caps reset on a configurable cycle (default: daily). Smart defaults: equal splits across agents, team caps derived from composition, factory cap derived from team caps. All caps editable via Settings.

### F-11: Cycle Management

**F-11.1** Each product team operates on a configurable cycle (default: 6 weeks build + 2 weeks cool-down). Cycle phases: Shaping (pitches created), Betting (pitches committed), Building (work in progress), Cool-down (no new bets, free exploration, retros).

**F-11.2** Advancing a cycle: founder triggers phase transitions via the Work view. Advancing from Building to Cool-down auto-fires retros (F-9.1). Advancing from Cool-down to Shaping archives expired pitches (not committed after 2 cycles).

**F-11.3** Past cycle data persists: shipped bets, killed bets, cost variance (appetite vs. actual), velocity metrics. Accessible from Portfolio Overview.

**F-11.4** Cycle length and cool-down duration are configurable per product in Settings.

---

<!-- @anchor: system-requirements -->
## 4. System Requirements

### S-1: Deployment Profiles

**S-1.1** The system must be deployable across four profiles from day one: laptop (Docker + gVisor or Git repo workspace), self-hosted VPS (Docker + gVisor or Daytona), managed cloud (E2B Desktop Sandbox or Modal), BYO cloud (Daytona when Custom Regions GA).

**S-1.2** A solo builder must be able to install and run HyperIdle on a MacBook in under 30 minutes with nothing beyond Python, SQLite, Docker, and a model API key.

**S-1.3** Switching deployment profiles is a configuration change, not a rebuild.

### S-2: Data Storage

**S-2.1** Primary storage: SQLite by default for all stores — process primitives (Bets, Tasks, Sessions, Teams, Routines, Inbox) and knowledge (`knowledge_items` table). One database file per factory instance. Swappable to Postgres for deployments exceeding ~50 agents.

**S-2.2** Human-readable artifacts (briefs, principles, reflections): stored as rows in `knowledge_items` with format `markdown`. Exported to Git-versioned directories for version history and external access. Git is the backup and audit trail, not the source of truth.

**S-2.3** Semantic search (optional): Postgres + pgvector for cross-product querying at scale. SQLite FTS5 on `knowledge_items` as the lightweight default.

**S-2.4** Session context packs: TOON format for ~40% token savings over JSON. Materialized by the Knowledge Fabric at session start.

**S-2.5** Knowledge Fabric sync: materialization at session start (SQLite → workspace files), continuous writeback via file watcher during session (workspace diffs → SQLite updates, 500ms debounce). Optimistic concurrency via `version` column. Per-field last-writer-wins for structured data conflicts; facilitator review for prose conflicts. See KNOWLEDGE_ARCHITECTURE.md §5.

### S-3: Agent Runtime

**S-3.1** HyperIdle is a meta layer, not an agent harness. It does not contain a tool-use loop or a model-calling loop. Those live in the harness.

**S-3.2** The system must support multiple harnesses via a thin adapter interface: spawn an agent with a prompt/tools/skills, stream events, stop, read the conversation. Supported harnesses at launch: Claude Agent SDK. Planned: Letta, Goose, OpenHands.

**S-3.3** Workspaces are abstracted behind a thin interface: `spawn`, `exec`, `read`, `write`, `snapshot`, `destroy`.

**S-3.4** Model tier assignment happens at session creation time. The Scheduler picks the tier (Reasoning / Workhorse / Fast) based on task risk tier, routine type, and cost posture. The deployer configures which actual models map to each tier.

### S-4: Skills System

**S-4.1** Skills are packages containing a SKILL.md instruction file, bundled scripts (bash, Python, curl, CLI invocations), and resources (templates, schemas, examples). Skills call existing CLIs and APIs directly — no protocol layer, no MCP wrapper.

**S-4.2** Progressive disclosure: metadata in system prompt (~100 tokens per skill), SKILL.md on demand, resources on demand.

**S-4.3** Skills must be compatible with vanilla Claude Code SKILL.md format. If the meta layer vanishes, skills keep working in bare Claude Code.

**S-4.4** Skill changes (new, edit, retire) always require human approval via review thread.

### S-5: Inbox and Messaging

**S-5.1** The inbox is a SQLite table (or Git-tracked message directory). Messages have: sender, recipient, thread, subject, body, attached file leases, timestamps.

**S-5.2** Agents read/write inboxes via `read_inbox` / `send_message` skills.

**S-5.3** File leases: when an agent modifies an artifact, it reserves a lease. Other agents see the lease and work elsewhere. Humans see leases in the inbox.

**S-5.4** The human inbox (Conversations view in the Factory) reads the same table, with humans as identities.

### S-6: Scheduling and Rhythm

**S-6.1** The system supports four agent rhythms: heartbeat (cron), inbox-driven (event), continuous, and calendar-driven.

**S-6.2** Scheduling interface: `schedule(agent, trigger)` where trigger is heartbeat, inbox, continuous, or calendar.

**S-6.3** Minimum implementation: `cron` + SQLite + a background worker process. No dependency on Inngest, Temporal, or LangGraph.

**S-6.4** Durability is per-task and opt-in. Skills declare their durability requirement. Adapters ship for: none (default), checkpoint (harness-native), temporal (Temporal/Hatchet). Risk-tier high or runtime > 30 min defaults to temporal.

**S-6.5** Sleep-time routines (silent, memory-only runs) must be supported — the Scheduler fires the routine, the session runs, writes to memory, and produces no Item.

### S-7: Observability

**S-7.1** Every harness call, tool invocation, skill load, and inbox message emits an OpenTelemetry-style span through one adapter.

**S-7.2** Default adapter is no-op for minimal installs. Supported backends: Langfuse (self-hosted), LangSmith, Helicone (managed).

### S-8: Notification Delivery

**S-8.1** A notification adapter hooks the review-thread stream into push services. Supported: APNs, Firebase, ntfy, plain SMTP. Deployer chooses.

**S-8.2** Minimum viable notification: ntfy.sh or plain SMTP + a mobile email client.

### S-9: Cross-Cutting Data Model

**S-9.1** Every item flowing through any view is the same shape (the Item schema from HUMAN_INTERFACE_LAYER §6): id, source (agent identity), layer, verb, kind, title, body, attachments, proposed_action, options, risk_tier, attention_score, blocking, reasoning, cost_estimate, audit_trail, timestamps.

**S-9.2** Every human action is the same shape (the Response schema): item_id, decision, inline_anchor, edits, feedback, approver, view, timestamp.

**S-9.3** These two schemas are the contract between the meta layer and the UI. The UI renders Items; the meta layer processes Responses.

### S-10: Security and Isolation

**S-10.1** Agent workspaces are sandboxed. Agents cannot access other agents' workspaces directly; coordination happens through the inbox and shared knowledge stores.

**S-10.2** Credentials are injected into workspace environments; agents never see or handle secrets directly.

**S-10.3** The Factory app is accessible only over Tailscale (or equivalent private network) by default. No public-internet exposure required.

---

<!-- @anchor: non-functional-requirements -->
## 5. Non-Functional Requirements

### NF-1: Performance

**NF-1.1** Review thread items must render within 200ms of opening.

**NF-1.2** Rail updates (bet status, cost burn, blocker status) must propagate within 5 seconds of the underlying state change.

**NF-1.3** Session startup (Knowledge Fabric materialization: querying `knowledge_items`, relevance scoring, writing workspace files including TOON packs and markdown, generating manifest, starting file watcher) must complete within 10 seconds for the laptop profile. Per-file incremental writeback (single file diff, version check, write to `knowledge_items`) must complete within 1 second. Final session-close pass must complete within 5 seconds.

### NF-2: Reliability

**NF-2.1** No silent data loss. If a session crashes, the last checkpoint (session notes written to the task) is recoverable.

**NF-2.2** Hitting WIP or cost limits produces visible thread items, never silent drops.

**NF-2.3** The system must gracefully degrade when the model API is unavailable (queue work, notify humans, pause non-essential routines).

### NF-3: Scalability

**NF-3.1** Support up to 5 concurrent products with 4–6 agents each (20–30 agents total) on the laptop profile.

**NF-3.2** Support up to 20 concurrent products (80–120 agents) on the VPS/cloud profiles.

**NF-3.3** SQLite must remain the viable default for the laptop and small-VPS profiles. Postgres is optional for deployments exceeding ~50 agents.

### NF-4: Extensibility

**NF-4.1** New agent types (specialist roles beyond Builder/Growth/Ops) can be added by creating a soul prompt, assigning skills, and joining a team — no code changes to the meta layer.

**NF-4.2** New skills can be added by dropping a skill package into the skills directory and getting human approval via a review thread.

**NF-4.3** New deployment profiles can be added by implementing the workspace interface (`spawn`/`exec`/`read`/`write`/`snapshot`/`destroy`) and the scheduling interface.

---

<!-- @anchor: decisions -->
## 6. Decisions

### Decided

- **Practice session mechanics** — three-turn conversation (1: all agents propose findings, 2: all agents react with context/relevance, 3: facilitator synthesizes — routing items to practice L3 or product L2 as appropriate).
- **Session notes** — continuous writing throughout the session, not just at end. Pre-compaction trigger where harness supports it. No rigid template; flight-level guidance on what to write about.
- **Skill hot-reload** — next session picks it up. No mid-session propagation.
- **Desktop shell** — web-first. Plain web app served by the API process. No Tauri, no PWA wrapper. Native apps can be added later.
- **Mobile** — online-first responsive web app. No dedicated native app or offline-first PWA in v1.
- **Canvas (bet placement)** — symbolic UI, not an actual canvas. Two-column layout (shaped / committed) with hard capacity cap, rendered as `BetCard`s. Standard React components on the DaisyUI stack (see UI_DESIGN.md).
- **TOON format** — using existing spec at github.com/toon-format/toon.
- **Scheduler** — async single-process (Python asyncio). Scale to separate worker only when measured latency demands it.
- **No external framework integrations in the meta layer.** No Letta, no Agent Mail, no Temporal, no Inngest. All agentic integrations happen through the Agent Runtime (Harness Adapters). Minimal dependencies.
- **Laptop minimum install** — Python + SQLite + Docker + Claude API key. 10-minute install bar.
- **Product Manager trajectory assessment** — reads task comments and notes to assess progress. No hardcoded signals or thresholds. Analytics can be layered in later.
- **No platform team.** HyperIdle is developed by a product team using HyperIdle — dogfooding its own framework.
- **Cross-product routine ownership** — Chief of Staff.
- **Routine migration** — an agent cannot leave a team while it has routines attached. Routines must be reassigned or retired first.
- **Team membership changes** — the Product Manager (team facilitator) can request changes on behalf of the team via Conversations to the Chief of Staff, who assesses and proposes to founders.
- **Knowledge Fabric sync** — continuous writeback via file watcher is v1. No session-boundary dependency. WebSocket push to Knowledge view tabs included.
- **Notifications** — TBD during development. Will need a notification adapter; specific technology decided at implementation time.

### Deferred

- **Heartbeat granularity** — minimum roughly hourly. Exact granularity determined during implementation.
- **Daytona Custom Regions** — parked until addressing self-hosted deployment profiles.

---

*This document captures what the system must do, not how it does it. The companion ARCHITECTURE.md captures the how.*
