# Tasks and Sessions

<!-- @source framework/db/src/schema.ts -->
<!-- @source layers/core-api/src/routes/tasks.ts -->

## 1. Task lifecycle

Tasks move through a small state machine — the eight states of `TASK_STATES` (`framework/domain-model/src/types.ts`):

- `proposed` — a team member has drafted this task. Not yet picked up.
- `accepted` — the team lead has accepted it. The owner is committed.
- `hold` — the task has unmet upstream dependencies (other tasks that must reach `done` first). The task cannot start until all dependencies clear. **When the last upstream dependency moves to `done`, the dependency watcher (`checkAndUnblockDependents`, `layers/core-api/work/src/dependency-watcher.ts`) automatically transitions this task to `accepted` and notifies the owner.** This is the key automation: no agent or human needs to manually unblock held tasks.
- `in_progress` — at least one session is running or has run. The task has produced some progress.
- `blocked` — the owner is waiting on something external (a human reply, an external service, a design question). Unlike `hold`, this is a runtime block discovered during execution. Blockers are first-class: they surface in the WorkTeam AgentRow health indicators.
- `review` — the task is awaiting a human verdict. A task reaches `review` only if it **asked** to, via `needsReview` (see §1.1); otherwise finished work closes straight to `done`.
- `done` — the work is finished. Reached either because the task closed on its own (the ordinary case) or because a reviewer accepted it.
- `killed` — abandoned. Reasoning logged. Killing is a **subtree** operation: moving a
  task to `killed` through `PATCH /api/tasks/:id` kills every task beneath it and stops
  their running sessions (`cascadeTaskKill`). A kill only ever travels DOWN — it never
  climbs to the parent, and never touches a sibling.

## 1.1 How a task finishes: `done` by default, `review` on request

A task finishes by going to **`done`**. It goes to **`review`** only when it asked to — the boolean
`tasks.needs_review`, default `false`, settable on create and through `PATCH /api/tasks/:id` and the
agent tool, by a person or an agent alike.

One rule, applied in both places work can finish (`lifecycle-propagation.ts`):

| What happened | `needsReview` false | `needsReview` true |
|---|---|---|
| A session on the task ended | task → `done` | task → `review` |
| Every child reached a terminal state (`done`/`killed`) | parent → `done` | parent → `review` |

**Why the flag exists.** Before it, *every* task went to `review` when its session ended. Review was a
queue nobody could keep up with, so it meant nothing. Opting in is what makes the queue mean something.

**Why a boolean and not a risk tier.** The product used to carry `riskTier` on a
`task_planning_signals` table. That table was deleted, and docs describing it were stale for a long
time. Reviving a three-value scale would mean inventing how risk gets estimated, and nothing estimates
it today. A flag something sets beats a scale nothing computes — and the flag is the seam a derived
risk signal can later feed.

**The consequence is the point.** With most tasks closing to `done`, completion cascades all the way up
a tree by itself: child done → parent done → grandparent done. A task marked `needsReview` is where the
chain deliberately stops until a person acts. `done` and `review` are both reachable from every
non-terminal state, because a container task nobody personally worked otherwise has no legal path to
either — which is exactly how an earlier version of this rule died silently at the first such parent.

**A kill is not progress.** `cascadeTaskKill` marks its transitions, and completion propagation ignores
them. Without that, killing a subtree raced its own completion — ancestors were marked `done`, stamping
a completion timestamp on cancelled work, moments before the cascade killed them.

