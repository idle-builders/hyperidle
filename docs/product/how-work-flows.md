# How Work Flows

HyperIdle has five process primitives. Everything else is mechanics on top of these. There are no workflows, no DAGs, no central planner. Sequences emerge from task dependencies, not pre-wired graphs.

| Primitive | What it is | Lifespan |
|-----------|-----------|----------|
| **Team** | Agents bound to a product | Life of the product |
| **Bet** | Shaped work with a done condition and money appetite | Until shipped or killed |
| **Task** | One agent's unit of work within a bet | Until done or killed |
| **Session** | One bounded run of an agent on a task | One context window |
| **Routine** | Recurring trigger with persistent memory | Until retired |

---

## Teams persist across products, not per task

A team is a small group of agents bound to a product — not to a bet, not to a project. The Acme team works on Acme. The Ambrovia team works on Ambrovia. Both teams exist for the life of their respective products.

This is the biggest departure from agent frameworks. CrewAI forms a crew per task. LangGraph assembles a graph per invocation. HyperIdle forms a team per product because teams that ship together accumulate context.

The Acme Builder that shipped auth in January ships payments in March. It has read every Acme decision, failure, and architecture document. That context is why the tenth bet is faster than the first.

A typical team: a Product Manager (team lead), one or more Builders, a Growth Agent, and an Ops Agent. The roster flexes with the product's lifecycle phase. Agents belong to exactly one team. An agent needed on a new product must finish its current work and transfer cleanly.

---

## Bets carry a money appetite, not a deadline

Work comes in as bets. A bet is a shaped, committed piece of work with an explicit done condition and a cost cap in real currency (e.g., $800 USD).

**Shape first.** The Product Manager writes a pitch: the problem, what success looks like, rough scope, explicit no-gos, rabbit holes to watch for. The pitch lands on the Work view canvas as a shaped card. No tasks yet.

**Then commit.** The founder moves a pitch from shaped to committed. At that moment, a done condition is drafted and the team begins. A bet is not in progress until it has a done condition. Vague done conditions are the most common reason bets drift.

**Money is the budget axis.** No deadlines or sprint lengths. The `created_at` and `shipped_at` dates are recorded for retros — their delta is informational. This forces honest trade-offs: if the work costs more than the appetite allows, something changes.

**Changes go through review.** Done conditions can be revised. Hypotheses can be updated. But the Product Manager drafts the revision and the founder approves, requests changes, or rejects. Every change is logged with timestamp and reasoning.

**No backlog.** Shaped pitches not committed in two cycles expire. There is no "later" pile. An idea not worth committing to now either needs reshaping or should not be done.

---

## Tasks: agents decompose their own work

Once a bet is committed, each team member decomposes their part. This is decentralized by design.

The Builder looks at the pitch and done condition, queries its practice knowledge, and proposes the tasks it will own. The Growth Agent does the same for its work stream. The Product Manager reviews the assembled list, deduplicates, identifies gaps, and accepts or asks for revision. No human review at this stage.

Each task has:
- An owner (the responsible agent)
- A state: proposed, accepted, hold, in-progress, blocked, review, done, or killed
- A done condition (task-level, explicit)
- A cost cap (money)
- An optional discussion thread
- Artifacts it has produced

**Example.** Mika (the Acme Builder) owns "Implement Stripe webhook handler." It depends on "Define payment schema," which must finish first. Done condition: "webhook endpoint returns 200 for all test events and logs to the canonical store." Cost cap: $12. When Mika completes it, the dependent task "Connect payments UI to API" moves from hold to accepted automatically.

Tasks are the unique producers of artifacts. A task that builds the signup flow produces a code artifact. A task that writes landing page copy produces a content artifact. The bet aggregates these; it does not own them.

**No central planner.** There is no orchestrator agent deciding what all agents should do. The Product Manager integrates and unblocks but does not micromanage. Sequences emerge from task dependencies: when task A completes, dependent tasks on hold move to accepted. The Dependency Watcher handles this automatically.

---

## Sessions: bounded runs with resumability

A session is one agent's bounded run on a task. When an agent picks up a task, it starts a session. When the context window is about to compact, the session ends. The agent writes session notes. A new session picks up where the last left off.

A task can span many sessions. Mika works a session on Acme payments, makes progress, hits a question about Stripe fee structure, and hands off to a human. The human answers. Mika starts a new session and continues. Two weeks later, the original session notes and handoff history are still there.

The agent's memory persists between sessions through product knowledge (L2) and practice knowledge (L3). Sessions give resumability without locking the model into a single long-running process.

---

## Handoffs: agents decide when to transfer work

There is no pre-wired routing. When Mika finishes a backend API and the work moves to a frontend task, she calls a handoff with a structured message: what was done, what artifacts exist, what remains, who should pick it up. The handoff can specify an agent by ID or a role ("builder with frontend skills").

Handoffs to humans work the same way. When an agent hits something it cannot resolve — a product decision, an approval for a risky action — it creates a handoff with `to: human` and `reason: blocked`. The task moves to blocked. The human replies; the task resumes.

**Cross-team work** uses the same mechanism. The Acme team needs a platform endpoint. The Acme PM opens a chat thread to the Platform PM. They agree on a cross-team task. It lives on the Acme bet for tracking but the work happens inside the platform team's rhythm.

---

## Routines: recurring work with persistent memory

A routine is a recurring trigger attached to a named agent, with state that persists across runs. Three trigger shapes:

- **Calendar** — every Monday at 9am
- **Event** — every time a landing page ships, run brand-voice review
- **Heartbeat** — every hour, check cost burn

Every routine has a named owner who holds the thread of memory. Helena (the Practice Facilitator for Growth) owns "weekly growth metrics review." Every Monday she checks what campaigns shipped, compares conversion numbers against practice benchmarks, and posts a summary. When she found Ambrovia's email open rates dropped 15% after a subject-line change, she flagged it for the founder.

Adding a routine is always a human review item. A misconfigured routine burns cost silently. Routines that stop producing actionable output are candidates for retirement.

---

## Deliberate absences

| What HyperIdle does not have | Why |
|------------------------------|-----|
| Workflows or DAGs | Task dependencies create sequencing. Content is decided by the team, not a pre-wired graph. |
| Duration caps | Money is the budget axis. "Is the cost within appetite?" not "has a calendar date passed?" |
| Central planner agent | The PM coordinates. Each agent decomposes its own work. Orchestration emerges from dependencies. |
| Crew-per-task model | Teams form per product and persist. Context does not evaporate after one bet. |

---

Next: [Human + AI Collaboration](./human-ai-collaboration.md) — how trust is earned, how review works, and how cost stays visible.
