# How Work Flows

HyperIdle has four process primitives. Everything else is mechanics on top of these. There are no workflows, no DAGs, no central planner. Sequences emerge from task dependencies, not pre-wired graphs.

| Primitive | What it is | Lifespan |
|-----------|-----------|----------|
| **Team** | Agents bound to a product | Life of the product |
| **Task** | Shaped work with a goal, possibly containing subtasks | Until done or killed |
| **Session** | One bounded run of an agent on a task | One context window |
| **Routine** | Recurring trigger with persistent memory | Until retired |

All four are implemented as tables in `framework/db/src/schema.ts`. Spec depth lives in [the four primitives](../process-layer/the-four-primitives.md).

---

## Teams persist across work, not per task

A team is a small group of agents bound to a product — not to a single task, not to a project. The Acme team works on Acme. The Ambrovia team works on Ambrovia. Both teams exist for the life of their respective products.

This is the biggest departure from agent frameworks. CrewAI forms a crew per task. LangGraph assembles a graph per invocation. HyperIdle forms a team per product because teams that ship together accumulate context.

The Acme Builder that shipped auth in January ships payments in March. It has read every Acme decision, failure, and architecture document. That context is why the tenth task is faster than the first.

A typical team: a Product Manager (team lead), one or more Builders, a Growth Agent, and an Ops Agent. The roster flexes with the product's lifecycle phase. Agents belong to exactly one team — a single `users.teamId` FK. An agent needed on a new product must finish its current work and transfer cleanly.

Depth: [Teams](../process-layer/teams.md).

---

## Tasks carry a done condition, not a deadline

Work comes in as tasks. A task is a unit of work with an explicit done condition, owned by a team. A task may contain subtasks, to any depth; a task with no parent is the top of its tree — the thing a team commits to.

**Start with a goal.** The Product Manager creates a root task with a description and a done condition: the problem, what success looks like, explicit no-gos, rabbit holes to watch for. The task sits in `proposed` on the Work view. No subtasks yet.

**Then activate.** A task's lifecycle is `proposed | accepted | hold | in_progress | blocked | review | done | killed`. The founder moves it to `accepted` and the team begins. Vague done conditions are the most common reason tasks drift.

**No deadlines or sprint lengths.** The created and completed timestamps are recorded for retros — their delta is informational, never a budget. What is bounded is concurrency: how many sessions and tasks run at once. See [WIP limits](../process-layer/wip-and-cost-limits.md).

**Changes go through one door.** Done conditions, descriptions, titles, and ownership can be revised through `PATCH /api/tasks/:id`. There is no draft-only gate and no approval gate — whoever is closest to the work edits it, human or agent. Every change lands in the task's audit trail.

Depth: [Tasks and sessions](../process-layer/tasks-and-sessions.md).

---

## Subtasks

A task may contain subtasks, which may contain further subtasks — to any depth. Subtasks are added by agents on the team as they pick up work, or by the founder directly. No automatic breakdown happens when a task activates.

Each task (at any depth) has:
- An owner (the responsible agent)
- A state: proposed, accepted, hold, in-progress, blocked, review, done, or killed
- A done condition (explicit)
- An optional discussion thread
- Artifacts it has produced

**Example.** A root task "Implement payments" contains "Implement Stripe webhook handler" (a subtask owned by Mika, the Acme Builder). That subtask depends on "Define payment schema," which must finish first. Done condition: "webhook endpoint returns 200 for all test events and logs to the canonical store." When Mika completes it, the dependent subtask "Connect payments UI to API" moves from hold to accepted automatically.

When all subtasks of a parent reach a terminal state (`done` or `killed`), the parent transitions automatically, walking up the tree until the root is reached.

An artifact is something the team produced, hanging off whatever produced it. A task that builds the signup flow produces a code artifact; a task that writes landing page copy produces a content artifact; an agent answering in a conversation produces one there, and so does a person. Underneath they are all knowledge items with a parent, which is why any of them can later be kept as team knowledge rather than staying task residue.

**No central planner.** There is no orchestrator agent deciding what all agents should do. The Product Manager integrates and unblocks but does not micromanage. Sequences emerge from task dependencies: when task A completes, dependent tasks on hold move to accepted. The Dependency Watcher (`layers/core-api/work/src/dependency-watcher.ts`) handles this automatically.

---

## Sessions: bounded runs with resumability

A session is one agent's bounded run on a task. When an agent picks up a task, it starts a session. When the context window is about to compact, the session ends. The agent writes session notes. A new session picks up where the last left off.

A task can span many sessions. Mika works a session on Acme payments, makes progress, hits a question about Stripe fee structure, and hands off to a human. The human answers. Mika starts a new session and continues. Two weeks later, the original session notes and handoff history are still there.

The agent's memory persists between sessions through team-scoped knowledge and its practice's knowledge folder — see [Knowledge Architecture](../knowledge-architecture/index.md). Sessions give resumability without locking the model into a single long-running process.

---

## Handoffs: agents decide when to transfer work

There is no pre-wired routing. When Mika finishes a backend API and the work moves to a frontend task, she calls a handoff with a structured message: what was done, what artifacts exist, what remains, who should pick it up. Exactly one of `toAgent`, `toRole`, or `toHuman` names the recipient — an agent by ID, or a role ("builder with frontend skills").

Handoffs to humans work the same way. When an agent hits something it cannot resolve — a product decision, an approval it wants — it hands off `toHuman` with a structured reason. The task moves to blocked. The human replies; the task resumes.

Depth: [Handoff and lifecycle propagation](../process-layer/handoff-and-lifecycle-propagation.md).

---

## Routines: recurring work with persistent memory

A routine is a recurring trigger attached to a named agent, with state that persists across runs. Three trigger shapes:

- **Calendar** — every Monday at 9am
- **Event** — every time a task completes, run a retro
- **Heartbeat** — every hour, check whether anything is stalled

Every routine has a named owner who holds the thread of memory. Helena (the Facilitator for Growth) owns "weekly growth metrics review." Every Monday she checks what shipped, compares numbers against practice benchmarks, and posts a summary.

Routines can opt in to per-run human review. Routines that stop producing actionable output are candidates for retirement.

Depth: [Routines and retros](../process-layer/routines-and-retros.md).

---

Next: [Human + AI Collaboration](./human-ai-collaboration.md) — how trust is earned and how review works.
