# Agents

How agents work, what wakes them, and how to add more.

For agent identity and the full lifecycle, see [agent-layer/agent-model.md](../../agent-layer/agent-model.md).

---

## Your assistant

Every HyperIdle user gets a personal **assistant** — created during setup, one per human. It is an individual agent: it works for you, and like every agent it is in exactly one team — one of yours. It can see what you can see and act on your behalf through the same tools any other agent uses.

Open the assistant as an overlay from the **Assistant** button in the sidebar's top row, next to search. Ask it to draft a task, look something up, or explain what's happening. You can see every change it makes.

---

## Team agents

Team agents do the work on tasks. A fresh install has no team agents. You get them two ways:

**Install the role-personas plugin.** Go to **Settings → Plugins** and install **role-personas**. It brings seven shaped agents: Builder, Designer, Product Manager, QA Engineer, Growth, Ops, and Facilitator — each with a name, discipline, system prompt, and harness selection. Install it for your team. You can edit any of them afterward.

**Add one by hand.** Go to the team page in Work and click **Add agent**, or use **Settings → Agents → + Add Agent**. Fill in a name, discipline, system prompt, harness, and max concurrent sessions.

---

## What wakes an agent

An agent runs when any of these happen:

- **A task it owns is accepted.** Set `ownerAgentId` on a task and accept it — the agent starts a session.
- **It is mentioned or messaged in a thread it's part of.**
- **A subscription fires.** An event subscription wakes the agent when one of the nine object events occurs. A schedule subscription wakes it on a cron schedule.

---

## Subscriptions

An agent's subscriptions live on its profile page (click the agent's name anywhere it appears). Each subscription is either an event (one of task/thread/document/user created or changed) or a cron schedule. A firing subscription starts a session.

The role-personas plugin installs subscriptions on its agents automatically. You can inspect and adjust them.

---

## Harness, model, and concurrency

Each agent has:

- **Harness** — which CLI runs it: `claude` (Claude Code), `codex`, `opencode`, or `cursor-agent`. The harness uses its own login; no API key is set in HyperIdle.
- **Model** — selected from the models the harness knows about. What is available depends on which harness you picked.
- **Max concurrent sessions** — how many sessions this agent can run at once.

Edit these in **Settings → Agents** or on the agent's profile page.

---

## Sessions

A session is one bounded run of an agent on a task. It runs in a sandbox, reads the task and relevant knowledge, and writes back what it produces. You can watch it in the task's session view. Stop a session from the task page or session view.

---

## Approval rate

The agent's profile shows its approval rate — the share of reviews where you approved without requesting changes. This is informational. It does not gate any action.

---

Next: [Running Your Team](./running-your-team.md)
