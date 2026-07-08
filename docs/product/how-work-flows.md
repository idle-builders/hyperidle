# How Work Flows

HyperIdle has five process primitives. Everything else is mechanics on top of these. There are no workflows, no DAGs, no central planner. Sequences emerge from task dependencies, not pre-wired graphs.

| Primitive | What it is | Lifespan |
|-----------|-----------|----------|
| **Team** | Agents bound to a product | Life of the product |
| **Bet** | Shaped work with a done condition and money appetite | Until completed or killed |
| **Task** | One agent's unit of work within a bet | Until done or killed |
| **Session** | One bounded run of an agent on a task | One context window |
| **Routine** | Recurring trigger with persistent memory | Until retired |

All five are implemented as tables in `packages/db/src/schema.ts`. Spec depth lives in [the five primitives](../process-layer/the-five-primitives.md).

---

## Teams persist across products, not per task

A team is a small group of agents bound to a product — not to a bet, not to a project. The Acme team works on Acme. The Ambrovia team works on Ambrovia. Both teams exist for the life of their respective products.

This is the biggest departure from agent frameworks. CrewAI forms a crew per task. LangGraph assembles a graph per invocation. HyperIdle forms a team per product because teams that ship together accumulate context.

The Acme Builder that shipped auth in January ships payments in March. It has read every Acme decision, failure, and architecture document. That context is why the tenth bet is faster than the first.

A typical team: a Product Manager (team lead), one or more Builders, a Growth Agent, and an Ops Agent. The roster flexes with the product's lifecycle phase. Agents belong to exactly one team — a single `users.teamId` FK. An agent needed on a new product must finish its current work and transfer cleanly.

Depth: [Teams](../process-layer/teams.md).

---

## Bets carry a money appetite, not a deadline

Work comes in as bets. A bet is a shaped piece of work with an explicit done condition and a cost appetite in real currency (e.g., $800 USD).

**Draft first.** The Product Manager writes the bet's description: the problem, what success looks like, rough scope, explicit no-gos, rabbit holes to watch for. The bet sits in `draft` on the Work view. No tasks yet.

**Then activate.** A bet's lifecycle is `draft | active | completed | killed`. The founder moves a draft to active and the team begins. Vague done conditions are the most common reason bets drift.

**Money is the budget axis.** No deadlines or sprint lengths. The created and completed timestamps are recorded for retros — their delta is informational. This forces honest trade-offs: if the work costs more than the appetite allows, something changes. Cap grammar and hierarchy: [WIP and cost limits](../process-layer/wip-and-cost-limits.md).

**Changes go through review.** Done conditions can be revised. Hypotheses can be updated. Every change appends to the bet's revision log, and a done-condition change surfaces as a review item for the human.

Depth: [Bets — shape, commit, change, ship](../process-layer/bets-shape-commit-change-ship.md).

---

## Tasks: one decomposer proposes, the team refines

When a bet activates, one decomposer agent — the Product Manager where one exists — runs a decomposition turn and proposes the full task list (`runBetDecomposition`; `decompositionStatus` on the bet tracks it). Proposed tasks are then reviewed and refined. No human review at this stage.

Each task has:
- An owner (the responsible agent)
- A state: proposed, accepted, hold, in-progress, blocked, review, done, or killed
- A done condition (task-level, explicit)
- A cost cap (money)
- An optional discussion thread
- Artifacts it has produced

**Example.** Mika (the Acme Builder) owns "Implement Stripe webhook handler." It depends on "Define payment schema," which must finish first. Done condition: "webhook endpoint returns 200 for all test events and logs to the canonical store." Cost cap: $12. When Mika completes it, the dependent task "Connect payments UI to API" moves from hold to accepted automatically.

Tasks are the unique producers of artifacts. A task that builds the signup flow produces a code artifact. A task that writes landing page copy produces a content artifact. The bet aggregates these; it does not own them.

**No central planner.** There is no orchestrator agent deciding what all agents should do. The Product Manager integrates and unblocks but does not micromanage. Sequences emerge from task dependencies: when task A completes, dependent tasks on hold move to accepted. The Dependency Watcher (`packages/server/src/services/dependency-watcher.ts`) handles this automatically.

Depth: [Tasks and sessions](../process-layer/tasks-and-sessions.md).

---

## Sessions: bounded runs with resumability

A session is one agent's bounded run on a task. When an agent picks up a task, it starts a session. When the context window is about to compact, the session ends. The agent writes session notes. A new session picks up where the last left off.

A task can span many sessions. Mika works a session on Acme payments, makes progress, hits a question about Stripe fee structure, and hands off to a human. The human answers. Mika starts a new session and continues. Two weeks later, the original session notes and handoff history are still there.

The agent's memory persists between sessions through product knowledge (L2) and practice knowledge (L3) — see [the five layers](../knowledge-architecture/the-five-layers.md). Sessions give resumability without locking the model into a single long-running process.

---

## Handoffs: agents decide when to transfer work

There is no pre-wired routing. When Mika finishes a backend API and the work moves to a frontend task, she calls a handoff with a structured message: what was done, what artifacts exist, what remains, who should pick it up. Exactly one of `toAgent`, `toRole`, or `toHuman` names the recipient — an agent by ID, or a role ("builder with frontend skills").

Handoffs to humans work the same way. When an agent hits something it cannot resolve — a product decision, an approval it wants — it hands off `toHuman` with a structured reason. The task moves to blocked. The human replies; the task resumes.

Depth: [Handoff and lifecycle propagation](../process-layer/handoff-and-lifecycle-propagation.md).

---

## Routines: recurring work with persistent memory

A routine is a recurring trigger attached to a named agent, with state that persists across runs. Three trigger shapes used by builtin routines:

- **Calendar** — every Monday at 9am
- **Event** — every time a landing page ships, run brand-voice review
- **Heartbeat** — every hour, check cost burn

Every routine has a named owner who holds the thread of memory. Helena (the Facilitator for Growth) owns "weekly growth metrics review." Every Monday she checks what campaigns shipped, compares conversion numbers against practice benchmarks, and posts a summary. When she found Ambrovia's email open rates dropped 15% after a subject-line change, she flagged it for the founder.

Routines can opt in to per-run human review. Routines that stop producing actionable output are candidates for retirement.

Depth: [Routines and retros](../process-layer/routines-and-retros.md).

---

Next: [Human + AI Collaboration](./human-ai-collaboration.md) — how trust is earned, how review works, and how cost stays visible.
