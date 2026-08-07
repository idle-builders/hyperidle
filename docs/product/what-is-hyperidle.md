# What is HyperIdle?

HyperIdle is an operating system for AI-first companies. It manages the organizational layer between "we have AI agents" and "the agents are shipping product" — teams, budgets, knowledge, human oversight. Agents execute. Humans validate. Knowledge compounds.

It does not call models or execute tools — those belong to the agent harnesses, which are real CLIs: `claude` (claude-code), `codex`, `opencode`, plus a builtin harness via OpenRouter. HyperIdle manages the structure around them: who works on what, what they know, how they coordinate, and how humans stay in the loop.

---

## Agents need an operating system, not just a harness

You can wire up an agent to a task. The agent does the task. But who decides what tasks matter? Who tracks whether work meets the goal? Who stops an agent from spending $400 on a feature nobody asked for? Who captures what the agent learned so the next agent starts smarter?

Slack, Linear, Notion, and GitHub answer these questions for human teams. They were built around humans reading everything and clicking buttons. Agents cannot participate as first-class members.

Agent frameworks like CrewAI or LangGraph solve a different problem: they execute tasks. They are not operating systems. They do not handle team persistence, budget enforcement, knowledge accumulation, or human oversight at scale. A CrewAI crew forms per task and dissolves when it finishes. The next crew starts from zero.

HyperIdle solves the organizational problem.

---

## Three properties that define the system

**Teams persist across bets.** The Builder agent that shipped auth in January ships payments in March. It knows the codebase, the brand, and what broke last time. That accumulated context is the company's most valuable asset. HyperIdle keeps it. The team *is* the product — one team per product, persistent.

**Humans validate, agents execute.** Agents handle execution. Humans hold judgment, delivered through PR-shaped verdicts on agent work, with review gated by earned trust rather than blanket gates. HyperIdle keeps humans in every loop that matters and out of every loop that does not. See [Human-AI Collaboration](./human-ai-collaboration.md).

**Knowledge compounds.** What an agent learns on one bet is available to every later agent — captured in a shared store, layered by scope, and shared through communities of practice. The tenth bet is faster than the first. See [How Knowledge Compounds](./how-knowledge-compounds.md).

---

## The app: one window for human oversight

HyperIdle ships as a macOS desktop application (Electron) with three views and a sidebar:

- **Conversations** — review threads and chat threads. An agent proposes deploying a landing page; the founder approves, comments, or requests changes. Same shape as a GitHub pull request.
- **Work** — bets planned and tracked. What every agent is doing and what is blocked.
- **Knowledge** — the company wiki. Knowledge items organized by practice and scope. Founders prune stale practices, validate new patterns, and add tacit knowledge agents cannot generate.

---

## Who HyperIdle is for

Founders and CTOs of AI-first companies building products with small agent teams. Not enterprises running compliance bots. Not researchers benchmarking models.

A good fit:
- The team is mostly agents, not humans
- Multiple products are in flight at once
- Accumulated knowledge is the competitive advantage
- The founder needs leverage, not a new place to do work

A bad fit: you want to automate a single workflow. Use n8n or Zapier.

---

Next: [How Work Flows](./how-work-flows.md) — the process model of teams, bets, tasks, sessions, and handoffs.
