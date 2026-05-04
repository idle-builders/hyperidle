# Research: The Execution Layer — Where & How Agents Actually Run

Compiled from surveys of agent harnesses, workspaces, skills ecosystems, coordination protocols, and scheduling patterns as of April 2026.

This doc answers a specific question: **we're building a meta layer on top of an agent harness, not a new one — so what are the real options at each layer, and how does it stay deployable for anyone?**

Two core constraints:
1. **Deployable by anyone.** A solo builder on a laptop, a two-founder shop on a VPS, or a team on a cloud account should be able to install and run this. We don't assume any specific infrastructure. Every layer names options; the deployer picks.
2. **Agents are employees, not workflow nodes.** Agents get a job, tools, skills, an inbox, and memory — and then they decide what to do. We do not wire up DAGs. Workflow engines (Inngest, Temporal, LangGraph) are optional observability and durability layers, not the way agents get things done.

---

## 1. The Mental Model: Agent as Employee

Before picking any infrastructure, name the model. An agent-as-employee has five things:

1. **A workspace** — a place to live and work. A virtual desktop, a sandbox, a repo, an OS. Persistent across runs.
2. **Skills** — packaged know-how with the tools bundled in. Each skill is a small instruction file plus the scripts it calls (bash, Python, curl, CLI binaries, SDKs). No separate protocol layer; the skill uses whatever existing interface is most efficient.
3. **An inbox** — how it gets work and how it talks to other agents and humans. Async, searchable, auditable.
4. **Memory** — what it remembers between runs. Core facts, recent work, learned patterns.
5. **A rhythm** — when it wakes up. Heartbeat (cron-ish), inbox-driven (event), or continuous.

This is all an agent needs to function. No DAG. No workflow graph. No orchestrator wiring step 3 after step 2. No tool-description protocol layer bloating the context window. The agent reads its inbox, checks its workspace, loads the relevant skill, runs the skill's scripts against whatever existing tools the workspace provides, writes back its memory, sends messages, goes back to sleep.

Note: there is no separate "tools" layer. Tools are just whatever the workspace has installed (bash, curl, `gh`, `stripe`, Playwright, Python, etc.) and skills package the know-how on top of them. Collapsing tools into skills is what gets the 30×+ token savings over a protocol approach — see §3.

Everything below maps to one of these five.

---

## 2. Workspace — Where the Agent Lives

The workspace is the most underrated decision. It's the desk, the office, the computer. Agents need a persistent place with access to their tools. Options:

**E2B Desktop Sandbox.** Firecracker-based virtual Linux desktop. Up to 24-hour sessions. Used by Manus and others as the substrate for "a computer the agent can actually drive." Good managed default.

**Daytona.** Self-hostable workspace sandboxes; open source; Docker/k8s under the hood. Custom Regions in preview as of Q1 2026 — when GA it becomes the BYO equivalent of E2B.

**Cursor Cloud Agents (Feb 2026).** Each agent gets its own Ubuntu cloud VM with desktop, browser, and the full dev toolchain. Parallel agents across repos. Not self-hostable — it's a product — but the shape is the shape everyone is converging on.

**Devin-style per-agent VM.** Same pattern: each agent instance gets an isolated cloud sandbox. Cognition records video of the work for human review.

**Blaxel.** New (late 2025), Firecracker-based, headline feature is <25ms resume from suspension. Interesting for bursty workloads where the agent idles a lot waiting for humans.

**Docker + gVisor.** The DIY workspace. Runs anywhere Docker runs. Cold start is seconds, which is fine for employee-style work. The zero-dependency default for laptop and cheap-VPS profiles.

**Git repo as workspace.** Surprisingly workable: the "desk" is a repo, the files are the agent's workspace, Git is the memory and audit trail. MCP Agent Mail uses this pattern. Works on anything.

**Claude Desktop / Claude Cowork.** The agent lives on *your* actual computer, with access to real files, real apps, real browsers. Zero sandbox — the agent is you. Good for trusted personal work, wrong for autonomous factory work.

### Deployment profiles

