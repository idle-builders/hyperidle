# The Five Primitives

The process layer rests on five primitives — **Bet, Task, Session, Team, Routine**. Everything else in this folder is mechanics on top of these. This doc is the front door: why the layer exists, the two directions work flows, the five shapes as shipped, and the layer's boundaries.

---

## 1. Why a dedicated process layer

Two failure modes bracket the design space:

- **Workflow-engine thinking.** Treat the factory as a DAG of nodes. Every transition is wired in advance; adding a step means editing the graph. Agents become DAG executors, not employees. It collapses the moment reality stops looking like the graph.
- **Free-form agent thinking.** No structure at all. Agents are spawned, told to "work on the bet," and given everything. They duplicate work, contradict each other, never know when to stop, and burn cost without producing artifacts.

The middle path this layer implements: **decentralized handoffs over a shared substrate, with explicit unit primitives and explicit done conditions.** The model decides when to hand off; the system tracks state; the work has a beginning, a middle, and a known end. No DAG engine exists anywhere in the repo — sequencing is `tasks.dependencies` plus the handoff protocol.

Three commitments distinguish it, all implemented:

1. **Teams persist.** A team is the durable unit, not a per-task crew. Product merged 1:1 into Team (U1: the `teams` table is the former `products` table). Successive bets pass through the same team and it accumulates muscle memory. See [teams.md](teams.md).
2. **Task planning is decentralized and strategy-driven.** No central planner service. Tasks emerge from agent and strategy work; the work service (`layers/core-api/work/`) coordinates state without encoding a step sequence. See [bets-shape-commit-change-ship.md](bets-shape-commit-change-ship.md).
3. **Change is first-class, not exceptional.** Bets are meant to change as the team learns. Revisions flow through the same review-thread mechanism humans use to approve anything else, with an audit trail.

---

## 2. Top-down and bottom-up at the same time

Knowledge in a healthy flat company doesn't flow one way. The founders set direction; the people doing the work surface what they learn. The process layer makes both first-class.

### 2.1 Top-down: vision and focus, not assignments

- **`PRINCIPLES` and `FOCUS`** — canonical L4 knowledge items. Context assembly fetches all L4 items from `knowledge_items` and writes them into the session sandbox. (There is no git export — see [facilitators](../knowledge-architecture/facilitators.md).) Edited by humans through the assistant thread and approved through Conversations.
- **The assistant conversation** — the persistent thread where founders shape direction in dialogue with the assistant; the assistant distills it into proposed updates that loop back through Conversations for approval.
- **Committing a bet in the Work view** — a direct top-down signal: "this is what we're doing for the next cycle."

Top-down means direction, never task assignment. Tasks emerge from the team.

### 2.2 Bottom-up: learnings, data, surfaced insights

- **The practice layer (L3)** is the primary channel: agents capture observations into their practice; facilitators surface the highest-attention items via the Knowledge view. See [../knowledge-architecture/facilitators.md](../knowledge-architecture/facilitators.md) and [../knowledge-architecture/the-five-layers.md](../knowledge-architecture/the-five-layers.md).
- **Bet retros** record the cycle's outcome and create a retro knowledge item, with an AI-assisted draft (`layers/core-api/src/routes/bets.ts`). See [routines-and-retros.md](routines-and-retros.md).
- **Agent-initiated chat** — any agent that notices something the founders should know can post a thread directly. See [../human-interface-layer/thread-primitive.md](../human-interface-layer/thread-primitive.md).
- **Bet revision** — when the team learns the bet's premise is wrong, it proposes a revision through the review-thread mechanism.

### 2.3 The two flows meet at the bet

A bet starts as a top-down commitment and evolves as the team learns. Change semantics: [bets-shape-commit-change-ship.md](bets-shape-commit-change-ship.md).

---

## 3. The five primitives

**Producer rule for Artifacts.** Tasks are the unique producers of Artifacts: `artifacts.producingTaskId` is a NOT NULL FK to tasks (`framework/db/src/schema.ts`). Bets, Teams, and Routines never own Artifacts; Bet surfaces aggregate their Tasks' Artifacts read-only, and a Routine's work produces Artifacts via the Task it spawns. The Artifact contract itself lives in [artifact-primitive.md](artifact-primitive.md).

All shapes below reflect `framework/db/src/schema.ts` — the schema file is authoritative; this doc names the load-bearing fields and their semantics.

### 3.1 Bet

A shaped, committed, time-boxed unit of work owned by a team, with an explicit done condition. A bet is *not* a workflow — it encodes no step sequence, only a *commitment* and the minimum structure to keep the team honest about it.

Shipped shape:

