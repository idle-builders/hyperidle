# Process Layer

How work actually flows through the agent factory. This doc covers the unit primitives (Bet, Task, Session, Team, Routine), how decomposition happens, how teams form and persist, how recurring work attaches, how change propagates top-down and bottom-up, and how the factory knows it's done.

Four grounding documents sit underneath this one:
- `KNOWLEDGE_ARCHITECTURE.md` defines the five layers (L0–L4) and the matrix of products × disciplines × practices.
- `KNOWLEDGE_ARCHITECTURE.md` §4–7 defines how knowledge moves between the canonical store, the human interface, and agent workspaces — the sync protocol that makes sessions work.
- `RESEARCH_EXECUTION_LAYER.md` defines the agent-as-employee model — workspace, skills, inbox, memory, rhythm.
- `HUMAN_INTERFACE_LAYER.md` defines the one-app, two-form-factor surface where humans meet the factory.

This doc is the operating mechanics. It's what turns a committed bet into shipped artifacts, what makes multiple agents act like a team, and what attaches recurring work to named agents in a way that survives.

---

## 1. Why a Dedicated Process Layer

Most agent demos in 2026 fall apart at exactly this layer. They ship a single agent doing a single task, or they ship a multi-agent demo that runs for one cycle and never picks up where it left off. They have no story for *teams that persist*, *bets that change*, *recurring work that has memory*, or *how an agent decides what task to pick up next*.

The two failure modes the field has seen:

- **Workflow-engine thinking.** Treat the factory as a DAG of nodes. Every transition is wired in advance. Adding a new step means editing the graph. Agents become DAG executors, not employees. This collapses the moment reality stops looking like the graph.
- **Free-form agent thinking.** No structure at all. Agents are spawned, told to "work on the bet," and given everything. They duplicate work, contradict each other, never know when to stop, and burn cost without producing artifacts.

The 2026 ecosystem has converged on a middle path that this doc adopts: **decentralized handoffs over a shared substrate, with explicit unit primitives and explicit done conditions**. LangGraph Swarm, OpenAI Agents SDK, AG2 Swarm, Claude Subagents, Devin's planner-executor split, Replit Agent 4's parallel task graph — they all rest on the same insight. The model decides when to hand off; the system tracks state and survives crashes; the work has a beginning, a middle, and a known end.

We add three things to this consensus that the ecosystem hasn't fully figured out:

1. **Teams are bound to products, not bets.** They persist. Successive bets pass through the same team and the team accumulates muscle memory.
2. **Decomposition is decentralized and practice-grounded.** There is no central planner. Each agent uses knowledge from its practice (L3) to infer the tasks in its work stream.
3. **Change is first-class, not exceptional.** Bets are *meant* to change as the team learns. Top-down direction and bottom-up learning meet at the bet, not at a planning meeting.

---

## 2. Top-Down and Bottom-Up at the Same Time

Knowledge in a healthy flat company doesn't flow one way. The founders set direction. The people doing the work surface what they're learning. Both flows shape what happens next. The process layer has to make both first-class or it'll degenerate into either a top-heavy command structure or a leaderless drift.

### 2.1 Top-down: vision and focus, not assignments

The founders are the source of *what we're trying to do and why*. That comes through three channels:

- **`PRINCIPLES.md` and `FOCUS.md`** — the long-form vision and the current focus of the factory. Edited by humans through the Coach thread (drafted by the Chief of Staff, approved through Conversations). These are read by every agent at the start of every session as part of L4 context.
- **The Coach Conversation** — the persistent thread where founders shape direction in dialogue with the Chief of Staff. The Chief of Staff distills these conversations into proposed updates to the principles or focus, which loop back through Conversations for approval.
- **The Work view** — when the founder commits a bet, that's a direct top-down signal: "this is what we're doing for the next cycle." The team picks it up and runs.

Top-down does *not* mean the founders dictate tasks. They dictate direction. Tasks emerge from the team, decentralized, grounded in practice knowledge.

### 2.2 Bottom-up: learnings, data, and surfaced insights

The work itself produces signal. Agents notice things. Practices accumulate knowledge. Metrics shift. Customers complain. Bets reveal that the original premise was wrong. All of this needs a path back up to the founders and back into the bets.

- **Practice layer (L3)** is the primary bottom-up channel. As agents work, they capture observations into their practice. Practice Facilitators surface the highest-attention items to the human via the Knowledge view (async curation) and to the Chief of Staff (for cross-product patterns).
- **Bet retros** (see §11) surface what was learned from the cycle into both the Practice layer (knowledge) and the Coach thread (rule changes).
- **Spontaneous escalation** — any agent that notices something it thinks the founders should know about can post a chat thread directly. Agent-initiated chat (from `HUMAN_INTERFACE_LAYER.md` §4.1) is the muscle for this.
- **Bet revision** — the most important bottom-up channel. When the team learns the bet's premise is wrong, the team proposes a revision through the same review-thread mechanism humans use to approve anything else.

### 2.3 The two flows meet at the bet

A bet is the place where direction and learning collide. It starts as a top-down commitment (the founder picked it on the canvas), but the moment work begins it becomes a living thing the team is allowed to reshape — within the discipline of an explicit done condition and an audit trail of changes.

This is the same pattern as a healthy flat company: the vision is set by the founders, the work is shaped by the people doing it, and the *discipline* that keeps it from drifting is making changes visible and reviewed, not preventing them.

---

## 3. The Five Primitives

The process layer rests on five primitives. Everything else in this doc is mechanics on top of these.

### 3.1 Bet

A shaped, committed, time-boxed unit of work owned by a team. Has an explicit done condition. Lives on the Work view before commitment, becomes an active record after.

```
Bet {
  id
  product            # which product this bet belongs to
  team               # the persistent team for that product
  pitch              # the original shaped pitch (markdown + sketches)
  appetite           # 1 week / 2 weeks / 6 weeks — bounded by capacity
  done_condition     # explicit, set at commit, revisable with audit
  hypothesis         # what we believe will be true after this
  status         # current progress: figuring it out / making it happen
  tasks              # list of Task IDs (decentralized, decomposition is dynamic)
  routines_active?   # any recurring routines spawned by this bet
  status             # shaped | committed | in_progress | shipped | killed
  artifacts          # references to what was produced
  thread             # the bet-level conversation thread (optional)
  revision_log       # every change to done_condition or hypothesis, with reasoning
  created_at
  shipped_at?
}
```