- **Laptop:** Docker + gVisor, or a Git repo as workspace.
- **VPS:** Docker + gVisor, or Daytona self-hosted.
- **Managed cloud:** E2B Desktop Sandbox, or Modal.
- **BYO cloud:** Daytona (when Custom Regions GA).

The meta layer wraps all of these behind one thin interface: `spawn`, `exec`, `read`, `write`, `snapshot`, `destroy`. Switching profiles should be a config change.

---

## 3. Skills — The Unit of Everything

Skills are the biggest shift of 2025→2026, and they collapse what used to be two separate layers (tools + playbooks) into one. A skill is a **package** that contains:

- A short instruction file (`SKILL.md`) the agent reads when the skill is relevant.
- The tools the skill uses — bundled inside the skill as scripts, CLI invocations, curl calls, Python snippets, SDK usage.
- Any resources the skill needs (prompts, templates, schemas, example inputs/outputs).

The critical point: **the skill doesn't go through a protocol layer to reach its tools.** It runs `gh`, `curl`, `stripe`, `psql`, `ffmpeg`, `playwright`, a Python script, a bash one-liner — whatever the existing interface already is. No wrapper, no schema re-description, no token tax.

### Why this beats the protocol approach (MCP, specifically)

MCP was the obvious candidate for "universal tool interface" through most of 2025. The data coming out of late 2025 and early 2026 killed it for performance-sensitive work:

- **OnlyCLI benchmark:** MCP burns ~35× more tokens than CLI for identical tasks.
- **The MCP Tax (Mmntm):** a 93-tool GitHub MCP server consumes ~55K tokens before the agent does any work. A three-service setup (GitHub + Slack + Sentry) eats 143K of 200K context — 72% of the window gone to schemas.
- **Vensas benchmark:** MCP is 4–32× more expensive per task than CLI alternatives.
- **Cloudflare case study:** an API-wrapping MCP server used ~1.17M tokens; "Code Mode" (LLM writes Python, calls the raw API) used ~1K tokens. Roughly 1000× reduction.
- **Perplexity abandoned MCP internally** (CTO Denis Yarats, Ask 2026 conference, March 11 2026), explicitly citing context bloat and "clunky auth."
- **Simon Willison (Nov 2025):** "I don't use MCP at all anymore when working with coding agents. CLI utilities and libraries like Playwright Python are more effective." Skills are "maybe a bigger deal than MCP."
- **Armin Ronacher (Dec 2025):** "The skill system outperforms dynamic MCP without any of the engineering."

The argument is simple: the agent already knows `gh`, `curl`, `psql`, `stripe`, `ffmpeg`, `git`, `jq`, `playwright`, `python` from training. A skill doesn't need to describe those interfaces to the agent — it just needs to tell the agent *when and how* to use them for this specific job. The interface already exists; the skill captures the know-how on top.

MCP isn't dead — it still wins for enterprise tool discovery, standard auth, and non-CLI contexts (web chatbots, business users). We just don't need it. Our deployers are building products, not wiring up a corporate tool marketplace.

### What a skill actually contains

```
skills/
  deploy-landing-page/
    SKILL.md              # short, what this is and when to use it
    scripts/
      deploy.sh           # wraps whatever CLI / API calls are needed
      lighthouse-check.py # uses existing tools, no protocol layer
    templates/
      nginx.conf.tmpl
    examples/
      successful-run.md
      known-failures.md
```

The agent reads `SKILL.md` (small), calls the scripts (which use whatever CLI/API is best), and moves on. No tool schemas in the system prompt. No MCP server to run. No token tax.

### Progressive disclosure

Skills use three-tier loading that's now Anthropic best practice:

1. **Metadata in system prompt** (~100 tokens per skill): name, one-line description. The agent sees "you have 40 skills available."
2. **SKILL.md on demand:** when the agent decides a skill is relevant, it loads the full skill instructions via a `load_skill(name)` call.
3. **Resources on demand:** templates, example files, DB schemas, etc. loaded only when the skill's script actually needs them.

A factory with 132 skills can live in a few thousand tokens of system prompt, with full details loaded only for the two or three skills that a given task actually uses.

