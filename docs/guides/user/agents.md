# Agents

How you work with the agents on your team: your personal Assistant, the agent categories you'll encounter, and what happens when agents run. For agent identity, composition, and lifecycle in depth, see [agent-layer/agent-model.md](../../agent-layer/agent-model.md).

## Your Assistant

Every HyperIdle user has a personal **Assistant** (role `assistant`, category `individual`) — created for you at registration, one per human. It lives in a persistent conversation thread in an overlay anchored to the bottom-right of the window, opened from the **Assistant button in the top row of the sidebar** (next to the search field). The Assistant is scoped to you: it sees what you can see and acts on your behalf.

### Starting work by talking

The most natural way to create a bet is to describe your idea in the Assistant thread and let it draft the bet for you:

1. Open the Assistant overlay by clicking the **Assistant button** in the top row of the sidebar, next to the search field. (There is no keyboard shortcut for the overlay.)
2. Describe your idea in natural language. For example: "I want to add a waitlist page with email capture and a confirmation email."
3. The Assistant replies with context questions or clarifications, then drafts a bet — a goal and a concept body — derived from the conversation.
4. The draft appears as a **BetCard** below the Assistant's reply. Click it to open the bet at `/work/bets/:betId`.
5. Review and edit the description, done condition, and hypothesis. The draft is fully editable.
6. When the bet looks right, commit it. Committing moves the bet from `draft` to `active` — the team picks up the bet and decomposes it into tasks.

### Iterating the draft conversationally

If the draft isn't quite right, keep talking:

- "Narrow the scope to just the waitlist form — skip the confirmation email for now."
- "Add a done condition: the signup rate from the landing page is tracked in analytics."

Each reply updates the same draft in place — the Assistant is bound to your current draft bet, so edits never fork a new one. The BetCard in the thread updates on the next turn.

The Assistant edits three fields: description, done condition, hypothesis. A bet's appetite is a **cost appetite** (money, not duration) and is not editable from the Assistant — set it on the bet itself. See [running-your-team.md](./running-your-team.md) for cost caps.

### What the Assistant never does

The Assistant's drafting tools are exactly two: `create_bet` and `edit_bet`. It drafts and refines but never commits on your behalf — committing is always your action, the moment you decide work starts. Once a bet leaves `draft` status, the Assistant can no longer edit it. The Assistant also cannot create teams, add agents, or take any administrative action from the thread.

## Agent categories

Three categories — `team`, `strategy`, `individual`:

**Team agents** — do the work on a bet. A team's roster is derived from its functions (development, design, product, marketing, sales, support, operations, research), so you only get the roles your team needs. The full catalog: Builder, Designer, Product Manager (team lead — shapes and decomposes bets), QA Engineer, Growth, Brand Voice, Ops, Support, Sales, Content Writer, Data Analyst.

**Strategy agents** — knowledge-scoped, mostly background:

- **Facilitators** — five, one per community (build, product, growth, ops, facilitation). They synthesize cross-team patterns into knowledge and surface items for your attention. See [knowledge-architecture/facilitators.md](../../knowledge-architecture/facilitators.md).
- **Scout, Infra, Platform** — market analysis, shared infrastructure, and shared tooling respectively.

**Individual agents** — your Assistant (above). Scoped to one user, not a team.

## How agents work

Agents run in **sessions** — bounded work units on a specific task. Each session:

1. Gets context assembled from the task, the bet, and relevant knowledge
2. Works in a sandbox working directory toward the task's done condition
3. Creates review items when it needs your approval
4. Finishes and captures learnings back into the knowledge layer

You don't manage sessions directly. Agents pick up work from committed bets, run sessions, and surface results through Conversations. See [three-core-views.md](./three-core-views.md) for where sessions appear, and [process-layer/tasks-and-sessions.md](../../process-layer/tasks-and-sessions.md) for the underlying lifecycle.