A bet is *not* a workflow. It does not encode a sequence of steps. It encodes a *commitment* and the *minimum structure to keep the team honest about it*.

### 3.2 Task

A unit of work picked up by an agent. First-class object with state, owner, dependencies, done condition, cost cap, artifact references, and one or more agent sessions attached.

```
Task {
  id
  bet                # parent bet
  product
  team
  owner              # the agent currently responsible (can change via handoff)
  title
  description        # what success looks like
  done_condition     # task-level, explicit
  state              # proposed | accepted | hold | in_progress | blocked | review | done | killed
  dependencies       # list of Task IDs that must reach `done` first
  sessions           # list of Session IDs — see §3.3
  thread?            # optional discussion thread (only if there's something to talk about)
  artifacts          # files produced or modified (with file leases)
  cost_cap           # max budget for this task
  cost_actual        # running total
  durability?        # null | "checkpoint" | "temporal" | ... — opt-in per task
  risk_tier          # low | medium | high — controls review behavior on completion
  attention_score    # numeric, used for prioritization
  created_at
  updated_at
}
```

The thread on a task is optional. Most tasks don't need one. Threads (chat threads) exist *when there's something to discuss* — a question, a handoff conversation, a clarification, a review. The thread is *attached to* the task, not the same as it. This separates the conversation about the work from the state of the work.

### 3.3 Session

A single agent's run on a task. A task can have many sessions over its lifetime — one agent does an hour of work, hands back, another agent picks it up later, the original agent comes back, etc.

```
Session {
  id
  task               # parent task
  agent              # which agent identity
  started_at
  ended_at?
  state              # active | paused | done | crashed
  workspace_snapshot # pointer to the workspace state at session start
  events             # event stream for this session (for durability replay if enabled)
  cost
  outcome            # made_progress | blocked | completed | handoff | escalated
  notes              # what the agent did, in its own words, written into its memory
}
```

Sessions are how we get **resumability without locking the model into a single long-running process**. A task can be picked up across days. The agent's memory persists between sessions through L2 (its private memory) and the practice (L3). The session is the contract between the task and the durability layer: if a task is `durability: temporal`, then each session is a Temporal workflow execution; if it's null, sessions are just bounded runs with no replay guarantee.

### 3.4 Team

A small group of agents bound to a **product**, not to a single bet. Teams persist for the life of the product. They pick up successive bets, accumulate muscle memory, and dissolve only when the product itself is killed.

```
Team {
  id
  product
  members            # list of agent identities
  lead               # the agent that escalations route to first (typically the Product Manager)
  capacity           # max parallel bets, max parallel tasks per member, max daily cost
  active_bets        # list of currently active bets — usually one, sometimes more
  bets_shipped       # history
  formed_at
  dissolved_at?
}
```

This is the most important deviation from how most agent frameworks think about teams. Frameworks like CrewAI form a Crew per task. We form a Team per product, and the team picks up tasks-via-bets over its lifetime. The reason: **teams that ship together accumulate context**. The brand-voice agent on the Ambrovia team has read every Ambrovia copy artifact for six months. That context is the entire reason it's better than a fresh agent. Dissolving it after one bet throws all of that away.

A team can have agents from multiple practices. The Ambrovia team might include a Product Manager, a Writer, a Copy Reviewer, a Frontend Builder, a Backend Builder, a Growth Analyst — each rooted in their own practice (L3), but operating together as the Ambrovia team. They share the bet, they share file leases on artifacts, they coordinate via threads.

### 3.5 Routine

A recurring trigger attached to a named agent, with persistent state across runs. Calendar-shaped, event-shaped, or heartbeat-shaped.

```
Routine {
  id
  owner              # the named agent that owns this routine
  trigger            # cron expression | event pattern | heartbeat interval
  skill              # the skill to invoke
  done_condition     # what counts as a successful run
  state_key          # how the routine remembers what it did last time
  delegation_allowed # bool — can a teammate with the right skill pick it up if owner is overloaded?
  human_review       # bool — does each run produce a review thread, or is it autonomous?
  autonomy_level     # L1-L4, same scale as skills
  active             # bool
  created_at
  last_run_at?
  next_run_at?
  history            # link to past runs
}
```

The owner is a named agent with persistent state. The Growth Practice Facilitator owns "weekly metrics review." That doesn't mean the GPF runs it every time — it means the GPF holds the *thread of memory* across runs. If the GPF is overloaded and `delegation_allowed: true`, a teammate with the metrics-review skill can pick it up and write back into the GPF's memory state. The muscle memory ("the Growth PF owns metrics") is preserved; the execution can flex.

### 3.6 Why these five and not more

We deliberately don't have:

- **Workflow** — there are no DAGs. Sequences emerge from task dependencies.
- **Plan** — plans are just the current state of a bet's task list. They change.
- **Crew/Squad** — collapsed into Team.
- **Job** — collapsed into Routine.
- **Run** — collapsed into Session.

If something doesn't fit one of these five primitives, the right move is usually to *not build it*, not to add a sixth primitive.

---

## 4. Teams: Persistent, Product-Bound

A team forms when a product is committed to. The Chief of Staff (with founder approval) assembles it from the available agent pool, drawing from the practices. The team includes whoever the product needs — typically a Product Manager (lead by default), one or more Builders, a Reviewer for the product's primary artifact type, and any specialty agents the product calls for (a growth analyst for a B2C product, a sales agent for a B2B one).

### 4.1 Forming a team

Team formation runs through Conversations as a review item. The Chief of Staff drafts the proposed team — these agents, this lead, this capacity — and posts it for the founder's verdict. Approving the team kicks off the product. The team's membership is visible in the Rail and Work view and editable through subsequent review items.

The Chief of Staff considers:
- **Skill match** — does the team have agents with the skills the product will need?
- **Capacity** — is this agent already on another team? An agent belongs to exactly one team. If the agent is needed here, it must leave its current team first (only when its work there is done).
- **Practice diversity** — does the team draw from enough practices that no single discipline is missing?
- **Lead fit** — the Product Manager should match the product's stage (early-shaping vs. mature-iteration is a different muscle).

### 4.2 Persistence and muscle memory

The team persists for the life of the product. Successive bets pass through the same team. The team's *shared knowledge* (L3 fragments specific to this product, not the practice as a whole) lives in a team-scoped slice that every member reads at the start of every session.

