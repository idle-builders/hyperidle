# What is HyperIdle?

HyperIdle is an operating system for AI-first companies. It manages the organizational work that happens between "we have AI agents" and "the agents are actually shipping product." That gap is where most teams fail today.

---

## The problem

Running a team of AI agents is not a solved problem.

You can wire up Claude or GPT-4 to a task. The agent does the task. But who decides what tasks to work on? Who tracks whether the work is meeting the goal? Who stops the agent from spending $400 on a feature nobody asked for? Who captures what the agent learned so the next agent starts smarter?

Slack, Linear, Notion, and GitHub answer these questions for human teams — but they were built around humans reading everything and clicking buttons. Agents can't participate in them as first-class members. There is no "log in as the Builder agent and pick up a task." There is no way to give an agent a budget and let it autonomously manage spend. There is no shared memory that compounds across agents and products over time.

Agent frameworks like CrewAI or LangGraph solve a different problem: they execute tasks. They are not operating systems for a company. They don't handle team persistence, budget enforcement, knowledge accumulation, or human oversight at scale. A CrewAI crew forms per task and dissolves when it finishes. The next crew starts from zero. The company never accumulates context.

HyperIdle solves the organizational problem.

---

## The answer

HyperIdle is a meta layer. It sits between the agents doing work and the humans directing it. It does not call models or execute tools — those are the agent harnesses' responsibilities. HyperIdle manages the structure: who works on what, what they know, how they coordinate, and how humans stay in the loop.

Three things make it different from anything else:

**Teams persist.** An AI team stays together across successive bets on the same product. The Builder agent that shipped Nimmly's auth in January ships its payments in March. It knows the codebase. It knows the brand. It knows what broke last time. That accumulated context is the company's most valuable asset — HyperIdle makes sure you keep it.

**Humans validate, agents execute.** Agents handle the execution. Humans hold the judgment. This is not a restriction — it is the product's design. A system where agents make irreversible decisions without human review is not safer, it is just faster at making mistakes. HyperIdle keeps humans in every loop that matters and out of every loop that doesn't.

**Knowledge compounds.** What an agent learns on one product is available to every agent on every other product. The Builder who discovered the right chunk size for file uploads on Ambrovia writes that into the practice. The Builder on Nimmly gets it for free. The tenth bet is faster than the first because the practice has grown.

---

## Three layers

HyperIdle is built in three strict layers.

**The Human Interface** is the Factory app — a macOS desktop application. Founders and team leads review agent work, plan bets, and curate knowledge here. Three views plus a sidebar. Nothing else.

**The Meta Layer** is the organizational kernel. It manages who works on what, routes review items to the right human view, enforces cost limits, tracks what teams know, and fires routines. It never calls models. The Meta Layer splits into two internal packages: Kernel (stable protocols — routing, persistence, events) and Fabric (volatile heuristics — scoring, propagation, notifications). The kernel never imports from the Fabric.

**The Agent Runtime** is the adapter boundary where agent harnesses actually execute — Claude SDK, workspace files, observability. HyperIdle manages the orchestration; the runtime does the execution. The layering is strict: the Human Interface depends on the Meta Layer, the Meta Layer depends on the Agent Runtime. No layer reaches past its neighbor.

---

## The Factory app

The Factory is the single window where human oversight happens. It has four zones:

- **Conversations** is where review threads and chat threads live. An agent proposes deploying a landing page; the founder approves, comments, or requests changes — exactly like a GitHub pull request review. Agents initiate conversations with humans, not just the other way around.

- **Work** is where bets are planned and tracked. The Canvas shows shaped pitches and committed bets. The task list shows what every agent is working on, what's blocked, and what it has cost so far.

- **Knowledge** is the company wiki. Knowledge items organized by practice and product. The founder opens it weekly to prune stale practices, validate new patterns, and add the tacit knowledge agents cannot generate — customer intuition, brand taste, market judgment.

- **The Rail** is the right sidebar, always visible. Factory vital signs: active bets, blocked agents, cost burn, recent knowledge additions. Ambient awareness that does not interrupt.

---

## Who it is for

HyperIdle is for founders and CTOs of AI-first companies who are building products with small AI agent teams. Not enterprises running compliance bots. Not researchers benchmarking models. Companies building real products where:

- The team is mostly agents, not humans
- Multiple products are in flight at once
- Accumulated knowledge is the competitive advantage
- The founder needs leverage, not a new place to do work

A good fit looks like this: you are building three products simultaneously. Each has a product manager agent, one or two builder agents, a growth agent. You want to review what ships, set the direction, and trust the agents to execute — without reading every commit or approving every action. HyperIdle is the system that makes that possible.

A bad fit: you want to automate a single workflow. Use n8n or Zapier.

---

## What comes next

This document introduces the system. The other three documents in this series go deeper:

- [How Work Flows](./how-work-flows.md) — the process model: teams, bets, tasks, sessions, handoffs
- [Human + AI Collaboration](./human-ai-collaboration.md) — the trust model, autonomy levels, verdict grammar
- [How Knowledge Compounds](./how-knowledge-compounds.md) — five knowledge layers, practices, facilitation, routines