### What this means for the meta layer

Two different things live at two different layers, and it's important not to collapse them:

**Knowledge lives in the Practice layer (L3).** A practice is a community of practice — growth folks across products, building folks across products, ops folks across products. Its job is sharing what one team is learning with every other team in the same discipline. The artifacts here are knowledge: patterns, anti-patterns, observations, reference examples, "here's what we tried and what happened," "here's a benchmark we found." Knowledge is conversational, lightweight, and frequently updated. It does **not** require human approval to flow — the whole point is that insights move quickly between teams. The Practice Facilitator surfaces, organizes, ranks for attention, deduplicates, and keeps it fresh. Agents in the discipline read the practice's knowledge as background context for their tasks.

**But humans still participate in the practice — async, as curators, not as gatekeepers.** The failure mode of an AI-only community of practice is drift: left alone, the community starts reinforcing its own patterns, amplifying weird framings, and accumulating confident-but-wrong conclusions that no-one checks against reality. The fix is a regular, lightweight human presence — the same way a senior member of a real community of practice shows up. Specifically, humans do three things in the practice, all async and none blocking:

1. **Prioritize the agenda.** The Practice Facilitator surfaces "here are the topics and learnings the community brought up this week, ranked by attention score." The human skims and nudges — this matters more, this is noise, let's go deeper on that one. Like deciding what to put on a community meetup agenda.
2. **Review in flight.** Humans can spot-check CAPTURED and PROVISIONAL items and flag ones that look wrong, unclear, or off-brand before they settle into the active knowledge. This is a "scan and flag" activity, not a "approve every change" gate.
3. **Prune the tree.** Once knowledge is ACTIVE, humans periodically restructure it — merging duplicates, splitting overloaded topics, killing stale branches, renaming things that drifted. This is the equivalent of tending a wiki: nothing is urgent, but without it the structure rots.

This is the Practice Editor interface mode from KNOWLEDGE_ARCHITECTURE.md (Mode 5 — focused, weekly). It's the *low-frequency, high-leverage* human touch on the practice, complementary to the *high-frequency, small-batch* Factory Inbox reviews. The practice is never blocked on a human, but it's also never drifting for long without one.

**Skills live at the Chief of Staff (L4 / factory) level.** Skills are the executable, powerful, compound artifacts: packaged know-how with bundled scripts that any agent in the factory can load and run. Because skills are operational and compound across everything, they are **human-approved when changed.** The Chief of Staff drafts, proposes, and stages skill updates; new skills, edits, and retirements all land in the Factory Inbox (Mode 1) for human review. The human approves, edits, or rejects. The cost of a quietly-wrong skill propagating across the factory is much higher than a one-day approval delay.

The relationship between the two: a practice's knowledge can *inform* a future skill, but the leap from "the growth community has noticed X works" (knowledge, in the practice) to "every growth agent now runs the X recipe" (skill, in the factory) is a deliberate, human-approved promotion. Most knowledge never becomes a skill, and that's fine — knowledge has value just by being shared and read. Only the patterns that are stable, valuable, and worth operationalizing get promoted to skills.

The state machine from KNOWLEDGE_ARCHITECTURE.md splits cleanly along this line. The CAPTURED → PROVISIONAL → ACTIVE → STALE flow inside the Practice layer is *knowledge* moving through its lifecycle and never needs human approval to advance. The promotion event — when knowledge becomes worth turning into a skill — is the NEEDS HUMAN → VALIDATED transition, and it lands at the Chief of Staff level for human review.

