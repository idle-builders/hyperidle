# The Four Primitives

The process layer rests on four primitives — **Task, Session, Team, Routine**. Everything else in this folder is mechanics on top of these. This doc is the front door: why the layer exists, the two directions work flows, the four shapes as shipped, and the layer's boundaries.

> **BB1 (2026-08-30): Bet and Task merged into one recursive Task.** There were five primitives. A bet and a task turned out to be almost the same row — same team, same description, same done condition, same status, same outcome verdict — separated by *position* rather than shape: a bet on top, a task one level under it, with the two levels hardcoded from the NOT NULL `bet_id` up to the URL. Work does not come in two sizes. A task now has a goal and may have subtasks, to any depth; a bet is simply a task with no parent. Founder framing: *"I want everything to be a task but a task can have subtasks and that subtask again subtasks and so on. Each task always has a goal."*

---

## 1. Why a dedicated process layer

Two failure modes bracket the design space:

- **Workflow-engine thinking.** Treat the factory as a DAG of nodes. Every transition is wired in advance; adding a step means editing the graph. Agents become DAG executors, not employees. It collapses the moment reality stops looking like the graph.
- **Free-form agent thinking.** No structure at all. Agents are spawned, told to "go work on it," and given everything. They duplicate work, contradict each other, never know when to stop, and burn cost without producing artifacts.

The middle path this layer implements: **decentralized handoffs over a shared substrate, with explicit unit primitives and explicit done conditions.** The model decides when to hand off; the system tracks state; the work has a beginning, a middle, and a known end. No DAG engine exists anywhere in the repo — sequencing is `tasks.dependencies` plus the handoff protocol.

Three commitments distinguish it, all implemented:

1. **Teams persist.** A team is the durable unit, not a per-task crew. Product merged 1:1 into Team (U1: the `teams` table is the former `products` table). Successive pieces of work pass through the same team and it accumulates muscle memory. See [teams.md](teams.md).
2. **Task planning is decentralized and strategy-driven.** No central planner service. Tasks emerge from agent and strategy work; the work service (`layers/core-api/work/`) coordinates state without encoding a step sequence.
3. **Change is first-class, not exceptional.** Work is meant to change as the team learns — including its goal. Any task is editable through one door by whoever is closest to it, human or agent, and every change lands in the task's audit trail.

---

## 2. Top-down and bottom-up at the same time

Knowledge in a healthy flat company doesn't flow one way. The founders set direction; the people doing the work surface what they learn. The process layer makes both first-class.

### 2.1 Top-down: vision and focus, not assignments

- **`PRINCIPLES` and `FOCUS`** — canonical L4 knowledge items. Context assembly fetches all L4 items from `knowledge_items` and writes them into the session sandbox. (There is no git export — see [facilitators](../knowledge-architecture/facilitators.md).) Edited by humans through the assistant thread and approved through Conversations.
- **The assistant conversation** — the persistent thread where founders shape direction in dialogue with the assistant; the assistant distills it into proposed updates that loop back through Conversations for approval.
- **Creating a root task in the Work view** — a direct top-down signal: "this is what we're doing next."

Top-down means direction, never task assignment. Tasks emerge from the team.

### 2.2 Bottom-up: learnings, data, surfaced insights

- **The practice layer (L3)** is the primary channel: agents capture observations into their practice; facilitators surface the highest-attention items via the Knowledge view. See [../knowledge-architecture/facilitators.md](../knowledge-architecture/facilitators.md) and [../knowledge-architecture/the-five-layers.md](../knowledge-architecture/the-five-layers.md).
- **Task retros** record what was learned and create a knowledge item. The retro is a **plugin skill** (`plugins/knowledge-management/skills/post-task-retro/`), not core machinery — it fires when a task reaches `done`. See [routines-and-retros.md](routines-and-retros.md).
- **Agent-initiated chat** — any agent that notices something the founders should know can post a thread directly. See [../human-interface-layer/thread-primitive.md](../human-interface-layer/thread-primitive.md).
- **Revising the goal** — when the team learns a task's premise is wrong, it edits the goal directly; the audit trail carries the change and its reasoning.

### 2.3 The two flows meet at the task

A root task starts as a top-down commitment and evolves as the team learns; the subtasks under it come from the people and agents doing the work.

---

## 3. The four primitives

**Producer rule for Artifacts.** Tasks are the unique producers of Artifacts: `artifacts.producingTaskId` is a NOT NULL FK to tasks (`framework/db/src/schema.ts`). Teams and Routines never own Artifacts; a parent task aggregates its subtree's Artifacts read-only, and a Routine's work produces Artifacts via the Task it spawns. The Artifact contract itself lives in [artifact-primitive.md](artifact-primitive.md).

