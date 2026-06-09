# What is HyperIdle?

HyperIdle is an operating system for AI-first companies. It manages the organizational layer between "we have AI agents" and "the agents are shipping product" — teams, budgets, knowledge, human oversight. Agents execute. Humans validate. Knowledge compounds across every product.

| Layer | What it does | Who uses it |
|-------|-------------|-------------|
| **Human Interface** | Review agent work, plan bets, curate knowledge | Founders, team leads |
| **Meta Layer** | Route work, enforce budgets, track knowledge, fire routines | The system (no model calls) |
| **Agent Runtime** | Execute tasks via agent harnesses (Claude SDK, tools, files) | AI agents |

---

## Agents need an operating system, not just a harness

You can wire up Claude or GPT-4 to a task. The agent does the task. But who decides what tasks matter? Who tracks whether work meets the goal? Who stops an agent from spending $400 on a feature nobody asked for? Who captures what the agent learned so the next agent starts smarter?

Slack, Linear, Notion, and GitHub answer these questions for human teams. They were built around humans reading everything and clicking buttons. Agents cannot participate as first-class members.

Agent frameworks like CrewAI or LangGraph solve a different problem: they execute tasks. They are not operating systems. They do not handle team persistence, budget enforcement, knowledge accumulation, or human oversight at scale. A CrewAI crew forms per task and dissolves when it finishes. The next crew starts from zero.

HyperIdle solves the organizational problem.

---

## Three properties that define the system

**Teams persist across bets.** The Builder agent that shipped Nimmly's auth in January ships its payments in March. It knows the codebase, the brand, and what broke last time. That accumulated context is the company's most valuable asset. HyperIdle keeps it.

**Humans validate, agents execute.** Agents handle execution. Humans hold judgment. A system where agents make irreversible decisions without review is not safer — it is faster at making mistakes. HyperIdle keeps humans in every loop that matters and out of every loop that does not.

**Knowledge compounds across products.** What an agent learns on one product is available to every agent on every other product. The Builder who discovered the right chunk size for file uploads on Ambrovia writes that into the practice. The Builder on Nimmly gets it for free. The tenth bet is faster than the first.

---

## The process layer sits between agents and humans

HyperIdle is an OS for your agent factory. It does not call models or execute tools — those are the agent harnesses' responsibilities. HyperIdle manages the structure: who works on what, what they know, how they coordinate, and how humans stay in the loop.

The Meta Layer splits into two internal packages:

- **Kernel** — stable protocols: routing, persistence, events. Never changes without careful review.
- **Fabric** — volatile heuristics: scoring, knowledge propagation, notifications. Changes frequently as the system learns.

The Kernel never imports from the Fabric. The layering is strict: Human Interface depends on Meta Layer, Meta Layer depends on Agent Runtime. No layer reaches past its neighbor.

---

## The Factory app: one window for human oversight

The Factory is a macOS desktop application with three views and a sidebar.

- **Conversations** — review threads, chat threads, founder-initiated conversations. An agent proposes deploying a landing page; the founder approves, comments, or requests changes. Same shape as a GitHub pull request.
- **Work** — bets planned and tracked. The Canvas shows shaped pitches and committed bets. The task list shows what every agent is doing, what is blocked, and what it has cost.
- **Knowledge** — the company wiki. Knowledge items organized by practice and product. Founders prune stale practices, validate new patterns, and add tacit knowledge agents cannot generate.
- **Ambient awareness** — embedded indicators within each view: Conversations filter chips surface blockers and triage state, WorkTeam health indicators show agent status, cost burn appears in the team burn-vs-cap section. Ambient awareness without interruption.

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
