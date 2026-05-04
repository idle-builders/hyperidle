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

> **Vocabulary note.** The lower-case `blocked` workflow state described here is unrelated to the upper-case `Block` content primitive (see [`docs/BLOCKS.md`](BLOCKS.md)). They share the English word "block" and nothing else.

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
