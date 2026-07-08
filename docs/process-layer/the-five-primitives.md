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
2. **Decomposition is decentralized and pluggable.** No central planner service. Each bet is decomposed via a pluggable strategy (`packages/server/src/services/bet-decomposition.ts`) — the fabric strategy is knowledge-aware (practice = L3); the kernel minimal strategy is the knowledge-free floor. See [bets-shape-commit-change-ship.md](bets-shape-commit-change-ship.md).
3. **Change is first-class, not exceptional.** Bets are meant to change as the team learns. Revisions flow through the same review-thread mechanism humans use to approve anything else, with an audit trail.

---

## 2. Top-down and bottom-up at the same time

Knowledge in a healthy flat company doesn't flow one way. The founders set direction; the people doing the work surface what they learn. The process layer makes both first-class.

### 2.1 Top-down: vision and focus, not assignments

- **`PRINCIPLES` and `FOCUS`** — canonical L4 knowledge items. `git-export.ts` exports them to the team's git repo (`EXPORTED_KINDS`, `packages/fabric/src/services/git-export.ts:30-31`); context assembly fetches all L4 items from `knowledge_items` and writes them into the session sandbox (`packages/fabric/src/context-assembly.ts`). Edited by humans through the assistant thread and approved through Conversations.
- **The assistant conversation** — the persistent thread where founders shape direction in dialogue with the assistant; the assistant distills it into proposed updates that loop back through Conversations for approval.
- **Committing a bet in the Work view** — a direct top-down signal: "this is what we're doing for the next cycle."

Top-down means direction, never task assignment. Tasks emerge from the team.

### 2.2 Bottom-up: learnings, data, surfaced insights

- **The practice layer (L3)** is the primary channel: agents capture observations into their practice; facilitators surface the highest-attention items via the Knowledge view. See [../knowledge-architecture/facilitators.md](../knowledge-architecture/facilitators.md) and [../knowledge-architecture/the-five-layers.md](../knowledge-architecture/the-five-layers.md).
- **Bet retros** record the cycle's outcome and create a retro knowledge item, with an AI-assisted draft (`packages/server/src/routes/bets.ts:158`, `:929-937`). See [routines-and-retros.md](routines-and-retros.md).
- **Agent-initiated chat** — any agent that notices something the founders should know can post a thread directly. See [../human-interface-layer/thread-primitive.md](../human-interface-layer/thread-primitive.md).
- **Bet revision** — when the team learns the bet's premise is wrong, it proposes a revision through the review-thread mechanism.

### 2.3 The two flows meet at the bet

A bet starts as a top-down commitment and evolves as the team learns. Change semantics: [bets-shape-commit-change-ship.md](bets-shape-commit-change-ship.md).

---

## 3. The five primitives

**Producer rule for Artifacts.** Tasks are the unique producers of Artifacts: `artifacts.producingTaskId` is a NOT NULL FK to tasks (`packages/db/src/schema.ts:848-855`). Bets, Teams, and Routines never own Artifacts; Bet surfaces aggregate their Tasks' Artifacts read-only, and a Routine's work produces Artifacts via the Task it spawns. The Artifact contract itself lives in [artifact-primitive.md](artifact-primitive.md).

All shapes below reflect `packages/db/src/schema.ts` — the schema file is authoritative; this doc names the load-bearing fields and their semantics.

### 3.1 Bet

A shaped, committed, time-boxed unit of work owned by a team, with an explicit done condition. A bet is *not* a workflow — it encodes no step sequence, only a *commitment* and the minimum structure to keep the team honest about it.

Shipped shape (`schema.ts:121`):

