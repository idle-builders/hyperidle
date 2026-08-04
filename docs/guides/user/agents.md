# Agents

How you work with the agents on your team: your personal Assistant, the agent categories you'll encounter, and what happens when agents run. For agent identity, composition, and lifecycle in depth, see [agent-layer/agent-model.md](../../agent-layer/agent-model.md).

## Your Assistant

Every HyperIdle user has a personal **Assistant** (role `assistant`, category `individual`) — created for you at registration, one per human. It lives in a persistent conversation thread in an overlay anchored to the bottom-right of the window, opened from the **Assistant button in the top row of the sidebar** (next to the search field). The Assistant is scoped to you: it sees what you can see and acts on your behalf.

### Talking to your Assistant

Open the Assistant overlay by clicking the **Assistant button** in the top row of the sidebar, next to the search field (no keyboard shortcut). Describe what you need in natural language; the Assistant replies in the same thread, the same way any other agent replies into a conversation it's part of.

**Drafting a bet from the thread currently does not work.** The Assistant has `create_bet`/`edit_bet` among its tools, but drafting requires a team the Assistant cannot currently resolve — create bets form-first (New Bet) for now. The Assistant never commits a bet on your behalf regardless — committing is always your action.

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