The distinction between `hold` and `blocked` is important: `hold` is structural (the task can't start because upstream work isn't done — the system knows this from the dependency graph and resolves it automatically), while `blocked` is situational (the agent started work and hit something it can't resolve alone — requires human or external action).

> **Vocabulary note.** The lower-case `blocked` workflow state described here is unrelated to the upper-case `Block` content primitive (see [`docs/blocks/`](../blocks/index.md)). They share the English word "block" and nothing else.

Transitions are events in the audit trail (`tasks.auditTrail`). WorkTeam AgentRow health indicators surface blocked and held tasks prominently because they're the most actionable signal of friction.

How state changes propagate up the task tree and how work moves between owners is covered in [handoff and lifecycle propagation](handoff-and-lifecycle-propagation.md).

## 2. Sessions: many runs per task

A task is not a single agent run. A session is one bounded run by one agent (`sessions.taskId` FK, `framework/db/src/schema.ts`). Many sessions can happen per task:

- Agent A starts a session, makes progress for a while, hits a question, ends the session by writing notes back to the task.
- A human (or another agent) replies hours later.
- Agent A starts a new session, reads its previous notes, continues.
- A teammate picks up the next part. Different agent, new session, same task.
- The original task is paused for two days while a dependency lands. New session resumes after.

Each session is bounded — it has a start, an end, an outcome, and a cost. Session-bounded execution is what keeps long-running tasks tractable: the agent isn't a daemon, it's an employee that comes back to the same desk many times.

### Session Lifecycle And Knowledge Services

Every session has a three-phase lifecycle managed by agent-layer provisioning and Core knowledge services:

1. **Context assembly (session start).** The agent layer writes the agent's knowledge slice as files into the session sandbox: read-only `context/` (factory, product, practices), `work/` (scratch space, artifacts, notes), `knowledge/` (where the agent proposes changes), plus a hidden `.fabric/manifest.json` tracking the version of every assembled item.
2. **Execution.** The agent works on plain files — no sync daemon, no special protocol.
3. **Continuous writeback.** Writeback syncs `knowledge/` and `work/` back to the canonical store throughout the session. New files become CAPTURED knowledge items; a crash loses at most the debounce window, not the session.

Watcher, debounce, writeback rules, and conflict resolution are owned by [sync and conflict resolution](../knowledge-architecture/sync-and-conflict-resolution.md).

### Session length = the context window

The natural length of a session is the size of the agent's context window. **A session ends when the context is about to compact.** Right before compaction, the agent writes its session notes back to the task — what it did, what it believes, what's next, what to be careful about. The next session starts fresh, reads those notes, and continues.

This is the closest analogy to a working day in a human organization. The context window is the day. Things stay in working memory while the day is on. At the end of the day, you write down what you need to remember for tomorrow. Overnight, the things you didn't write down are forgotten. The next morning you read your notes and pick up where you left off.

Three consequences fall out of this:

- **Session notes should be continuous, not just end-of-session.** The agent writes notes throughout the session as it makes progress — assembly creates `work/task-notes.md` by default, and `work/session-notes.md` is synced too. If the session crashes or compaction happens unexpectedly, useful notes already exist; writeback picks up each write incrementally.
- **Where the harness supports it, a pre-compaction trigger fires** — a final note-writing pass before the session ends (builtin adapter: 0.8 context fraction → `pre_compaction` event + snapshot into notes, `layers/agent-execution/harness-registry/src/builtin-harness-adapter.ts`). Harnesses without the capability rely on the continuous-notes fallback. The capability flag and adapter contract are owned by the [harness capability descriptor](../agent-layer/harness-capability-descriptor.md).
- **The task object is the real long-term memory of the work.** The agent's private memory holds identity and accumulated style; the task object holds the *current state of this specific job*. Anything not written to the task before compaction is lost from this work stream.

**What matters in session notes is the flight level and description, not the structure.** Notes are free-form prose, assembled as markdown for the next session to read — never structurally parsed. Don't enforce a rigid template. Guide the agent on *what* to write about: what was the goal, what happened, what changed, what's next, what should the next session be careful about.

There's no need for a session-length cap beyond the natural one: when context compaction is imminent, the session ends. Different harnesses with different context sizes produce different natural session lengths, and that's fine.

## 3. Memory across sessions

Three layers of memory bridge sessions on the same task, all mediated by Core knowledge services:

- **L2 (agent's private memory)** — the agent's own notes about what it's doing and what it believes. Stored as knowledge items whose layer lives on the `knowledge_app_projection` extension table (`framework/db/src/schema.ts`). Assembled into `context/` at session start. Survives across sessions for the same agent.
- **The task's notes** (`tasks.notes`) — written continuously during the session (synced back via the file watcher) by whoever was working it. Any session by any agent can read them. This is how agent B picks up where agent A left off, and how agent A picks up tomorrow what it did today.
- **The task's thread** (when it exists) — the conversation around the work. Comments, questions, review feedback. Read on demand, not by default.

Continuous writeback closes the memory loop: everything the agent writes in `knowledge/` (proposed practices, decisions, failures) and `work/` (session notes, artifacts) flows back into the canonical store within seconds, immediately available to the next session — whether by the same agent or a teammate.

Memory is the substrate; short bounded runs interact with it. No persistent process per agent — persistent memory and ephemeral sessions.

## 4. Task threads: comments, not chat

The thread on a task is *optional* (`tasks.threadId` nullable FK). Most tasks ship without one. When a thread exists, it's structured like comments on a pull request — annotations, questions, clarifications, review feedback — not like a freeform chat. The task's *state* is on the task object; the thread is the narrative around it.

When a task escalates (blocked, needs human input, needs another agent), the escalation produces a review item routed to a thread and surfaces in Conversations. Blockers also appear in the WorkTeam AgentRow health indicator. The thread is the conversation; the task is the work.