- `teamId` — the owning team (Product merged into Team, U1)
- `description` — the shaped write-up (renamed from the pre-U1 field in migration 0021)
- `doneCondition`, `hypothesis` — explicit, revisable under review
- `status` — **`draft | active | completed | killed`** (`BET_STATUSES`, `packages/shared/src/types.ts`); `atRisk` is a boolean sub-state, not a status
- `revisionLog` — every change to done condition or hypothesis, with reasoning
- `costAppetiteMinor` + `costAppetiteCurrency` — the Money appetite; `costActualMinor` accumulates from sessions
- `tokensActualJson` — accumulated TokenUsage actuals
- `outcomeVerdict` — `validated | refuted | partial | inconclusive` (AC1), null until evaluated
- `decompositionStatus` (AK3), `sourceKnowledgeItemId` (AK5 promote-from-knowledge), `createdAt`, `completedAt`

The appetite is a Money cap, never wall-clock time — the deprecated duration `appetite` column is rejected at the API boundary (400). Cap grammar, hierarchy, and the duration-is-not-a-budget-axis rationale live in [wip-and-cost-limits.md](wip-and-cost-limits.md); `Money`/`TokenUsage` shapes in [canonical-shapes.md](canonical-shapes.md). Full lifecycle and decomposition: [bets-shape-commit-change-ship.md](bets-shape-commit-change-ship.md).

### 3.2 Task

A unit of work picked up by an agent. First-class object with state, owner, dependencies, done condition, cost cap, Artifact references, and 0..n sessions attached.

Shipped shape (`schema.ts:204`):

- `betId`, `teamId`, `ownerAgentId` — owner changes via handoff
- `title`, `description`, `doneCondition`
- `state` — **`proposed | accepted | hold | in_progress | blocked | review | done | killed`** (`TASK_STATES`, `packages/shared/src/types.ts:10-19`)
- `dependencies` — Task IDs that must reach `done` first; sequences emerge from these, not from a graph
- `artifacts` — Artifact references (Tasks are the unique producers)
- `costCap` / `costActual` — bare integer minor units
- `threadId` — **nullable**; `notes`, `auditTrail`
- `outcomeVerdict` — `met | met_with_rework | partially_met | not_met` (AC1)
- `createdAt` / `updatedAt` — informational only; the budget axis is Money, never duration

Strategy signals (`riskTier`) live in `task_strategy_fabric` (`schema.ts:723-741`), not on the kernel task — the O2 kernel/strategy split.

The thread on a task is optional. Most tasks don't need one; threads exist *when there's something to discuss* — a question, a handoff, a review. The thread is attached to the task, not the same as it: the conversation about the work is separate from the state of the work. Deep mechanics: [tasks-and-sessions.md](tasks-and-sessions.md) and [handoff-and-lifecycle-propagation.md](handoff-and-lifecycle-propagation.md).

### 3.3 Session

A single agent's bounded run. Most sessions work a task, but AU1 made `taskId` optional so task-free sources — assistant turns, routine runs, and knowledge review requests — can enter the same runtime without fabricating work. Task-backed sessions still give resumability across a task's lifetime: one agent works, hands back, another picks up later. Agent memory persists between sessions through the knowledge layers, not the process.

Shipped shape (`schema.ts:245`):

- `taskId` — nullable; task-free sessions carry source correlation instead of a fabricated task
- `agentId`
- `modelTier` — required; tier vocabulary owned by [../agent-layer/model-routing-and-cost.md](../agent-layer/model-routing-and-cost.md)
- `state` — **`active | paused | done | crashed`** (`SessionState`, `packages/shared/src/types.ts`)
- `outcome` — **`completed | crashed | stopped | not_returned`** (`SessionOutcome`, `packages/shared/src/events.ts:48`)
- `sandboxSnapshot` — pointer to sandbox state at session start
- `notes` — what the agent did, in its own words
- `routineId` — set when the routine scheduler created the session; routine request/run correlation is also recorded in `agent_session_requests`
- `effectivenessScore` (+ recorded-at/by) — AC1 grading
- `startedAt` / `endedAt` — telemetry only; their delta is never a budget

**Session cost shape (canonical statement).** Sessions have **no cost or token columns**. Session cost is computed at session end and rolled up: onto `users.costActual` and `teamMembers.costActual` (`packages/fabric/src/services/cost-cap.ts:247-256`), onto `bets.costActualMinor` (`cost-cap.ts:272`), and onto `routines.costActualMinor` for routine sessions (`packages/server/src/services/session-lifecycle.ts:111-124`). Factory cost is `SUM(users.costActual)`, written to `factory_settings.cost_actual`. Enforcement: [wip-and-cost-limits.md](wip-and-cost-limits.md).