This is what makes the second bet faster than the first, and the tenth bet faster than the second. Every shipped bet adds to the team's muscle memory: which assumptions held, which broke, which failure modes are common in this product, which artifacts are reusable.

### 4.3 When teams change

Teams are not frozen. Membership can change between bets, but **an agent never leaves a team while it's working on something**. An agent only leaves when it isn't needed — its current sessions are done, its tasks are handed off cleanly, no routines depend on it from this team.

The legitimate change reasons:

- **Add a member** — a new skill became necessary. Goes through Conversations as a review item.
- **Remove a member** — the agent's skill is no longer needed *and* it has no active work on this team. Same.
- **Replace a lead** — the product's stage shifted and a different facilitator fits better. The old lead doesn't leave the team unless its work is also done; it just stops being the lead.
- **Borrow** — a team can temporarily borrow an agent from another team for a bounded session (cross-team task in a bet, see §8.5). The borrowed agent's "home team" is unchanged; this is for short cross-pollination.

What teams don't do is dissolve at ship. A shipped bet means the team is *between bets* (or has fewer active bets), not gone. The team continues to exist, recurring routines owned by the team's members keep firing, and when the next bet is committed for that product, the team picks it up.

### 4.4 When teams dissolve

Only when the product dissolves. Killing a product is a deliberate founder decision (made through the Coach thread, ratified through Conversations), and dissolving the team is part of the kill ritual. The team's accumulated knowledge is archived into the Practice layer (so the practice keeps the lessons even when the product is gone) and then the team is dissolved.

---

## 5. Bets: Shape, Commit, Change, Ship

### 5.1 Shape

Shaping happens before commitment. A Product Manager (sometimes with the Chief of Staff for portfolio-level bets) writes a pitch — problem, appetite, sketches, rabbit-hole notes, no-gos. The pitch lands on the Work view as a `shaped` card. Pitches accumulate on the canvas during the cycle; only the founder can move them into the betting zone.

Shaping is *not* decomposition. The pitch describes what success looks like, not what tasks will produce it. Decomposition happens *after* commitment, by the team, decentralized.

### 5.2 Commit

The founder drags a pitch into the betting zone on the Work view (`HUMAN_INTERFACE_LAYER.md` §4.3). At this moment:

1. The pitch becomes a Bet object with status `committed`.
2. The team for the product picks it up — the bet is added to the team's `active_bets`. Most of the time this is the team's only active bet (focus is the goal). Sometimes a team carries more than one in parallel — when work doesn't touch all functions, when something urgent has to ship alongside the main thrust, when two independent threads of work both need to move. Multiple parallel bets are allowed but treated as a cost on focus, not a default.
3. The Chief of Staff drafts an explicit `done_condition` based on the pitch and posts it as a review thread for the founder. The founder can approve as-is, edit, or reshape.
4. Once the done condition is approved, the bet moves to `in_progress` and the team begins decomposition.

The `done_condition` is non-negotiable in one sense: the bet is not in `in_progress` until it has one. But it's revisable in another sense: the team can propose changes to it as they learn (see §5.4).

### 5.3 Decompose (decentralized, by the team)

This is the part that most agent frameworks get wrong. They assign decomposition to a planner agent. We don't. **Each team member decomposes the part of the bet that belongs to their work stream**, using knowledge from their own practice (L3) to know what tasks are typical for this kind of work.

Concretely:

1. The bet enters `in_progress`. Every team member is notified through the bet's thread.
2. Each member reads the pitch and the done condition.
3. Each member queries their practice (L3) for the patterns they know about. The Writer queries the writing practice for "what tasks does shipping a landing-page copy bet typically involve?" The Frontend Builder queries the frontend practice. The Growth Analyst queries the growth practice.
4. Each member proposes the tasks they'll own as `proposed` Task objects on the bet, with dependencies on other members' tasks where needed.
5. The Product Manager (the team lead) reviews the assembled task list, dedupes overlap, identifies gaps, and either accepts or asks for revision. This is intra-team — not a human review.
6. Once accepted, tasks move to `accepted` and members begin sessions on them.

This is plan-and-execute, but the *plan* is collectively authored by the team using practice knowledge as the source of patterns. Replanning is expected: as members work, they discover new tasks (added as `proposed`), retire stale ones (moved to `killed`), and revise dependencies. Each change is a small event the team handles internally. The bet's task list is *the current plan*.

The Product Manager does not micromanage. Its role is to keep the bet honest against the done condition and to flag when the team is drifting.

### 5.4 Change (bets are allowed to evolve)

The single most important property of a bet is that it's allowed to change. Pretending bets never need replanning is dishonest, and the Shape Up purist position ("kill it and shape a new one") punishes learning.

So bets can change, with discipline:

- **Done condition revision** — the team realizes the original done condition was wrong (premise broken, scope discovered larger, scope discovered smaller). The Product Manager drafts the revision and the *reasoning*, posts it as a review thread to the founder. Founder approves, comments, requests changes, or rejects (in which case the bet continues toward the original done condition or gets killed). Approved revisions are appended to `revision_log` with timestamp and reasoning.
- **Hypothesis revision** — same mechanism. Changing the hypothesis is changing what we believe will be true after this. Often a sign the bet should pivot.
- **Task graph changes** — internal to the team. The Product Manager handles these without human review unless they're large enough to bump the bet against its appetite.
- **Appetite revision** — extending or contracting the timebox. Always a human review item. Extending is a smell; killing is often the right answer instead.
- **Kill** — sometimes the right answer is to abandon the bet. The Product Manager drafts the kill with reasoning, posts to the founder, and on approval the bet moves to `killed`. The team writes a kill retro into the practice (failures teach more than successes).

The discipline is the *audit trail*. Every change is reviewed and logged. Changes are visible. The point is not to prevent change; it's to keep change honest.

### 5.5 Ship

A bet ships when its done condition is met *and* its high-risk artifacts have passed review.

1. Tasks transition through `in_progress` → `review` → `done`. Tasks tagged risk-tier ≥ medium produce a review thread when they hit `review` (per `HUMAN_INTERFACE_LAYER.md` §7 routing rules).
2. When all tasks are `done` and the Product Manager confirms the done condition is met, the bet transitions to `review`.
3. The bet itself produces a final review thread to the founder summarizing what was done, what was learned, and what artifacts shipped.
4. On founder approval, the bet moves to `shipped`. The team is between bets. The retro process begins (§11).

