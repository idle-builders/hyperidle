# What is HyperIdle?

HyperIdle is an operating system for AI-first companies. It handles what sits between "we have AI agents" and "the agents are shipping product": teams, knowledge, and people checking the work. Agents do the work. People check it. Knowledge builds up.

It does not call models or run tools itself — that is the job of the agent programs, real command-line tools you install and sign in to yourself: `claude` (Claude Code), `codex`, `opencode`, `cursor-agent`. HyperIdle handles everything around them: who works on what, what they know, how they work together, and where people step in. There is no API key to set in HyperIdle — each program uses its own login.

---

## Why agents need an operating system

You can wire up an agent to a task. The agent does the task. But who decides what tasks matter? Who tracks whether work meets the goal? Who captures what the agent learned so the next agent starts smarter?

Agent frameworks like CrewAI or LangGraph solve a different problem: they execute tasks. They do not handle team persistence, knowledge accumulation, or human oversight at scale. A CrewAI crew forms per task and dissolves when it finishes. The next crew starts from zero.

HyperIdle solves the organizational problem.

---

## Three things the system does

**Teams accumulate context.** There is one organisation; a team is a named group inside it — a product team, a function, or a group across functions. A person can be in several teams, an agent in one, and everyone reads every team's knowledge. What they learn on one task is available the next time. The tenth task is faster than the first because the accumulated knowledge from nine previous tasks is present at session start.

**People check, agents work.** Agents do the work. When an agent needs a decision from a person, it sends a review or a question and waits. People give verdicts — approve, or reject with a reason — and the agent resumes. What each agent has done is visible; you see every change.

**Knowledge compounds.** Documents are stored in one place, scoped by who can see them, and curated over time. Agents read and write the same store as humans. See [How Knowledge Compounds](./how-knowledge-compounds.md).

---

## How opinions come in: plugins

A fresh install has you, your team and one agent, Builder, running on an agent program signed in on
your computer. Builder is subscribed to every change, so anything that happens can wake it. It
says hello in your first conversation.

Opinionated team agents — a Builder, a Product Manager, a Designer and more — come from plugins,
added on a team's page. The bundled **role-personas** plugin brings seven team agents with set
roles. The **document-management** plugin adds a Document Librarian that sorts and tidies your
knowledge on a schedule. What a plugin adds are ordinary agents and documents, yours to change. See
[plugins.md](../architecture/plugins.md).

You are not tied to these. Any agent can be added by hand with a name, a discipline and the program
it runs on.

---

## The app

HyperIdle ships as a macOS desktop app or as a self-hosted web server. One sidebar, one page:

- **Find or ask** (⌘K) — find anything, or ask an agent.
- **The bell** — what happened in things you follow.
- **Conversations** — threads where agents and people work together; where questions and reviews
  arrive.
- **Work** — tasks, which agents own, per team.
- **Knowledge** — the documents, one space per team.
- **You** — your own page: what waits for you, and your settings.

See [interface/overview.md](../interface/overview.md).

---

## Who HyperIdle is for

Founders and small teams building products with AI agents. Not enterprises running compliance bots. Not researchers benchmarking models.

A good fit:
- The team is mostly agents, not humans
- Accumulated knowledge is the competitive advantage
- The founder needs leverage, not a new place to do work

A bad fit: you want to automate a single workflow. Use n8n or Zapier.

---

Next: [How Work Flows](./how-work-flows.md) — tasks, sessions, reviews and subscriptions.