All shapes below reflect `framework/db/src/schema.ts` — the schema file is authoritative; this doc names the load-bearing fields and their semantics.

### 3.1 Task

A unit of work with a goal, owned by a team. A task may contain subtasks, to any depth; a task with no
parent is the top of its tree — the thing a team commits to, which used to be called a bet. It is *not*
a workflow: it encodes no step sequence, only a goal and the minimum structure to keep the team honest
about it.

Shipped shape:

- `parentTaskId` — **nullable**. `null` means a root task. This one field is the whole hierarchy.
- `teamId`, `ownerAgentId` — owner changes via handoff
- `title`, `description`, `doneCondition` — the goal is `doneCondition`; every task has one
- `state` — **`proposed | accepted | hold | in_progress | blocked | review | done | killed`** (`TASK_STATES`, `framework/domain-model/src/types.ts`). One vocabulary at every depth: a root task is `in_progress`, not "active".
- `dependencies` — Task IDs that must reach `done` first; sequences emerge from these, not from a graph
- `artifacts` — Artifact references (Tasks are the unique producers)
- `threadId` — **nullable**; `notes`, `auditTrail`
- `outcomeVerdict` — `met | met_with_rework | partially_met | not_met`, null until evaluated; `outcomeSummary` alongside it
- `tokensActualJson` — this task's OWN accumulated TokenUsage. A subtree total is summed at read time; no ancestor carries a rollup column, so there is none to drift.
- `sourceKnowledgeItemId` (AK5 promote-from-knowledge), `createdAt`, `updatedAt`, `completedAt` — timestamps are informational; duration is never a budget

**Cycles are rejected at write time** (`assertNoCycle`), not merely constrained by the database: a
recursive read that meets a cycle does not error, it spins. The recursive reads additionally carry a
depth cap as a backstop.

**What the merge cut, and why.** `appetite` was already dead (rejected at the API boundary). `atRisk`
was never written to `true` anywhere in production. `hypothesis` and `revisionLog` went with the bet —
a task's goal is its `doneCondition`, and `auditTrail` was already the audit mechanism, so a second one
was redundant. The four-value bet status folded into the eight task states, and the
`validated | refuted | partial | inconclusive` verdict vocabulary folded into the task's: the surviving
question is "did the goal get met?", which reads correctly at every depth.

**Editing is not gated by who you are.** One door — `PATCH /api/tasks/:id` — and a human and an agent
send the identical request for the identical result. Before the merge this was incoherent in both
directions: a human could edit a bet at any status, an agent only in `draft` and only as the assistant
and only behind an approval gate, and *nobody* could edit a task at all. Per [ETHOS](../../ETHOS.md), a
gate is earned from a real learning, never built preemptively.

Strategy signals (`riskTier`) live in `task_planning_signals`, not on the kernel task — the O2
kernel/strategy split.

The thread on a task is optional. Most tasks don't need one; threads exist *when there's something to
discuss* — a question, a handoff, a review. The thread is attached to the task, not the same as it: the
conversation about the work is separate from the state of the work. Deep mechanics:
[tasks-and-sessions.md](tasks-and-sessions.md) and
[handoff-and-lifecycle-propagation.md](handoff-and-lifecycle-propagation.md).

### 3.2 Session

A single agent's bounded run. Most sessions work a task, but AU1 made `taskId` optional so task-free sources — assistant turns, routine runs, and knowledge review requests — can enter the same runtime without fabricating work. Task-backed sessions still give resumability across a task's lifetime: one agent works, hands back, another picks up later. Agent memory persists between sessions through the knowledge layers, not the process.

Shipped shape:

- `taskId` — nullable; task-free sessions carry source correlation instead of a fabricated task
- `agentId`
- `modelTier` — required; tier vocabulary owned by [../agent-layer/model-routing-and-cost.md](../agent-layer/model-routing-and-cost.md)
- `state` — **`active | paused | done | crashed`** (`SessionState`, `framework/domain-model/src/types.ts`)
- `outcome` — **`completed | crashed | stopped | not_returned`** (`SessionOutcome`, `framework/domain-model/src/events.ts`)
- `sandboxSnapshot` — pointer to sandbox state at session start
- `notes` — what the agent did, in its own words
- `routineId` — set when the routine scheduler created the session; routine request/run correlation is also recorded in `agent_session_requests`
- `effectivenessScore` (+ recorded-at/by) — AC1 grading
- `startedAt` / `endedAt` — telemetry only; their delta is never a budget

**Session cost shape (canonical statement).** Sessions have **no cost columns**, and nothing rolls session spend up onto agents, teams, or routines. Token actuals are the only usage the system accumulates, on the worked task's own `tasks.tokensActualJson`; a subtree total is summed at read time.

### 3.3 Team