Skills are also the distribution unit. A well-made Practice skill works in bare Claude Code without the meta layer at all, because `SKILL.md` is a vanilla format with an ecosystem of 31K+ skills behind it as of March 2026 (Anthropic's official frontend-design skill alone has 277K+ installs). If our meta layer vanishes tomorrow, the skills keep working. That's the right shape for lock-in: we lock ourselves into the *standard*, not into ourselves.

---

## 4. Tool Access — Whatever Already Exists

There is no separate "tools" layer in the meta layer. Tools are whatever the workspace has installed and whatever the skill's bundled scripts know how to call. The typical kit:

- **Shell.** Bash inside the workspace sandbox. This is 80% of what most agents need.
- **Browser.** Playwright (Python or TS), Stagehand, or Browser Use — all installable as regular libraries, called from skill scripts.
- **Code editing.** Plain editors + grep/sed, or Aider invoked as a subprocess.
- **API access.** `curl`, `httpie`, or thin SDK libraries. The agent writes and runs the call; no wrapper in between.
- **Domain CLIs.** `gh`, `stripe`, `fly`, `op` (1Password), `psql`, `ffmpeg`, `git`, `jq`. These are designed to be scripted and are already in the model's training data.
- **Custom per-product scripts.** Lives in the product's skill set. Just bash, Python, or whatever the product already uses.

The meta layer's actual job for tools is tiny:

1. Make sure the workspace has the right binaries installed for each skill (this becomes part of the skill's package metadata).
2. Handle credentials — inject them into the workspace environment so the agent doesn't have to see or handle secrets directly.
3. Log every subprocess call into the observability layer.

That's it. No protocol to maintain, no schemas to keep in sync, no marketplaces to run. The Linux userland IS the tool interface. The skill is how we package the know-how on top of it.

---

## 5. Inbox & Coordination — How Agents Reach Each Other

Agents coordinate via async message passing, not DAG sequencing. The pattern is the same as human employees: you have an inbox, people send you things, you reply when you can, urgent stuff escalates.

Consistent with §3: we don't need a coordination *protocol*. We need an **inbox data structure** — rows in SQLite or a few files in Git — that any agent can read and write. The "protocol" is the schema of a message, not a wire format over the network.

### Reference implementations worth studying

**Agent Mail (Dicklesworthstone / Steve Yegge fork).** Identities, inboxes, threaded conversations, advisory file leases over Git + SQLite. Validated on 30-agent pipelines at 49 RPS in March 2026 stress tests. Durable, auditable, no central broker. Labeled as an "MCP" project but the interesting parts — the inbox data model, the file-lease pattern, the identity scoping — have nothing to do with the MCP protocol and are worth lifting wholesale.

**LangChain Agent Inbox.** A UI layer for human-in-the-loop review of agent work. Good reference for the "inbox UX" the human side of the meta layer needs (the Factory Inbox, Mode 1).

**A2A / IBM Agntcy / ACP.** Other agent-to-agent protocol proposals. Still crystallizing. Worth tracking but not stable or necessary to depend on.

### What this means for the meta layer

The inbox is a SQLite table (or a Git-tracked directory of message files — both work, pick per deployment profile). Messages have sender, recipient, thread, subject, body, attached file leases, timestamps. Agents read their inbox via a skill, write to others' inboxes via a skill. Workers send up the matrix to their Product Manager, sideways to their Practice Facilitator, down to sub-agents, and receive from all three. The Factory Inbox (Mode 1) reads the same table with humans as identities.

No protocol. Just an inbox schema and the `read_inbox` / `send_message` skills every agent loads.

---

## 6. Memory — What the Agent Remembers

Already covered in KNOWLEDGE_ARCHITECTURE.md and KNOWLEDGE_FABRIC.md (see also `archive/RESEARCH_CONTEXT_MEMORY.md` for the original research). The short version for this doc:

- L0 Session: ephemeral TOON packs, JIT loaded.
- L1 Task: SQLite per task, failures first-class.
- L2 Product: split markdown (human-read) + SQLite (agent-read).
- L3 Practice: SQLite per community + TOON skill packs.
- L4 Factory: markdown only.

Options for the agent-runtime side of memory:

- **Letta** — tiered core/archival/recall memory as a first-class runtime concept. Agents edit their own memory via tools. Persistent agent server. The right pick if a deployer wants memory handled for them.
- **Claude Agent SDK + our fabric** — the harness stays memory-agnostic; the meta layer writes to SQLite/TOON/markdown. More work for us, more control for us.
- **Git-backed memory** — the MCP Agent Mail approach: memory is files in Git, diffable and auditable. Zero infra. Great for laptop profile.

All three coexist. The meta layer exposes `read_memory(layer, key)` and `write_memory(layer, key, value)`; the backend is whichever of the three the deployer picked.

---

## 7. Rhythm — When the Agent Wakes Up

Four patterns, all employee-natural:

**Heartbeat.** The agent wakes on a schedule (once a day, once an hour, every 5 min), checks its inbox, checks its workspace, decides whether to do anything. Paperclip AI's entire model — 43K+ GitHub stars by April 2026. Benchmarks (March 2026) show 60–80% cost reduction vs. continuous monitoring. This is the default rhythm for facilitators: Chief of Staff daily, Practice Facilitator per-cycle, Product Manager per-cycle.

**Inbox-driven.** The agent wakes when a message arrives in its inbox. Message → wake → act → reply → sleep. The default rhythm for task workers and for agent-to-agent handoffs. MCP Agent Mail is built for this.

**Continuous.** The agent stays alive across interactions, with persistent memory in-process. Expensive and fragile — but genuinely right for Mode 4 Coach Conversation, where the agent *is* the long-running dialogue partner. Letta's native model.

**Calendar-driven.** The agent has a calendar with meetings and deadlines. Emerging pattern (not yet formalized). A useful mental model for "standing meetings" of the facilitator family — e.g., "every Friday the Chief of Staff runs a portfolio review."

### What this does *not* need

It does not need Inngest. It does not need Temporal. It does not need LangGraph. None of those are wrong — they're fine as durability layers under the hood — but the meta layer does not expose them, and a deployer is not forced to run one.

A laptop deployer can implement all four rhythms with `cron` + SQLite + a background Python process that reads the inbox. That is enough. A VPS deployer can add a simple queue. A team deployer that wants hardcore durability guarantees can plug in Temporal *underneath* — but only because they chose to, not because the meta layer asked.

The meta layer's scheduling interface is one function: `schedule(agent, trigger)` where trigger is `{kind: "heartbeat", interval}` or `{kind: "inbox", topic}` or `{kind: "continuous"}` or `{kind: "calendar", cron}`. The implementation is whatever the deployer has lying around.

---

## 8. Agent Harnesses — The Runtime Inside the Workspace

The harness is the loop that actually calls the model, handles tool use, and manages the conversation. The meta layer invokes a harness; the harness runs inside the workspace; the workspace gives it access to tools.

**Claude Agent SDK (Anthropic).** Thin library. Skills-native, sub-agents built in, bash + file tools as first-class primitives (this is the right default now — bash beats MCP on tokens by ~30×). Good fit for Claude-first deployers.

**Letta / MemGPT.** Memory-first harness with its own server. Good fit if tiered memory is the hero feature.

**Goose (Block).** MIT-licensed, local-first desktop + CLI, multi-model. Good fit for laptop profile and privacy-sensitive work.

**OpenAI Codex CLI / oh-my-codex.** OpenAI's barebones harness + a community ambient HUD layer. Good fit for OpenAI-first deployers. HUD ideas are worth stealing for our Mode 2.

**OpenHands (formerly OpenDevin).** 38K+ GitHub stars. Open-source, composable Python SDK, runs locally or at scale. Code-first; interacts with CLI, browser, files like a human dev.

**Factory.ai Droids, Devin, Cursor Cloud Agents.** Closed products. Inspiration only.

**OpenClaw.** 9 CVEs in 4 days. Avoid.

The meta layer supports more than one harness from day one via a small adapter interface: spawn an agent with a prompt, tools, and skills; stream events; stop; read the conversation.

---

## 9. Observability — Optional, But Everyone Eventually Needs It

Once a deployer has more than a handful of agents running, they will want traces, evals, and cost tracking. Options:

- **Self-hosted: Langfuse.** One `docker compose up`. Traces, evals, prompt mgmt, cost. Open source.
- **Managed: LangSmith, Helicone.** Zero ops, paid.
- **Evals-first: Braintrust.**
- **ML-heavy: Arize Phoenix.**

What matters at the meta layer is that every harness call, every tool invocation, every skill load, and every inbox message emits an OpenTelemetry-style span through one adapter. Backend is a deployer config. Default adapter can be a no-op for a minimal laptop install.

Microsoft's Agent Governance Toolkit (April 2, 2026) and NVIDIA's OpenShell are the adjacent category: *runtime* guardrails (policy enforcement, budget limits, approval gates) rather than DAG orchestration. These are becoming standard and worth integrating as the deployer scales.

---

## 10. The Stack, End to End

```
┌───────────────────────────────────────────────────────────┐
│ META LAYER (what we build)                                │
│   - Knowledge fabric (L0–L4, KNOWLEDGE_ARCHITECTURE)      │
│   - Facilitator family (Chief of Staff, Practice, Product)│
│   - Four human interface modes (Inbox/HUD/Canvas/Coach)   │
│   - Job descriptions, skills, inbox routing, attention    │
└───────────────────────────────────────────────────────────┘
    │             │             │             │             │
    ▼             ▼             ▼             ▼             ▼
 WORKSPACE     SKILLS        INBOX         MEMORY        RHYTHM
 options:     (bundle       options:      options:      options:
 Docker+       tools         SQLite table, Letta,        cron+SQLite,
 gVisor,       directly:     Git-tracked   SQLite+TOON,  Inngest,
 E2B,          bash, curl,   messages,     Git-backed    Temporal,
 Daytona,      gh, stripe,   Agent Mail    markdown      inbox events
 Blaxel,       Playwright,   patterns
 Git repo      Python,
               SDKs…)

             ┌──────────────────────────────────┐
             │ HARNESS (inside the workspace)   │
             │ Claude SDK, Letta, Goose,        │
             │ Codex CLI, OpenHands             │
             └──────────────────────────────────┘

             ┌──────────────────────────────────┐
             │ OBSERVABILITY (optional)         │
             │ Langfuse, LangSmith, Helicone,   │
             │ Braintrust, Phoenix              │
             └──────────────────────────────────┘
```

Note there is no "tools" or "protocol" box. Tools are whatever the workspace has installed; skills bundle the know-how to call them. That's what gets the 30×+ token savings over a protocol approach.

Cost depends on deployment profile. Indicative ranges for a 2-person team running 50–100 agent runs/day:

- **Laptop profile:** ~$50–100/mo (model API is the whole bill).
- **Self-hosted VPS profile:** ~$80–150/mo (VPS + model API).
- **Managed cloud profile:** ~$150–300/mo (E2B + hosted observability + model API).

The only line that scales with usage in every profile is the model bill, which is the right shape.

---

## 11. What This Means For The Meta Layer

Five commitments fall out of this research:

**(a) Think in employees, not workflows.** Every abstraction in the meta layer should map to something a human employee has: workspace, skills, inbox, memory, rhythm. If an abstraction doesn't fit one of those five, question why it exists.

**(b) Skills over protocols.** The unit of composition is a skill package that bundles its own scripts and uses existing CLIs, APIs, and SDKs directly. No MCP server, no protocol layer, no tool-schema tax. The 30×+ token efficiency gain over MCP is not optional — it's the whole reason the employee model is affordable.

**(c) Practices share knowledge; the factory operates skills.** Two distinct layers, two distinct human modes. The Practice layer (L3) is a community of practice — growth folks across products, building folks across products, ops folks across products — sharing knowledge: patterns, observations, anti-patterns, reference examples. Knowledge flows freely between teams without per-change approval, but humans still show up async to prioritize the agenda, spot-check in-flight items, and prune the knowledge tree (the Practice Editor mode). This curation is what keeps an AI-only community from drifting into weird territory. **Skills are different.** Skills are the executable, compound artifacts and they live at the Chief of Staff (L4) level. Skill changes — new skills, edits, retirements — are human-approved synchronously in the Factory Inbox, because a quietly-wrong skill propagates across the entire factory. Practice knowledge can inform future skills, but the promotion is a deliberate human-approved event, not an automatic graduation. Most knowledge never becomes a skill, and that's the right outcome.

**(d) Stay thin above the harness.** Never contain a tool-use loop or a model-calling loop. Those live in the harness. If we're writing "call model, parse tools, call them, loop" — stop.

**(e) Ship all deployment profiles from day one.** Laptop, self-hosted VPS, managed cloud, BYO cloud. No profile is "primary." A solo builder should be able to install and run the factory in 30 minutes on a MacBook. A team should be able to install and run it on their cloud of choice. The meta layer doesn't know or care which.

---

## 12. Decisions (formerly Open Questions)

- **No external framework integrations in the meta layer.** No Letta, no Agent Mail, no Temporal, no Inngest. All agentic integrations happen through the Agent Runtime layer (Harness Adapters). The meta layer stays minimal. We build our own inbox, our own scheduling, our own knowledge fabric — all against SQLite.
- **Skills flow through the Knowledge Fabric.** All knowledge — including skill-like artifacts — flows through the Knowledge Fabric. Sessions are set up by the meta layer with materialized workspaces. Skills are not designed to work standalone outside the meta layer.
- **Laptop minimum: confirmed.** Python + SQLite + Docker + Claude API key. 10-minute install bar for anyone.
- **Scheduler minimalism: confirmed.** Avoid Inngest and Temporal as long as possible. `cron + SQLite + asyncio background worker` goes further than expected. No complex dependencies.
- **Daytona Custom Regions: parked.** Revisit when addressing self-hosted deployment profiles.
- **PostgreSQL ready as SQLite alternative.** SQLite is the default for laptop/small deployments. PostgreSQL must be available for >50 concurrent agents or >100 sustained writes/sec from the Knowledge Fabric's continuous sync. Same schema, adapter pattern.
- **TOON for context packs, JSON for messages.** TOON's ~40% token savings are right for prompt stuffing (context packs, session.toon). Inter-agent messages and handoffs use plain JSON — wider compatibility, easier debugging, and the token savings don't matter for small messages.

---

## 13. Inspirations

Workspaces: E2B Desktop Sandbox, Daytona, Cursor Cloud Agents, Devin, Blaxel, Docker+gVisor, Claude Desktop/Cowork, Manus.
Skills: Claude Code Skills (277K+ installs on frontend-design alone, 31K+ in circulation), Anthropic Plugins & Marketplace, WRITER Agent Skills, Letta memory blocks, Anthropic Agent Skills spec.
Tool access (existing interfaces, no protocol): bash, curl, `gh`, `stripe`, `fly`, `op`, `psql`, `ffmpeg`, `jq`, Playwright, Stagehand, Browser Use, Aider, Inbox Zero — called directly from skill scripts.
Inbox / coordination (data model inspiration, not adopted): Agent Mail (Dicklesworthstone / Steve Yegge fork) — the inbox + file-lease model informed our design, but we build our own against SQLite. LangChain Agent Inbox for UI inspiration.
Memory: Letta, Git-backed state, SQLite + TOON.
Rhythm: Paperclip AI heartbeat, Lindy long-running sessions, Letta continuous loops, inbox-driven wakeups.
Harnesses: Claude Agent SDK, Letta, Goose (Block), Codex CLI, oh-my-codex, OpenHands.
Observability & guardrails: Langfuse, LangSmith, Helicone, Braintrust, Arize Phoenix, Microsoft Agent Governance Toolkit (April 2026), NVIDIA OpenShell.

Critiques of protocol-as-default (MCP): OnlyCLI token benchmark (35× overhead), Mmntm "MCP Tax" (143K tokens for 3 services), Vensas (4–32× per-task cost), Cloudflare Code Mode (~1000× reduction vs. wrapped MCP), Perplexity CTO Denis Yarats abandoning MCP internally (Ask 2026, March 2026), Simon Willison ("I don't use MCP at all anymore"), Armin Ronacher ("Skills vs Dynamic MCP Loadouts," Dec 2025).

Critiques of workflow-as-orchestrator: Paperclip manifesto ("AI agents need a company, not a workflow DAG"), Agentic Manifesto, "if you can draw it as a flowchart before it runs, it's not an agent."