### 3.4 Team

A persistent group of agents. Teams are the most important deviation from frameworks that form a crew per task: **teams that ship together accumulate context**, and that accumulated context is the entire reason a tenured agent beats a fresh one. Dissolving a team after one bet throws it away.

Shipped as two tables (U1): `teams` (`schema.ts:17-34`) is the domain entity — name, phase, knowledge paths, open-vocabulary `functions` that drive the default roster (AB0); `team_members` (`schema.ts:100-117`) is the agent-membership group — `members`, `leadAgentId` (escalations route there first), integer `capacity`, `activeBets` count, `costCap`/`costActual`, `formedAt`/`dissolvedAt`. Deep doc: [teams.md](teams.md).

### 3.5 Routine

A recurring trigger attached to a named agent, with persistent state across runs.

Shipped shape (`schema.ts:294`):

- `ownerAgentId` — a named agent; `teamId` NOT NULL (every routine is team-scoped)
- `triggerType` — **`heartbeat | calendar | event | continuous`** (`TriggerType`, `packages/shared/src/types.ts`) + `triggerConfig`
- `skillId`, `doneCondition`
- `stateKey` — how the routine remembers what it did last time
- `delegationAllowed`, `humanReview`, `silent` booleans
- `state` — `active | paused | error`
- Per-routine cost caps: `costCapPerRunMinor`, `costCapMonthlyMinor`; `costActualMinor` accumulates per run
- `stubTaskId` — legacy nullable column for older routines; new routine creation is task-free and correlates runs through `agent_session_requests`
- `lastRunAt` / `nextRunAt`; history in the `routine_runs` audit log (`schema.ts:391`)

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

The process layer's job is the primitives, the schedulers, and the helpers — **not the agent runtime, not an orchestration engine**. Sessions execute on external harnesses; the layer coordinates them. The verified component inventory (dependency watcher, task dispatcher, routine scheduler, handoff protocol, cost cap + sentinel, retro flow) lives in [../architecture/as-implemented-domain-architecture.md](../architecture/as-implemented-domain-architecture.md).

---

## 5. What this layer is not

Scope guards, all still enforced by the code:

- **Not a workflow engine.** No DAGs. Sequences emerge from task dependencies and handoffs, not a graph editor.
- **Not a project tracker.** Tasks have state, but the goal is agents finishing work, not stakeholders watching progress. Work view and Conversations are the human surfaces.
- **Not a backlog.** Draft bets live in the Work view; tasks exist only inside committed bets; nothing accumulates in a "later" pile.
- **Not a planner.** Decomposition is decentralized, per-bet, strategy-pluggable. No central planner exists.
- **Not the agent runtime.** Sessions execute on whatever harness the deployer chose (real CLI binaries via harness adapters). We coordinate; we don't run models.
- **Not a durability substrate.** HyperIdle neither reimplements nor adapts to external workflow engines — durability is in-process `setInterval` schedulers over the primitive store.
- **Not Jira.** If someone asks "where are the sprint reports," we've lost.

---

## 6. Anti-patterns

Named and deliberately avoided — proposals that reintroduce them should be rejected by reference to this list:

- **Centralized planner** — decomposition stays with the team, per bet.
- **Workflow-DAG rigidity** — no pre-wired transitions.
- **Crew-per-task amnesia** — teams persist; context compounds.
- **Unbounded parallelism** — WIP and cost caps bound the factory ([wip-and-cost-limits.md](wip-and-cost-limits.md)).
- **Silent rate-limiting** — breaches surface as review items, never silent throttling.
- **Duration caps** — budget axes are Money and TokenUsage only; any future "duration cap" proposal is a named anti-pattern (rationale in [wip-and-cost-limits.md](wip-and-cost-limits.md)).