A persistent group of agents. Teams are the most important deviation from frameworks that form a crew per task: **teams that ship together accumulate context**, and that accumulated context is the entire reason a tenured agent beats a fresh one. Dissolving a team after one piece of work throws it away.

Shipped as one table (AU44 B1 folded `team_members` back in): name, phase, knowledge paths, open-vocabulary `functions` that drive the default roster (AB0), `members`, `leadAgentId` (escalations route there first), integer `capacity` — the WIP ceiling — and `formedAt`. The `activeBets` tally is gone (BB1): capacity is counted live against tasks that are `in_progress`. Deep doc: [teams.md](teams.md).

### 3.4 Routine

A recurring trigger attached to a named agent, with persistent state across runs.

Shipped shape:

- `ownerAgentId` — a named agent; a routine has no team of its own, its scope is wherever its owner agent belongs
- `prompt` — the instruction given to the owner agent when the routine fires (nullable: no prompt runs the agent on its own persona)
- `triggerType` — **`heartbeat | calendar | event | continuous`** + `triggerConfig` (`{cron}`/`{intervalSeconds}`) or, for `event`, an `eventType` column naming any of the full event vocabulary (`EVENT_TYPES`, `framework/event-bus/src/events.ts`) — matching routines are read from the database at the moment the event happens, so a routine created, paused, edited, or deleted takes effect on the very next matching event
- `stateKey` — how the routine remembers what it did last time
- `humanReview`, `silent` booleans
- `state` — `active | paused | error`
- `stubTaskId` — legacy nullable column for older routines; new routine creation is task-free and correlates runs through `agent_session_requests`
- `lastRunAt` / `nextRunAt`; history in the `routine_runs` audit log

Delegation semantics: the **owner holds the thread of memory** across runs. If the owner is overloaded and `delegationAllowed` is true, a skilled teammate can pick the run up and write back into the owner's state — muscle memory preserved, execution flexes. Builtins, triggers, and the retro loop: [routines-and-retros.md](routines-and-retros.md).

### 3.5 Why these four and not more

Deliberately absent:

- **Workflow** — no DAGs. Sequences emerge from `tasks.dependencies`; containment (`parentTaskId`) expresses *what is part of what*, never *what runs after what*.
- **Plan** — a plan is just the current state of a task's subtree. It changes.
- **Crew/Squad** — collapsed into Team.
- **Job** — collapsed into Routine.
- **Run** — collapsed into Session. `routine_runs` is only an audit log that links to sessions.

If something doesn't fit one of these five, the right move is usually to *not build it*, not to add a sixth primitive.

---

## 4. What ships at this layer

The process layer's job is the primitives, the schedulers, and the helpers — **not the agent runtime, not an orchestration engine**. Sessions execute on external harnesses; the layer coordinates them. The verified component inventory (dependency watcher, task dispatcher, routine scheduler, handoff protocol, retro flow) lives in [../architecture/as-implemented-domain-architecture.md](../architecture/as-implemented-domain-architecture.md).

---

## 5. What this layer is not

Scope guards, all still enforced by the code:

- **Not a workflow engine.** No DAGs. Sequences emerge from task dependencies and handoffs, not a graph editor.
- **Not a project tracker.** Tasks have state, but the goal is agents finishing work, not stakeholders watching progress. Work view and Conversations are the human surfaces.
- **Not a backlog.** Work lives in the Work view as a tree someone is actually working. Nothing accumulates in a "later" pile — and now that a root task needs no parent, that is a discipline the team keeps rather than a shape the schema enforces.
- **Not a planner.** Task planning is local to the tree and strategy-driven. No central planner exists.
- **Not the agent runtime.** Sessions execute on whatever harness the deployer chose (real CLI binaries via harness adapters). We coordinate; we don't run models.
- **Not a durability substrate.** HyperIdle neither reimplements nor adapts to external workflow engines — durability is in-process `setInterval` schedulers over the primitive store.
- **Not Jira.** If someone asks "where are the sprint reports," we've lost.

---

## 6. Anti-patterns

Named and deliberately avoided — proposals that reintroduce them should be rejected by reference to this list:

- **Centralized planner** — task planning stays with the team, local to the work.
- **Workflow-DAG rigidity** — no pre-wired transitions.
- **Crew-per-task amnesia** — teams persist; context compounds.
- **Unbounded parallelism** — WIP limits bound the factory ([wip-and-cost-limits.md](wip-and-cost-limits.md)).
- **Silent rate-limiting** — hitting a WIP limit surfaces, never silent throttling.
- **Duration caps** — concurrency is the axis work is rationed on; any future "duration cap" proposal is a named anti-pattern (rationale in [wip-and-cost-limits.md](wip-and-cost-limits.md)).
