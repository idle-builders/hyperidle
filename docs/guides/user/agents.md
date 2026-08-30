# Agents

How you work with the agents on your team: your personal Assistant, the agent categories you'll encounter, and what happens when agents run. For agent identity, composition, and lifecycle in depth, see [agent-layer/agent-model.md](../../agent-layer/agent-model.md).

## Your Assistant

Every HyperIdle user has a personal **Assistant** (role `assistant`, category `individual`) — created for you at registration, one per human. It lives in a persistent conversation thread in an overlay anchored to the bottom-right of the window, opened from the **Assistant button in the top row of the sidebar** (next to the search field). The Assistant is scoped to you: it sees what you can see and acts on your behalf.

### Talking to your Assistant

Open the Assistant overlay by clicking the **Assistant button** in the top row of the sidebar, next to the search field (no keyboard shortcut). Describe what you need in natural language; the Assistant replies in the same thread, the same way any other agent replies into a conversation it's part of.

Ask the Assistant to draft a task in plain language. It uses `create_task` to place a proposed task on your team's work queue. You then review and accept it — the Assistant never changes task state on your behalf without your confirmation.

## Agent categories

Two categories — `team` and `individual`:

**Team agents** — do the work on tasks. A team's roster is derived from its functions (development, design, product, marketing, sales, support, operations, research), so you only get the roles your team needs. The full catalog: Builder, Designer, Product Manager (team lead — shapes tasks, coordinates handoffs), QA Engineer, Growth, Brand Voice, Ops, Support, Sales, Content Writer, Data Analyst.

**Individual agents** — your Assistant (above). Scoped to one user, not a team.

## How agents work

Agents run in **sessions** — bounded work units on a specific task. Each session:

1. Gets context assembled from the task tree and relevant knowledge
2. Works in a sandbox working directory toward the task's done condition
3. Creates review items when it needs your approval
4. Finishes and captures learnings back into the knowledge layer

You don't manage sessions directly. Agents pick up work from accepted tasks, run sessions, and surface results through Conversations. See [three-core-views.md](./three-core-views.md) for where sessions appear, and [process-layer/tasks-and-sessions.md](../../process-layer/tasks-and-sessions.md) for the underlying lifecycle.
