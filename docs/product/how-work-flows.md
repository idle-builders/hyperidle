# How Work Flows

HyperIdle has five process primitives: Team, Bet, Task, Session, and Routine. Everything else in the process layer is mechanics on top of these. There are no workflows, no DAGs, no central planner, no duration caps. Sequences emerge from task dependencies, not from pre-wired graphs.

---

## Teams: persistent, product-bound

A team is a small group of agents bound to a product — not to a bet, not to a project. The Nimmly team works on Nimmly. The Ambrovia team works on Ambrovia. Both teams exist for the life of their respective products.

This is the single biggest departure from how most agent frameworks work. CrewAI forms a crew per task. LangGraph assembles a graph per invocation. HyperIdle forms a team per product. The reason is simple: teams that ship together accumulate context.

The Nimmly Builder agent that shipped auth in January ships payments in March. It has read every Nimmly decision, every Nimmly failure, every Nimmly architecture document. That context is why the second bet is faster than the first, and the tenth is faster than the second. Dissolving the team after one bet throws all of that away.

A typical team includes: a Product Manager (the team lead), one or more Builders, a Growth Agent, and an Ops Agent. The roster flexes with the product's lifecycle phase — a product in discovery needs different coverage than one in maintenance. Agents belong to exactly one team. An agent that's needed on a new product must finish its work on the current one and transfer cleanly.

---

## Bets: shaped, committed, time-boxed

Work comes in as bets. A bet is a shaped, committed piece of work with an explicit done condition and a money appetite.

**Shape first.** The Product Manager writes a pitch: the problem, what success looks like, rough scope, things explicitly out of scope ("no-gos"), rabbit holes to watch for. The pitch lands on the Work view canvas as a shaped card. No tasks yet. No decomposition. Just a description of what the team is betting on.

**Then commit.** The founder moves a pitch from the shaped column to the committed column. At that moment, a done condition is drafted — an explicit statement of what "done" means for this bet — and the team begins work. A bet is not in progress until it has a done condition. Vague done conditions are the most common reason bets drift.

**Money appetite, not duration.** A bet has a cost cap in real currency (for example, $800 USD). It never has a deadline or a sprint length. The `created_at` and `shipped_at` dates are recorded for retros; their delta is informational. The budget axis is money only. This forces honest trade-offs: if the work costs more than the appetite allows, something has to change — the scope, the approach, or the decision to continue.

**Bets can change.** Done conditions can be revised. Hypotheses can be updated. But every change goes through a review thread. The Product Manager drafts the revision and the reasoning; the founder approves, requests changes, or rejects. Every change is logged with timestamp and reasoning. The discipline is the audit trail, not the rigidity.

**No backlog.** Shaped pitches that are not committed in two cycles expire. There is no "later" pile. This is intentional. An idea that isn't worth committing to now either needs reshaping or should not be done.

---

## Tasks: the unit of agent work

Once a bet is committed, each team member decomposes their part of it. This is decentralized by design.

The Builder looks at the pitch and the done condition, queries its practice knowledge for "what tasks does shipping an auth integration typically involve," and proposes the tasks it will own. The Growth Agent does the same for its work stream. The Ops Agent does the same for deployment. Each member proposes the tasks they understand, drawing on practice knowledge from previous bets across all products.

The Product Manager reviews the assembled task list, deduplicates overlap, identifies gaps, and accepts or asks for revision. This is intra-team — no human review at this stage. Once accepted, agents begin sessions.

Each task has:
- An owner (the agent responsible right now)
- A state: proposed, accepted, hold, in-progress, blocked, review, done, or killed
- A done condition (task-level, explicit)
- A cost cap (money)
- An optional thread for discussion
- Artifacts it has produced

Tasks are the unique producers of artifacts. A task that builds the signup flow produces a code artifact. A task that writes the landing page copy produces a content artifact. The bet aggregates these for display; it does not own them.

**No central planner.** There is no orchestrator agent that decides what all the other agents should do. The Product Manager integrates and unblocks; it does not micromanage. Sequences emerge from task dependencies: when task A completes, dependent tasks that were on hold move to accepted automatically. The Dependency Watcher handles this — no agent intervention required.