Shipping is not "all tasks done" — it's "the done condition is met." The two should be the same most of the time, but when they diverge the done condition wins. Teams that ship by completing the task list rather than meeting the condition are gaming themselves.

---

## 6. Tasks and Sessions

### 6.1 Task lifecycle

Tasks move through a small state machine:

- `proposed` — a team member has drafted this task as part of decomposition. Not yet picked up.
- `accepted` — the team lead has accepted it. The owner is committed.
- `hold` — the task has unmet upstream dependencies (other tasks that must reach `done` first). The task cannot start until all dependencies clear. **When the last upstream dependency moves to `done`, the Dependency Watcher automatically transitions this task to `accepted` and notifies the owner.** This is the key automation: no agent or human needs to manually unblock held tasks.
- `in_progress` — at least one session is running or has run. The task has produced some progress.
- `blocked` — the owner is waiting on something external (a human reply, an external service, a design question). Unlike `hold`, this is a runtime block discovered during execution. Blockers are first-class: they show up in the Rail.
- `review` — the task has produced an artifact and is awaiting verdict. For risk-tier ≥ medium tasks, this means a review thread to the human; for low-risk tasks, this means an internal team check.
- `done` — verdict reached, artifact accepted, task closed.
- `killed` — abandoned. Reasoning logged.

