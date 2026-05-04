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