---

## Sessions: bounded runs

A session is one agent's bounded run on a task. When an agent picks up a task, it starts a session. When the agent's context window is about to compact, the session ends. The agent writes session notes, and a new session can pick up where the last one left off.

A task can span many sessions. Mika (a Builder agent) works a session on the Nimmly payments task, makes progress, hits a question about the Stripe fee structure, and hands off to a human. The human answers. Mika starts a new session and continues. Two weeks later, the original session's notes and all handoff history are still there.

Sessions are how HyperIdle gets resumability without locking the model into a single long-running process. The agent's memory persists between sessions through its product knowledge (L2) and its practice knowledge (L3). The session is the contract between the task and the execution — not a long-running daemon.

---

## Handoffs: runtime coordination

Agents decide at runtime when to transfer work. There is no pre-wired routing.

When Mika finishes the backend API for a new feature and the work moves to a frontend task, Mika calls a handoff with a structured message: what was done, what the artifacts are, what remains, and who should pick it up next. The handoff can specify a specific agent by ID, or a role ("builder with frontend skills"). If a role is specified, the Product Manager resolves it to the best available agent.

Handoffs to humans work the same way. When an agent hits something it cannot resolve alone — a product decision, an approval for a risky action — it creates a handoff with `to: human` and `reason: blocked`. The task moves to blocked. The human replies; the task moves back to in-progress.

This is the same shape as a code review: the agent is not failing, it is asking for judgment at exactly the point where judgment is needed. Humans are identities in the same matrix as agents, not a special category outside it.

**Cross-team work** uses the same infrastructure. The Nimmly team needs a new endpoint from the platform team. The Nimmly Product Manager opens a chat thread to the Platform Product Manager, explains the need, and they agree on a cross-team task. The task lives on the Nimmly bet (so the done condition tracks it) but the work happens inside the platform team's rhythm. When done, the artifact lands where Nimmly expects it.

---

## Routines: recurring work with memory

A routine is a recurring trigger attached to a named agent, with persistent state across runs. Three trigger shapes: calendar-shaped (every Monday at 9am), event-shaped (every time a landing page artifact ships, run brand-voice review), or heartbeat-shaped (every hour, check cost burn).

Every routine has a named owner who holds the thread of memory. Helena, a Practice Facilitator, owns the "weekly metrics review" routine. That doesn't mean Helena runs every execution — it means Helena holds the context ("what I watched last week, what I found, what I want to check this time"). If Helena is overloaded and delegation is allowed, a teammate with the right skill picks up the execution and writes back into Helena's memory state. The ownership and the memory are preserved; the execution can flex.

Routines can also run as sleep-time passes: memory updates with no review thread produced. An agent stays current on its practice without consuming attention. When it needs to ship a copy review, its context is already up to date.

Adding a routine is always a human review item. A misconfigured routine can burn cost silently. Routines that no longer produce anything actionable are candidates for retirement — the Chief of Staff flags these and the founder prunes them in the Knowledge view.

---

## What HyperIdle does not have

These are deliberate absences:

**No workflows or DAGs.** There is no "if task A then task B then task C" graph. Task dependencies create natural sequencing. But the content of those dependencies is decided by the team based on what the work actually requires — not by a pre-wired graph.

**No duration caps on bets or tasks.** Deadlines are informational telemetry. Money is the budget axis. If a bet is taking longer than expected, the right question is whether the cost is still within appetite — not whether a calendar date has passed.

**No central planner agent.** There is no master agent that routes work to all other agents. The Product Manager coordinates and integrates. Each agent decomposes its own work stream. Orchestration emerges from task dependencies, not from top-down assignment.

**No crew-per-task model.** There is no concept of assembling a fresh crew for each bet. The team forms per product and persists. Context does not evaporate at the end of a bet.

---

For how humans and agents coordinate around trust and decision-making, read [Human + AI Collaboration](./human-ai-collaboration.md). For how what agents learn gets stored and reused, read [How Knowledge Compounds](./how-knowledge-compounds.md).