- `teamId` — the owning team (Product merged into Team, U1)
- `description` — the shaped write-up (renamed from the pre-U1 field in migration 0021)
- `doneCondition`, `hypothesis` — explicit, revisable under review
- `status` — **`draft | active | completed | killed`** (`BET_STATUSES`, `framework/domain-model/src/types.ts`); `atRisk` is a boolean sub-state, not a status
- `revisionLog` — every change to done condition or hypothesis, with reasoning
- `tokensActualJson` — accumulated TokenUsage actuals
- `outcomeVerdict` — `validated | refuted | partial | inconclusive` (AC1), null until evaluated
- `sourceKnowledgeItemId` (AK5 promote-from-knowledge), `createdAt`, `completedAt`

A bet carries no money budget. The deprecated duration `appetite` column survives for rollback safety but is rejected at the API boundary (400); the optional `tokenAppetite` on the bet API schema is the only appetite the system reads. The duration-is-not-a-budget-axis rationale lives in [wip-and-cost-limits.md](wip-and-cost-limits.md); `Money`/`TokenUsage` shapes in [canonical-shapes.md](canonical-shapes.md). Full lifecycle: [bets-shape-commit-change-ship.md](bets-shape-commit-change-ship.md).

### 3.2 Task

A unit of work picked up by an agent. First-class object with state, owner, dependencies, done condition, Artifact references, and 0..n sessions attached.

Shipped shape:

- `betId`, `teamId`, `ownerAgentId` — owner changes via handoff
- `title`, `description`, `doneCondition`
- `state` — **`proposed | accepted | hold | in_progress | blocked | review | done | killed`** (`TASK_STATES`, `framework/domain-model/src/types.ts`)
- `dependencies` — Task IDs that must reach `done` first; sequences emerge from these, not from a graph
- `artifacts` — Artifact references (Tasks are the unique producers)
- `threadId` — **nullable**; `notes`, `auditTrail`
- `outcomeVerdict` — `met | met_with_rework | partially_met | not_met` (AC1)
- `createdAt` / `updatedAt` — informational only; duration is never a budget

Strategy signals (`riskTier`) live in `task_planning_signals`, not on the kernel task — the O2 kernel/strategy split.

The thread on a task is optional. Most tasks don't need one; threads exist *when there's something to discuss* — a question, a handoff, a review. The thread is attached to the task, not the same as it: the conversation about the work is separate from the state of the work. Deep mechanics: [tasks-and-sessions.md](tasks-and-sessions.md) and [handoff-and-lifecycle-propagation.md](handoff-and-lifecycle-propagation.md).

### 3.3 Session

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

**Session cost shape (canonical statement).** Sessions have **no cost columns**, and nothing rolls session spend up onto agents, teams, bets, or routines. Token actuals are the only usage the system accumulates, on `bets.tokensActualJson`.

### 3.4 Team

A persistent group of agents. Teams are the most important deviation from frameworks that form a crew per task: **teams that ship together accumulate context**, and that accumulated context is the entire reason a tenured agent beats a fresh one. Dissolving a team after one bet throws it away.

Shipped as two tables (U1): `teams` is the domain entity — name, phase, knowledge paths; `team_members` is the agent-membership group — `members`, `leadAgentId` (escalations route there first), integer `capacity`, `activeBets` count, `formedAt`/`dissolvedAt`. Deep doc: [teams.md](teams.md).

### 3.5 Routine

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

### 3.6 Why these five and not more

Deliberately absent:

- **Workflow** — no DAGs. Sequences emerge from `tasks.dependencies`.
- **Plan** — a plan is just the current state of a bet's task list. It changes.
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
- **Not a backlog.** Draft bets live in the Work view; tasks exist only inside committed bets; nothing accumulates in a "later" pile.
- **Not a planner.** Task planning is per-bet and strategy-driven. No central planner exists.
- **Not the agent runtime.** Sessions execute on whatever harness the deployer chose (real CLI binaries via harness adapters). We coordinate; we don't run models.
- **Not a durability substrate.** HyperIdle neither reimplements nor adapts to external workflow engines — durability is in-process `setInterval` schedulers over the primitive store.
- **Not Jira.** If someone asks "where are the sprint reports," we've lost.

---

## 6. Anti-patterns

Named and deliberately avoided — proposals that reintroduce them should be rejected by reference to this list:

- **Centralized planner** — task planning stays with the team, per bet.
- **Workflow-DAG rigidity** — no pre-wired transitions.
- **Crew-per-task amnesia** — teams persist; context compounds.
- **Unbounded parallelism** — WIP limits bound the factory ([wip-and-cost-limits.md](wip-and-cost-limits.md)).
- **Silent rate-limiting** — hitting a WIP limit surfaces, never silent throttling.
- **Duration caps** — concurrency is the axis work is rationed on; any future "duration cap" proposal is a named anti-pattern (rationale in [wip-and-cost-limits.md](wip-and-cost-limits.md)).
