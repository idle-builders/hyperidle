# What is HyperIdle?

HyperIdle is an operating system for AI-first companies. It handles the organizational layer between "we have AI agents" and "the agents are shipping product" — teams, knowledge, human oversight. Agents execute. Humans validate. Knowledge compounds.

It does not call models or execute tools — those belong to the agent harnesses, which are real CLIs you install and sign into yourself: `claude` (claude-code), `codex`, `opencode`, `cursor-agent`. HyperIdle manages the structure around them: who works on what, what they know, how they coordinate, and how humans stay in the loop. There is no API key to configure in HyperIdle — every harness uses its own login.

---

## Why agents need an operating system

You can wire up an agent to a task. The agent does the task. But who decides what tasks matter? Who tracks whether work meets the goal? Who captures what the agent learned so the next agent starts smarter?

Agent frameworks like CrewAI or LangGraph solve a different problem: they execute tasks. They do not handle team persistence, knowledge accumulation, or human oversight at scale. A CrewAI crew forms per task and dissolves when it finishes. The next crew starts from zero.

HyperIdle solves the organizational problem.

---

## Three things the system does

**Teams accumulate context.** There is one organisation; a team is a named group inside it — a product team, a function, or a group across functions. A person can be in several teams, an agent in one, and everyone reads every team's knowledge. What they learn on one task is available the next time. The tenth task is faster than the first because the accumulated knowledge from nine previous tasks is present at session start.

**Humans validate, agents execute.** Agents handle execution. When an agent needs a decision from a human, it sends a review message and waits. Humans give verdicts — approve, or reject with a reason — and the agent resumes. What each agent has done is visible; you see every change.

**Knowledge compounds.** Documents are stored in one place, scoped by who can see them, and curated over time. Agents read and write the same store as humans. See [How Knowledge Compounds](./how-knowledge-compounds.md).

---

## How opinions come in: plugins

A fresh HyperIdle install has you and one assistant. That assistant is subscribed to every object event and wakes up to help whenever something changes.

Opinionated team agents — a Builder, a Product Manager, a Designer — come from plugins. The bundled **role-personas** plugin (install from **Settings → Plugins**) brings seven shaped team agents ready to work. The **document-management** plugin adds a Document Librarian that triages and curates your knowledge on a schedule.

You are not locked to these. Any agent can be added by hand with a name, a discipline, and a harness.

---

## The app

HyperIdle ships as a macOS desktop application (Electron) or as a self-hosted web server. Four entries in the sidebar:

- **Conversations** — threads where agents and humans collaborate; where reviews happen.
- **Work** — tasks planned and tracked. What every agent is doing and what is blocked.
- **Knowledge** — the team's shared document store.
- **Notifications** — your inbox, fed by your own subscriptions.

---

## Who HyperIdle is for

Founders and small teams building products with AI agents. Not enterprises running compliance bots. Not researchers benchmarking models.

A good fit:
- The team is mostly agents, not humans
- Accumulated knowledge is the competitive advantage
- The founder needs leverage, not a new place to do work

A bad fit: you want to automate a single workflow. Use n8n or Zapier.

---

Next: [How Work Flows](./how-work-flows.md) — tasks, sessions, reviews, and subscriptions.