The distinction between `hold` and `blocked` is important: `hold` is structural (the task can't start because upstream work isn't done — the system knows this from the dependency graph and resolves it automatically), while `blocked` is situational (the agent started work and hit something it can't resolve alone — requires human or external action).

Transitions are events in the audit trail. The Rail surfaces blocked and held tasks prominently because they're the most actionable signal of friction.

### 6.2 Sessions: many runs per task

A task is not a single agent run. A session is one bounded run by one agent. Many sessions can happen per task:

- Agent A starts a session, makes progress for a while, hits a question, ends the session by writing notes back to the task.
- A human (or another agent) replies hours later.
- Agent A starts a new session, reads its previous notes, continues.
- A teammate picks up the next part. Different agent, new session, same task.
- The original task is paused for two days while a dependency lands. New session resumes after.

Each session is bounded — it has a start, an end, an outcome, and a cost. Session-bounded execution is what keeps long-running tasks tractable: the agent isn't a daemon, it's an employee that comes back to the same desk many times.

#### Session lifecycle and the Knowledge Fabric

Every session has a three-phase lifecycle managed by the Knowledge Fabric (see KNOWLEDGE_ARCHITECTURE.md §4–5):

**1. Materialization (session start).** The Knowledge Fabric queries `knowledge_items` for the slice of knowledge this agent needs — based on task, role, product, and relevance scoring — and writes it as files into the agent's workspace. Three zones: `context/` (read-only reference material: product docs, practices as TOON packs, factory principles), `work/` (session scratch space), `knowledge/` (where the agent can propose changes to the knowledge base). A hidden manifest tracks the version of every materialized item.

**2. Execution (the session).** The agent works normally — reads files, writes files, calls tools, produces artifacts. No sync daemon, no special protocol. The agent doesn't know about SQLite or versions. It just sees a directory of files.

**3. Continuous writeback (during session).** A file watcher monitors the `knowledge/` and `work/` directories throughout the session. When a file is written (after a 500ms debounce), the Knowledge Fabric diffs it against the manifest and writes back to `knowledge_items` incrementally. New files become new knowledge items with status CAPTURED. Artifacts in `work/` are linked to the task. Session notes are persisted as they're written. If a version conflict is detected, per-field last-writer-wins applies for structured data; prose conflicts go to the relevant facilitator. When the session ends (or crashes), a final lightweight pass catches any remaining changes.

This eliminates the fragility of session-end hooks — knowledge flows back to the canonical store within seconds of being written, regardless of how the session terminates. Even if the agent crashes, almost all knowledge is already synced. The worst case is losing the last 500ms debounce window, not an entire session's worth.

#### Session length = the context window

The natural length of a session is the size of the agent's context window. **A session ends when the context is about to compact.** Right before compaction, the agent writes its session notes back to the task — what it did, what it believes, what's next, what to be careful about. The next session starts fresh, reads those notes, and continues.

This is the closest analogy to a working day in a human organization. The context window is the day. Things stay in working memory while the day is on. At the end of the day, you write down what you need to remember for tomorrow. Overnight, the things you didn't write down are forgotten. The next morning you read your notes and pick up where you left off.

Three consequences fall out of this:

- **Session notes should be continuous, not just end-of-session.** The agent writes to `work/session-notes.md` throughout the session as it makes progress — not just at the end. This way, if the session crashes or compaction happens unexpectedly, useful notes already exist. The Knowledge Fabric's continuous file watcher picks up each write incrementally.
- **Where the harness supports it, a pre-compaction trigger fires.** This is part of the Harness Adapter's contract: when the adapter detects context compaction is imminent (via token counting or harness-specific signals), it triggers a final note-writing pass before the session ends. Not all harnesses expose this — for those that don't, the continuous note-writing habit is the fallback.
- **The task object is the real long-term memory of the work.** L2 (the agent's private memory) holds the agent's identity and accumulated style; the task object holds the *current state of this specific job*. Anything not written to the task before compaction is lost from this work stream.

**What matters in session notes is the flight level and description, not the structure.** LLMs are good at writing prose; if we use notes as text (which we do — they're materialized as markdown for the next session to read), then any reasonable way the agent writes them is fine. Don't enforce a rigid template. What matters is guiding the agent on *what* to write about: what was the goal, what happened, what changed, what's next, what should the next session be careful about. The skill package provides defaults for this guidance, but the meta layer doesn't parse the notes structurally.

There's no need for a session-length cap beyond the natural one: when context compaction is imminent, the session ends. Different harnesses with different context sizes will produce different natural session lengths, and that's fine.

### 6.3 Memory across sessions

Three layers of memory bridge sessions on the same task, all mediated by the Knowledge Fabric:

- **L2 (agent's private memory)** — the agent's own notes about what it's doing and what it believes. Stored in `knowledge_items` (`layer='L2'`, `scope_id` = product name). Materialized into `context/` at session start. Survives across sessions for the same agent.
- **The task's notes** — written continuously during the session (synced back via the Knowledge Fabric's file watcher) by whoever was working it. Any session by any agent can read them. This is how agent B picks up where agent A left off, and how agent A picks up tomorrow what it did today.
- **The task's thread** (when it exists) — the conversation around the work. Comments, questions, review feedback. Read on demand, not by default.

The Knowledge Fabric's continuous writeback is what closes the memory loop: everything the agent writes in `knowledge/` (proposed practices, decisions, failures) and `work/` (session notes, artifacts) flows back into the canonical store within seconds, immediately available to the next session — whether by the same agent or a teammate.

This pairing of agent-memory + task-memory is what the Letta sleep-time pattern got right: memory is the substrate, and short bounded runs interact with it. We don't need a persistent process per agent; we need persistent memory and ephemeral sessions.

### 6.4 Durability per task (opt-in)

Most tasks don't need event-sourced durability. A 5-second copy review doesn't need a Temporal workflow. A 4-hour deploy with twenty external API calls absolutely does.

The skill the task uses declares whether it needs durability and which adapter to use. The meta layer ships adapters for the major options (Temporal, Hatchet/Icepick, LangGraph checkpointers, plain none). The task carries the choice through to its sessions: a `durability: temporal` task means each session is a Temporal workflow execution and the agent's tool calls are durable activities.

Defaults:

- Risk-tier `low`, expected runtime `< 5 min` → `durability: null`
- Risk-tier `medium`, runtime `5-30 min` → `durability: checkpoint` (whatever the harness ships)
- Risk-tier `high` or runtime `> 30 min` → `durability: temporal` (or equivalent)

Skill authors can override. This stays consistent with the EXECUTION layer's "durability is optional" position.

### 6.5 Task threads: comments, not chat

The thread on a task is *optional*. Most tasks ship without one. When a thread exists, it's structured like comments on a pull request — annotations, questions, clarifications, review feedback — not like a freeform chat. The task's *state* is on the task object; the thread is the narrative around it.

When a task escalates (blocked, needs human input, needs another agent), the escalation produces a thread message and surfaces in the appropriate view (the Rail for blockers, Conversations for human-needed input). The thread is the conversation; the task is the work.

---

## 7. Decomposition: Practice-Grounded, Decentralized

This section is short but it's the heart of the doc. Most agent frameworks decompose centrally — a planner agent reads the goal and generates the task graph. We don't.

### 7.1 Each agent decomposes their stream

When a bet is committed, every team member reads the pitch and the done condition, and *each one independently proposes the tasks in their work stream*. The Writer proposes copy tasks. The Frontend Builder proposes UI tasks. The Growth Analyst proposes measurement and analytics tasks. The Backend Builder proposes data and API tasks.

Each member uses their practice (L3) as the source of patterns. Practices contain accumulated knowledge about *what tasks typically belong to this kind of work*. The writing practice knows that "ship a landing-page copy" usually involves: research the audience, draft the headline, draft the body, A/B variants, tone review, brand-voice check, accessibility pass, ship. The Frontend practice knows what UI shipping involves. Etc.

This is why the Practice layer matters so much for the process layer. It's not just a knowledge wiki — it's the *source of decomposition patterns* for the agents in that discipline.

### 7.2 The Product Manager integrates

After each member proposes their tasks, the Product Manager integrates the task list:

- Identifies dependencies between members' tasks (X must be done before Y).
- Spots gaps (no one proposed a task for the security review and the bet needs one).
- Spots overlap (two members proposed the same task; assign one).
- Confirms the integrated list will reach the done condition.

The Product Manager is *not* decomposing on behalf of the team. It's editing the team's collective decomposition. If it has to add tasks the team didn't propose, that's a signal the team's practice knowledge is missing something — and the missing piece becomes a Practice item to capture.

### 7.3 Replanning is normal — facilitator judgement decides when humans get pulled in

Decomposition is not a one-shot event. As work progresses, team members discover new tasks (added as `proposed`), retire stale ones, and revise dependencies. Each change is small and handled internally. The plan is *the current state of the task list*, not a separate document.

The question of "when does a replanning event become big enough to need a human in the loop" is **the Product Manager's judgement call**. The facilitator is watching the trajectory of the bet — what the team is doing, what they're learning, how the task graph is evolving — and notices when the trajectory has shifted in a way the founder should know about. When it has, the facilitator drafts a review thread for the human and posts it.

We deliberately don't define a numerical threshold for this ("more than 3 new tasks added per day → human review"). Numerical thresholds invent the wrong incentives. The facilitator's job is to feel the trajectory and decide when to surface it. As facilitators get better at the call (and as the human approves or pushes back on the calls they make), the judgement sharpens. This is how trust gets built between the facilitator and the founder over time.

The things that *always* surface to the human, no judgement required:

- A change to the bet's `done_condition`.
- A change to the bet's `hypothesis`.
- A change to the bet's `appetite`.
- A proposal to kill the bet.
- Any cross-team task that lands in or out of the bet.

Everything else is the facilitator's call. The audit trail captures every change so the founder can always look back if a call surprises them in retrospect.

### 7.4 Why this matters

Centralized decomposition has two failure modes: the planner doesn't know the discipline well enough to decompose accurately (most common), or the planner over-decomposes and produces a bureaucratic task list nobody can actually work from (also common).

Decentralized decomposition by practice-grounded specialists matches how actual flat-company teams work. The writer knows what writing tasks look like; the engineer knows what engineering tasks look like; the integrator's job is to weave them together, not to specify them.

---

## 8. Handoff: The Coordination Primitive

The 2026 ecosystem converged on handoff as the coordination primitive: an agent has a `transfer_to_X` tool, calls it, and the system tracks the active agent on the thread. We adopt this directly, inspired by Google's A2A (Agent-to-Agent) protocol's design: structured handoff messages with context IDs, explicit task states, and message parts.

### 8.1 Handoff protocol (A2A-inspired)

Every handoff is a structured message, not just a "transfer_to" call. The protocol borrows from A2A's JSON-RPC model but keeps it simpler — we don't need discovery or capability negotiation because all agents are known to the factory.

**Handoff message structure:**

```
handoff {
  context_id         # links this handoff to the task + thread (continuity across handoffs)
  from_agent         # who is handing off
  to_agent           # who receives (agent_id, 'human', or role like 'builder')
  task_id            # the task being worked
  reason             # why: 'phase_complete', 'skill_needed', 'blocked', 'escalation'
  status             # what the hander-off is reporting: 'working', 'completed', 'failed', 'canceled'
  message            # freeform context for the receiving agent
  artifacts          # list of file references produced so far
  remaining_work     # structured description of what's left
  created_at
}
```

**Task states in the handoff** (inspired by A2A):

- `working` — "I made progress but the task isn't done; pick up where I left off."
- `completed` — "My part is done; the next phase needs a different skill."
- `failed` — "I couldn't complete this; here's what went wrong."
- `canceled` — "This work is no longer needed" (rare; usually the task is `killed` directly).

The `context_id` is the thread ID on the task. Every handoff is also a thread message, so the full history of who handed off what to whom — with structured metadata, not just chat text — is preserved and readable by any participant.

### 8.2 Handoff inside a task

When an agent is working a task and needs to hand off, it:

1. Writes session notes about what it did and what's next (synced back via the Knowledge Fabric's file watcher).
2. Calls the `handoff` tool with a structured handoff message (status, reason, remaining work, artifacts).
3. The session ends; the new agent is set as the task's `owner`; the handoff message is written to the task's thread; the new agent receives a notification.
4. The new agent starts a session, reads the previous session's notes, the handoff message, and the task thread, and continues.

The `to_agent` can be a specific agent ID or a **role** (e.g., "builder", "growth-marketer"). If a role is specified, the team's facilitator (Product Manager) resolves it to the best available agent with that skill and capacity.

No supervisor decides the handoff itself. The agent decides. Same pattern as LangGraph Swarm or OpenAI Agents SDK handoffs. But the handoff message is structured, not just a string — making it parseable by the receiving agent and auditable by the facilitator.

### 8.3 Handoff between tasks

When a task completes and another task's last upstream dependency clears, the Dependency Watcher transitions the downstream task from `hold` to `accepted` and notifies the owner through its thread. The owner can then start a session. Dependency-chain progression is automatic; no central scheduler decides when to unblock — the state machine handles it.

The upstream task's completion produces a handoff message with status `completed` and the relevant artifacts, which the downstream task's owner can reference.

### 8.4 Handoff to a human

When an agent needs human input it can't proceed without, it produces a handoff with `to_agent: 'human'` and `reason: 'blocked'`. The task moves to `blocked`. When the human replies, the task can move back to `in_progress` and the agent starts a new session.

Handoff to a human is the same shape as handoff to another agent — a structured message on the thread and a state change. Humans are identities in the matrix.

### 8.5 Handoff is not workflow

Workflow engines wire transitions in advance. Handoff is decided at runtime by the agent that's closest to the work. The thread + structured handoff messages are what make this safe: the entire history of who handed off what to whom, with what status and artifacts, is preserved and any participant can read it.

### 8.6 Cross-team work: chat thread + cross-team tasks

Sometimes a bet needs work from a team that isn't the bet's owning team. The most common case is a **platform team** — a team whose product is a shared substrate (auth, billing, design system, infrastructure) that other product teams rely on. The Ambrovia team's bet might need a new endpoint from the platform team. The Nimmly team might need a new component from the design-system team.

The protocol is deliberately lightweight:

1. The requesting team's lead opens a **chat thread** to the providing team's lead (same Conversations infrastructure as everywhere else; team leads are just identities in the matrix). The chat explains what's needed, why, and the appetite.
2. If the providing team agrees to take it on, they add a **cross-team task** to the requesting team's bet. The task's `owner` is an agent from the providing team, not the requesting team. The task lives on the requesting bet (so the bet's done condition tracks it) but the work happens inside the providing team's capacity and rhythm.
3. The providing team treats the cross-team task like any other task — sessions, notes, handoffs, the lot. When done, the artifact lands where the requesting bet expects it and the cross-team task transitions to `done`.
4. If the providing team declines or pushes back on the appetite, the chat thread is the negotiation surface. If it can't resolve, escalate to the Coach thread.

Cross-team tasks should be the exception, not the default. **The goal is product teams with end-to-end ownership.** If a product team is constantly opening cross-team tasks, that's a smell — either the product team is missing a skill it should have on roster, or the platform team's interface is too low-level for the product team to consume. Either is a Practice item to surface and a possible team-membership change.

Platform teams are the legitimate exception: a billing team or a design-system team's whole job is to be depended on by other products. Those teams have a high cross-team task rate by design. For every other team, the rate should approach zero.

---

## 9. Recurring Routines

Routines are how recurring work attaches to the factory. They are the mechanism for "weekly metrics review," "every Monday morning portfolio standup," "every PR triggers a copy review," "every hour the cost sentinel checks burn rate."

### 9.1 Three trigger shapes

- **Calendar (cron-shaped).** "Every Monday at 9am." "First of the month at 7am." Standard cron expressions.
- **Event-shaped.** "When an artifact of type `landing-page-copy` is published, run brand-voice review." Routines react to events emitted by other parts of the factory.
- **Heartbeat-shaped.** "Every hour, check cost burn." Continuous low-frequency loops. Equivalent to Letta's sleep-time agents in spirit.

### 9.2 Owned by a named agent, executable by teammates

Every routine has an owner — a specific named agent. The owner holds the *thread of memory* for the routine. The Growth Practice Facilitator owns "weekly metrics review," which means the GPF's memory contains "what I noticed last week, what I'm watching, what I want to check this week."

If `delegation_allowed: true`, a teammate with the same skill can pick up an execution when the owner is overloaded. The teammate writes back into the owner's memory state when finished. The muscle memory of "the GPF owns metrics" is preserved; the execution can flex with capacity.

If `delegation_allowed: false`, only the owner can run it. Some routines need the owner specifically (the Chief of Staff's monthly portfolio review, for example).

### 9.3 Sleep-time routines: memory-only runs

A routine can run as a sleep-time pass that updates the agent's memory without producing a thread or a review item. This is how an agent stays current on context that doesn't need a verdict.

Example: a "watch the brand-voice channel" routine runs every hour, summarizes new examples into the brand-voice agent's memory, and produces no thread. The agent is just... staying read-up. When it needs to ship a copy review, its memory is current.

This pattern is borrowed from Letta's sleep-time agents and is one of the most underused patterns in the 2026 ecosystem. It's how you get "always-current context" without paying for an always-running daemon.

### 9.4 Adding a routine (human-approved)

Routines are powerful and they compound. A misconfigured routine can burn cost forever silently. So **adding a routine is always a human review item**, the same way adding a skill is. The Chief of Staff or the routine's would-be owner drafts the routine, posts a review thread to the human, and on approval the routine becomes active.

Each routine carries an autonomy level (L1-L4). At L1, every run produces a review thread. At L4, runs are autonomous unless the routine explicitly blocks. Autonomy levels move up over time as the routine earns trust, same mechanism as skills.

### 9.5 Pruning routines

Routines drift. A weekly metrics review made sense for a product that was finding its footing; six months in it might be cargo cult. The Knowledge view view shows all active routines the human could prune. The Chief of Staff also flags routines that haven't produced anything actionable in a long time as candidates for retirement.

---

## 10. WIP and Cost Limits

The single cheapest way to ruin an agent factory is to spawn unbounded parallel work. Three levels of caps, nested: agent < team < factory.

### 10.1 Per agent

Each agent has a maximum number of in-progress sessions (WIP limit, default: 3) and a **cost cap** (daily or per-cycle budget). When an agent hits its WIP limit, new task assignments queue or get reassigned to a teammate. When an agent hits its cost cap, the agent stops accepting new sessions and finishes in-progress work.

### 10.2 Per team

Each team has a maximum number of parallel tasks (default: team size × 2), a soft preference for one active bet at a time, and a **team cost cap** (the sum of all agent cost caps on the team, plus a team-level overhead budget for facilitator work). Multiple parallel bets are allowed but tracked as a *cost on focus*, surfaced in the Rail.

**When the team cost cap is reached, the team stops.** All agents on the team finish their current in-progress sessions but accept no new work until the next budget cycle or the cap is raised. A review thread fires to the founder.

Cost is allocated concurrently across agents within a team — each agent draws from its own cap, and the team cap is the ceiling on the aggregate. Smart defaults: equal splits across agents, with the Product Manager getting a smaller share (facilitator work is cheaper than build work).

### 10.3 Per factory

The factory has a **factory cost cap** (the sum of all team caps, plus a factory-level overhead budget for Chief of Staff routines and cross-product work). The Cost Sentinel (a heartbeat routine owned by the Chief of Staff) monitors burn rate.

**When the factory cost cap is reached, everything stops.** All teams finish in-progress sessions but accept no new work. Critical ops tasks (e.g., incident response) are not killed mid-session but cannot start new sessions either — they resume when the budget resets or the cap is raised. A review thread fires to the founder.

The hierarchy is strict: an agent cannot exceed its cap even if the team has headroom. A team cannot exceed its cap even if the factory has headroom. This prevents any single actor from consuming disproportionate resources.

### 10.4 What happens when limits hit

Hitting a limit produces a thread item, not a silent drop. The agent or team gets a review item in Conversations (or a flag in the Rail) explaining what was capped and asking for guidance. This makes capacity visible and forces the founder to either raise the cap (and accept the cost) or accept the throttling.

The opposite — silent dropping — is the failure mode of every agent system that "scales smoothly." It also makes diagnosis impossible.

### 10.5 Budget cycles and defaults

Cost caps reset on a configurable cycle (default: daily). The factory ships with conservative smart defaults: $X/day per agent (configurable), team caps derived from team composition, factory cap derived from team caps. The founder can override any level. All caps are stored in the Primitive Store and editable via the Settings view.

---

## 11. Retros and Reviews: Learning Flows Back Up

Every shipped (or killed) bet produces learning. The job of the process layer is to make sure the learning gets *captured* and *reaches the right place*.

### 11.1 Bet retro (every ship or kill)

When a bet hits `shipped` or `killed`, the Product Manager drafts a retro:

- What was the original hypothesis? Did it hold?
- What surprised us?
- What patterns showed up that the practice should know?
- What rule about how the factory operates should change?
- What artifacts are reusable in future bets?

The retro is posted to the bet's thread. It then routes to two places:

1. **The Practice layer** — the patterns and surprises become Practice items (CAPTURED → eventually ACTIVE), curated by the practice facilitators and the human via the Knowledge view.
2. **The Coach thread** — the rule-shaped insights ("we keep underestimating brand-voice review effort") become Coach thread items for the founder to chew on. If they translate into a `PRINCIPLES.md` change, the Chief of Staff drafts the edit and routes back through Conversations for approval.

### 11.2 Cycle retro (monthly)

Once a month the Chief of Staff drafts a portfolio-level retro that aggregates across all active products. Cross-product patterns, recurring obstacles, capacity observations, cost trends. This lands in the Coach thread.

### 11.3 Practice contribution loop (continuous, agent-driven)

The biggest learning channel isn't retros — it's the continuous contribution every agent makes to its own practice as it works. This is what keeps the team in sync with the practice without anyone having to push notifications.

The loop:

1. **As an agent works a session**, it accumulates findings — patterns it noticed, things that worked, things that didn't, snippets that should be reusable, things its practice doesn't know yet but should.
2. **At the next practice session** (each practice has its own rhythm — typically weekly), the practice "meets" in a structured three-turn conversation:
   - **Turn 1 — Propose.** Every agent in the practice posts the findings it accumulated since the last session. Each finding is a candidate knowledge item — could become practice knowledge, could become product knowledge, could be noise.
   - **Turn 2 — React.** All agents see the full set of proposals and comment with their own context and relevance: "we saw the same thing in Ambrovia," "this contradicts what we learned last month," "this is product-specific, not practice-level." This cross-pollination is where the real value emerges.
   - **Turn 3 — Synthesize.** The Practice Facilitator reads all proposals and reactions, then decides: which findings become CAPTURED practice items (L3), which get routed to product knowledge (L2), which are noise. The facilitator writes the resulting items back to `knowledge_items`.

   Not all findings become practice knowledge. Plenty will be product-specific and route to L2 instead of L3. The facilitator's job is to make that call.
3. **The Knowledge view** (the human surface, async) is where the human curates what the practice produced — prioritizes the agenda, flags items that look off, prunes the tree when it gets messy.
4. **When a team member starts a task session**, the Knowledge Fabric materializes the relevant practices into the workspace's `context/practices/` directory as TOON packs. Anything new the practice has decided since the last session is now available — automatically, no notification needed. The team is in sync with the practice because every member's workspace is materialized fresh from the same canonical `knowledge_items` store.

This is how knowledge actually flows in a healthy flat company. People in a discipline meet regularly, share what they learned, decide what's worth keeping, and then carry that knowledge back into their work. There's no broadcast "the practice has updated" notification — the knowledge is just *there* the next time the Knowledge Fabric materializes a workspace. The materialization step is what makes the loop close.

The implication for the team: the team stays current on its practice because every team member is also a practice member. The practice is not a wall; it's the substrate that team members swim in between sessions. A team member who shows up to a task session has already absorbed (through its practice membership) whatever the practice has decided since the last task session.

### 11.4 Practice review (weekly, async, by humans)

The Knowledge view view (`HUMAN_INTERFACE_LAYER.md` §4.4) is where the human prunes and shapes the practice each week. This is the recurring counterweight to AI-only drift, and it complements the agent-driven contribution loop above. Agents contribute and discuss; humans prune and shape.

### 11.5 Why retros are not optional

Retros are the bottom-up signal path. Without them, the team learns (in its own memory) but the practice doesn't, the founder doesn't, and the next bet repeats the same mistakes from a different team. Retros are a routine on the Product Manager: they fire automatically when a bet ships or is killed and they cannot be skipped.

---

## 12. What the Meta Layer Ships at This Layer

To be deployable for anyone (per the EXECUTION layer constraint), the meta layer ships:

1. **The five primitive object stores.** Bet, Task, Session, Team, Routine. SQLite by default; swappable. The schemas in §3 are the contracts.
2. **A small task scheduler** that watches dependency graphs and notifies owners when their tasks are unblocked. Not a workflow engine — a dependency-aware notifier.
3. **A routine scheduler** that fires calendar / event / heartbeat triggers and starts sessions for the right agents (with delegation logic).
4. **A handoff helper** — a small library that wraps the `handoff` tool call into structured handoff messages (context ID, status, reason, artifacts, remaining work) and ownership changes on the task. Writes to the thread and updates task state. Reusable across harnesses.
5. **A team formation helper** — given a product spec and the available agent pool, propose a team. Used by the Chief of Staff when bootstrapping a new product.
6. **Durability adapters** — pluggable wrappers around Temporal, Hatchet/Icepick, LangGraph checkpointers, and a no-op default. Skills declare which one they need.
7. **Decomposition helpers** — utility functions agents call to query their practice for "what tasks does this kind of bet typically involve?" Not a planner, just a knowledge query.
8. **WIP and cost meters** — observability and enforcement at agent / team / factory levels. Threshold breaches produce thread items.
9. **Retro templates** — markdown templates the Product Manager fills in at ship/kill, wired to route to Practice and the Coach thread.
10. **A small CLI** for inspecting bets, tasks, sessions, teams, and routines. Useful for headless deployers and for debugging.

Everything else is downstream of this. The meta layer's job is the primitives, the schedulers, the adapters, and the helpers — not the agent runtime, not the orchestration engine.

---

## 13. What This Layer Is Not

To prevent scope creep:

- **Not a workflow engine.** No DAGs. Sequences emerge from task dependencies and handoffs, not from a graph editor.
- **Not a project tracker.** Tasks have state, but the goal is *agents finishing work*, not human stakeholders watching progress. The Rail is the human view.
- **Not a backlog.** Pitches are on the canvas; tasks are inside committed bets; nothing accumulates in a "later" pile.
- **Not a planner.** Decomposition is decentralized and lives with the team members. The Chief of Staff is not a central planner.
- **Not the agent runtime.** Sessions execute on whatever harness the deployer chose. We coordinate them; we don't run them.
- **Not the durability substrate.** We adapt to Temporal/Hatchet/etc.; we don't reimplement them.
- **Not Jira.** If someone asks "where are the sprint reports," we've lost.

---

## 14. Decisions (formerly Open Questions)

- **No platform team.** There is no separate platform team. HyperIdle itself is a product, developed by a product team using HyperIdle — dogfooding its own framework. The "platform exception" to end-to-end ownership is not needed.
- **Routine migration.** An agent cannot leave a team while it has routines attached. Routines must be reassigned to a teammate with the right skill, or retired via a review item to the founder, before the agent can depart.
- **Product Manager trajectory assessment.** The Product Manager reads task comments and notes to sense progress. No hardcoded signal set or numerical thresholds. Analytics (cost burn slope, blocker frequency, etc.) can be layered in later once the base system is running.
- **Team membership changes.** The Product Manager (team facilitator) requests changes on behalf of the team via Conversations to the Chief of Staff. The Chief of Staff assesses the right team setup and proposes to the founders for approval.
- **Heartbeat granularity.** Minimum resolution roughly hourly, not sub-minute. Exact granularity determined during implementation.
- **Cross-product routine ownership.** The Chief of Staff owns routines that observe patterns across products (e.g., portfolio-level Cost Sentinel).

---

## 15. Inspirations

**For decentralized handoff coordination:** LangGraph Swarm, OpenAI Agents SDK handoffs, AG2 Swarm, Anthropic Claude Subagents. The shared insight: handoff beats supervision for non-trivial multi-agent work.

**For durable execution:** Temporal (the canonical implementation), Restate (transactional Virtual Objects), Hatchet/Icepick (zero-cost durability for agents), LangGraph Platform's managed checkpointers, Trigger.dev v3's checkpoint-resume.

**For session-bounded long-running work:** Devin's planner-executor split with incremental progress sessions, Cursor Background Agents' fresh-VM-per-run model, Replit Agent 3/4's parallel task graph.

**For sleep-time agents and memory continuity:** Letta's sleep-time agents and shared-memory primary/background pattern, Claude Agent SDK's initializer + coding agent split.

**For team formation and persistence:** real flat-company team patterns, Shape Up's "small team for the cycle" (which we extend to "small team for the product"), Basecamp's team-per-product norm.

**For decentralized practice-grounded decomposition:** the way actual high-functioning specialist teams plan together, Toyota Production System's "the people doing the work design the work," Agile's notion that the team estimates not the manager.

**For recurring routines on stateful identities:** Claude Code `/loop` and `/schedule`, Hermes Agent cron, Temporal schedules, Inngest cron + AgentKit.

**For top-down + bottom-up flow:** how knowledge moves in successful flat companies, the "leading from any chair" pattern, Shape Up's appetite-and-pitches dialogue between shapers and builders.

**For WIP and cost discipline:** Kanban's WIP limits (the entire field of which we shamelessly borrow), prepaid-credit cost models from the agent ops space (AgentPatch, etc.), classical FinOps practices applied to LLM spend.

**Critiques that shaped what we *don't* build:** centralized-planner failure modes (CrewAI hierarchical), workflow-DAG rigidity, Crew-per-task amnesia (throwing away muscle memory after every cycle), unbounded parallelism with no caps, silent rate-limiting that hides failures.
