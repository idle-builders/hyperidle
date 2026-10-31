# Agent-Ecosystem Feature Ideas — research input for work planning

**Date:** 2026-08-08 · **Status:** research input, NOT a work package · **Origin:** live web research (vendor pages, GitHub trending, HN) cross-checked against `docs/` — vendor numbers are self-reported, treat skeptically.

Purpose: candidate features observed in the hot AI-productivity ecosystem, each with enough background and source links that `/pipeline:work-planning` (or `/refine`) can pick any of them up without re-doing the research. Nothing here is decided; sizes are gut estimates.

---

## Context snapshot — why now

Six meta-trends frame every candidate below:

1. **The standalone "agent kanban" niche is consolidating.** Vibe Kanban (27.7k stars) announced sunset (continues community-maintained OSS); Crystal was deprecated and rebuilt as Nimbalyst; Manus was acquired by Meta; Goose moved into the Linux Foundation's Agentic AI Foundation. The middle layer between human and agents is being squeezed by harnesses growing UIs and IDEs absorbing orchestration.
   - https://www.vibekanban.com/blog/shutdown · https://nimbalyst.com/ · https://manus.im/ · https://goose-docs.ai/blog/2026-04-07/goose-moves-to-aaif
2. **"Own your harness"** is the emerging philosophy — the durable layer above model churn is orchestration, context, review, verification. Nimbalyst's literal tagline; Mastra ships a `Harness` primitive; Cursor builds swarm infrastructure.
   - https://nimbalyst.com/harness/ · https://mastra.ai/
3. **Planner/worker swarms + context efficiency** — Cursor's research swarm rebuilt SQLite-from-docs: frontier-model planners decompose a goal tree, cheap-model workers execute; the win is context efficiency, not parallelism. They also built a VCS for agents (~1,000 commits/sec) and "review lenses".
   - Cursor blog: "Agent swarms and the new model economics" (2026-07-20); related: https://cursor.com/blog/scaling-agents · https://cursor.com/blog/self-driving-codebases
4. **Skills became a portable standard** (`agentskills.io`, SKILL.md folders) — read cross-tool by Crush, Claude Code etc.; skills repos trended on GitHub the day of research (anthropics/skills, google/skills, obra/superpowers, addyosmani/agent-skills).
   - https://agentskills.io · https://github.com/charmbracelet/crush (Agent Skills section) · https://github.com/trending (2026-08-07)
5. **Memory infrastructure matured** — Mem0 (62.6k stars) ships memory compression + staleness/procedural-memory research; Letta ships memory models (memory-native RL), sleep-time compute, and git-based context repositories.
   - https://mem0.ai/ · https://www.letta.com/research/
6. **Agent-first infrastructure** — Cloudflare Kitesurf: a browser built for agents, not humans (3–7x cheaper than Chromium, stateless, CDP-compatible); managed sandboxes (E2B/Daytona/Vercel) becoming primitives.
   - https://blog.cloudflare.com/kitesurf/ · https://mastra.ai/blog/introducing-managed-sandboxes-and-filesystems-for-mastra-platform

**HyperIdle's unoccupied position** (from the same research): conversation-first OS with bets, five-layer knowledge, routines, and agents as named teammates. Nobody else fuses Slack+Linear+Notion+GitHub with agents as first-class participants. Nearest analogue is Nimbalyst (MIT, local-first, sessions+tasks+docs+multiplayer) but it is artifact-centric, not conversation-centric, and has no knowledge layer. The strategic risk is not a direct competitor — it is harnesses (Claude Code teams, Cline's Slack/Linear presence — https://cline.bot/) and incumbents (Notion Agents, https://www.notion.com/product/ai) meeting in the middle.

---

## Feature candidates

### F1 — Review queue: per-session diff-review surface (highest priority)

**What:** One place where every artifact an agent produced awaits human review — diffs per file type, approve/reject/edit in place, review columns per session.

**Background:** Vibe Kanban's sunset thesis is the strongest signal: *"the bottleneck has shifted — agents work infinite tasks in parallel; shipping speed is now limited by how fast you plan and review"* (https://www.vibekanban.com/). Every surviving tool converged on the same answer: Nimbalyst does inline diff review for every artifact type including markdown/diagrams/mockups (https://nimbalyst.com/features/), Conductor is "see at a glance, review and merge" (https://conductor.build/), Cursor added Review/BugBot. HyperIdle has Sessions and pipeline-style review discipline for its own development, but no first-class review queue as a product surface.

**Relevance:** Directly closes the proven bottleneck of parallel agent work; HyperIdle already runs parallel harness sessions in worktrees.

**Size:** L. **Open questions for /refine:** review unit = PR, session, or task? Does review ride AL7-style trust rules (earned review, not gate-by-default per ETHOS)? Artifact scope: code only first, or blocks/docs too?

**Sources:** vibekanban.com, nimbalyst.com/features/, conductor.build, cursor.com (Review/BugBot nav).

---

### F2 — Sleep-time compute: agents consolidate and improve while idle

**What:** Agents use idle time to reason over accumulated context — consolidating knowledge, pre-computing, updating their own memory/skills — instead of only at request time.

**Background:** Letta's research line: "Sleep-time Compute: Learning Offline" (agents reason about context during idle time rather than at inference), "Continual Learning in Token Space" (Dec 2025), "Memory Models: Towards Agents That Learn" (Jun 2026, memory-native RL). Press framing: "AI that thinks 24/7" (Fast Company, https://www.fastcompany.com/90948393/why-sleep-time-compute-is-the-next-big-leap-in-ai). Index: https://www.letta.com/research/.

**Relevance:** On-brand — the product is literally called HyperIdle; Routines already provide in-process schedulers, so idle-time agent runs have a natural substrate. Turns the knowledge architecture from archive into compounding asset.

**Size:** M–L. **Open questions:** which idle work is valuable for a single user (knowledge consolidation? retro-log compaction? skill self-improvement)? Budget/cost ceiling for idle runs?

**Sources:** letta.com/research/, fastcompany.com link above.

---

### F3 — Planner/worker model-mix per bet + cost tracking

**What:** Split a bet into planner runs (frontier model) and worker runs (cheap/fast model); track $ per bet.

**Background:** Cursor's swarm experiments: every model mix produced similar quality but costs varied enormously; frontier-plans/cheap-executes is the economic sweet spot ("Agent swarms and the new model economics", 2026-07-20; https://cursor.com/blog/scaling-agents). Separately, Databricks reported driving AI-coding spend down 70% at scale via governance of exactly this axis (https://www.databricks.com/blog/managing-ai-coding-costs-scale, via HN front page 2026-08-07).

**Relevance:** Bets are already time-boxed cost containers; adding a model-role dimension + $/bet makes the bet thesis economically legible. Also aligns with ETHOS ("build for the fast" = cost-conscious).

**Size:** M. **Open questions:** is planner/worker a decomposition concern (existing decomposition machinery) or a run-config concern? Where does cost data come from per harness?

**Sources:** cursor.com blog posts above, databricks.com blog above.

---

### F4 — Session share links

**What:** A shareable link to any agent session transcript for reference, debugging, or handing to another agent/human.

**Background:** OpenCode ships this as a core feature ("Share links — share a link to any session for reference or to debug", https://opencode.ai/). Cheap to build once sessions have stable IDs; disproportionately useful for a tool that orchestrates multiple harnesses.

**Relevance:** Debugging harness runs across claude/codex/opencode/cursor-agent; lore capture; async collaboration with oneself across machines.

**Size:** S. **Open questions:** local-only rendering vs. hosted? (Local-first posture suggests link = deep link into the app, not a hosted page.)

**Sources:** opencode.ai.

---

### F5 — Run observability: traces, cost, scorers, feedback per agent run

**What:** Timeline of every model call/tool call/handoff per session; latency/cost/token metrics; optional scorers/evals against the run's acceptance criteria; capture human feedback per agent response.

**Background:** Mastra made built-in observability its differentiator — traces, metrics, evals/scorers, datasets, and just shipped feedback analytics + rubric scorers (https://mastra.ai/platform-observability · https://mastra.ai/blog/introducing-feedback-and-feedback-analytics · https://mastra.ai/blog/introducing-rubric-scorers-for-mastra-agents). Agno AgentOS ships session/trace monitoring + evals UI (https://agno.com/agentos). n8n's pitch is "agents you can actually follow" — every reasoning step traceable on canvas (https://n8n.io/).

**Relevance:** HyperIdle runs agents as host child processes with a capture seam (docs/architecture/run-unit-model.md) — the data exists; surfacing it makes agent quality legible and feeds F3's cost story. HyperIdle's own pipeline already does validation-first; productizing that for user work is the same idea.

**Size:** M–L. **Open questions:** observability as read-only view first (no eval engine)? Which events already cross the EventBus vs. need capture?

**Sources:** mastra.ai links above, agno.com/agentos, n8n.io.

---

### F6 — Adopt the agentskills.io standard fully + small skills registry

**What:** Full conformance with the portable SKILL.md standard (frontmatter flags `user-invocable`, `disable-model-invocation`; cross-tool discovery paths) and a lightweight registry/marketplace of skills.

**Background:** The standard is converging without us: Crush reads `.agents/skills`, `.claude/skills`, `.cursor/skills` and supports user-invocable/model-invocation flags (https://github.com/charmbracelet/crush); four skills repos trended on GitHub the day of research (https://github.com/trending: anthropics/skills, google/skills, obra/superpowers, addyosmani/agent-skills, mattpocock/skills); standard home: https://agentskills.io. HyperIdle already uses SKILL.md skills (`.agents/skills/`, `.opencode/skills/`, `.claude/skills/`) — conformance is cheap, and a registry makes skills a network asset.

**Relevance:** Skills are how HyperIdle's pipeline expertise (work-planning, retro, refine) becomes portable and shareable — the open-source story the founder wants.

**Size:** S–M. **Open questions:** registry = git repo + index (fits local-first) or hosted? Do HyperIdle pipeline skills become publishable artifacts?

**Sources:** agentskills.io, github.com/charmbracelet/crush, github.com/trending.

---

### F7 — Git-based agent memory (context repositories)

**What:** Agent memory/context as versioned, diffable, git-managed files rather than opaque DB blobs — agents read/write their own context like code.

**Background:** Letta "Context Repositories: Git-based Memory" (Feb 2026): "a rebuild of how agent memory works, using programmatic context management and git-based versioning" (https://www.letta.com/blog/context-repositories/). Companion piece: "Context Constitution" (https://www.letta.com/blog/context-constitution/).

**Relevance:** HyperIdle already lives in git — `.pipeline/`, `plans/`, lore comments, retro-logs are all git-tracked agent memory in embryo. Making this a first-class, general mechanism (agent memory = files + commits + review) is a natural extension and fits the local-first posture better than any vector-store product.

**Size:** M. **Open questions:** which memory types (episodic session memory? knowledge? skills?) go git-first? Relationship to the five knowledge storage layers — replacement or projection?

**Sources:** letta.com blog links above.

---

### F8 — Portable automation format for Routines (recipes)

**What:** Routines exportable/importable as declarative files (instructions, extensions/tools, parameters, sub-recipes), shareable and CI-runnable.

**Background:** Goose Recipes: "capture workflows as portable YAML configs — share with your team, run in CI, include instructions, extensions, parameters, and subrecipes" (https://goose-docs.ai/docs/guides/recipes/session-recipes · https://github.com/aaif-goose/goose). Notion Custom Agents (trigger/schedule-driven, 24/7) and Khoj's scheduled automations → personal newsletters show the demand for scheduled agent work (https://www.notion.com/product/ai · https://github.com/khoj-ai/khoj).

**Relevance:** HyperIdle Routines are in-process schedulers; a portable format makes them shareable (open-source story) and lets the community contribute routines the way Goose's cookbook works (https://goose-docs.ai/recipes).

**Size:** S–M. **Open questions:** YAML vs. TS config vs. markdown-with-frontmatter (skills-shaped)? Does a routine reference agents by role, not identity?

**Sources:** goose-docs.ai links above, notion.com/product/ai, github.com/khoj-ai/khoj.

---

### F9 — Interactive agent-rendered blocks in chat (MCP-Apps pattern)

**What:** Agents render interactive UI — buttons, forms, live results, visualizations — inline in the conversation, not just text.

**Background:** Goose MCP Apps: "extensions can render interactive UIs directly inside goose Desktop — buttons, forms, visualizations" (https://goose-docs.ai/docs/tutorials/building-mcp-apps). Nimbalyst goes one step further: "Need an artifact type we do not have? Your agent builds the editor for it" — extension system where the agent writes, installs and reloads new editors on demand (https://nimbalyst.com/features/extensions/).

**Relevance:** HyperIdle has Blocks as content primitives; agent-authored interactive blocks are the convergence point of chat + artifacts. The "agent builds its own tool" pattern is a strong trust-thesis fit (ETHOS: trust agents).

**Size:** L. **Open questions:** security model for agent-authored UI (this is where trust-first meets real risk — scope narrowly first: agent picks from existing block types before authoring new ones).

**Sources:** goose-docs.ai link above, nimbalyst.com/features/extensions/.

---

### F10 — Review lenses

**What:** Configurable reviewer perspectives applied over agent output — e.g. a security lens, a performance lens, a cost lens — each producing focused critique instead of one generic review.

**Background:** Named in Cursor's swarm research as part of how they review 1,000-commits-per-second agent output ("Review lenses" section, "Agent swarms and the new model economics", 2026-07-20). Composes naturally with F1's review queue: lenses pre-digest agent output before the human sees it.

**Relevance:** Scales human review without adding gates — aligns with ETHOS (review rides where a human chose it or a learning earned it; lenses make chosen review cheaper).

**Size:** S–M (mostly prompt + UI scaffolding over existing review flows). **Open questions:** lens = agent role, skill, or routine?

**Sources:** cursor.com blog (2026-07-20 post).

---

### F11 — Memory compression for conversation threads

**What:** Long conversation histories automatically condensed into compact memories, cutting tokens/latency while keeping the right context retrievable.

**Background:** Mem0's Memory Compression Engine: "automatically condenses chat history into compact memories that cut tokens and latency" (https://mem0.ai/); active research line on memory staleness, event-based memory for long-running agents, procedural memory (https://mem0.ai/blog/what-is-memory-staleness-in-ai-causes-risks-solutions · https://mem0.ai/blog/event-based-memory-systems-for-long-running-ai-agents). Mastra ships observational memory + semantic recall as framework primitives (https://mastra.ai/).

**Relevance:** HyperIdle conversations with agents are long-lived (teams, bets, sessions); transcript growth is the obvious future cost/quality problem. AU25's resumable-harness-session work (delta computation — "what's new since the harness last saw the conversation") is the adjacent seam; compression is the complementary half.

**Size:** M. **Open questions:** compress at the knowledge layer or the session layer? Does compression emit reviewable artifacts (fits trust thesis) or run silently?

**Sources:** mem0.ai links above, mastra.ai.

---

### F12 — Agent-first browsing for agent web tasks

**What:** Give agents a browser built for them — structured extraction, screenshots, cheap stateless sessions — instead of driving local Chromium for everything.

**Background:** Cloudflare Kitesurf (announced 2026-08-06): browser running entirely on Workers/V8 isolates, CDP-compatible (Puppeteer/Playwright/MCP clients work unchanged), 3–7x less CPU/memory than Chromium, designed around agent threat model (prompt injection, tool safety), free beta, going open source (https://blog.cloudflare.com/kitesurf/). Design lesson worth stealing regardless: "build tools for what AI is good at — tokens, structure, scale — not human ergonomics."

**Relevance:** Any routine/agent that touches the web (research, verification, visual QA) gets cheaper and safer; MCP/CDP compatibility means integration is a config line, not a project.

**Size:** S (integration) — or L if self-hosting the engine once it's OSS. **Open questions:** cloud dependency vs. local-first posture — acceptable for web tasks, or wait for the OSS release?

**Sources:** blog.cloudflare.com/kitesurf/.

---

## Deliberately NOT stealing (anti-candidates, for planning context)

- **Enterprise governance theater** — RBAC/audit/credits dashboards are the whole market's sprint (Notion credits, Agno AgentOS, CrewAI governance, n8n enterprise). HyperIdle's ethos is trust-first for fast small teams; copying this would betray the product thesis.
- **Super-app generator bazaar** (Genspark's ~100 generators, https://www.genspark.ai/) — breadth without a workspace model; the opposite of one fused surface.
- **Closed cloud agent completion** (Manus-under-Meta model) — no local ownership, no harness choice.
- **Standalone agent-kanban as the whole product** — Vibe Kanban's sunset is the cautionary tale; the review surface (F1) must live inside the workspace, not beside it.

## Cross-cutting signals to keep in mind during planning

- **ACP (Agent Client Protocol)** is becoming the interop standard between editors/orchestrators and harnesses (goose is both ACP server and client; Nimbalyst alpha supports it) — relevant to HyperIdle's harness abstraction (docs/architecture/run-unit-model.md). https://goose-docs.ai/docs/guides/acp-providers
- **Multi-surface is table stakes:** every serious tool now ships terminal + desktop + IDE + mobile + cloud (OpenCode desktop tabs, Cline CLI/IDE/SDK, Goose desktop/CLI/API, Nimbalyst iOS). Mobile agent-management is HyperIdle's most visible gap.
- **Subscription-reuse auth** (OpenCode/Cline/Goose let users log in with existing Claude/ChatGPT/Copilot subscriptions) — relevant to HyperIdle's cost story for a personal tool.

## Source index (all fetched 2026-08-07/08 unless noted)

| Source | URL |
|---|---|
| Vibe Kanban (shutdown + thesis) | https://www.vibekanban.com/ · https://www.vibekanban.com/blog/shutdown |
| Nimbalyst (ex-Crystal) | https://nimbalyst.com/ · https://github.com/Nimbalyst/nimbalyst |
| Conductor | https://conductor.build/ |
| OpenHands | https://www.all-hands.dev/ |
| Manus (Meta) | https://manus.im/ |
| Genspark | https://www.genspark.ai/ |
| Cursor swarm research | Cursor blog "Agent swarms and the new model economics" (2026-07-20) · https://cursor.com/blog/scaling-agents · https://cursor.com/blog/self-driving-codebases |
| Databricks AI-coding cost governance | https://www.databricks.com/blog/managing-ai-coding-costs-scale |
| OpenCode | https://opencode.ai/ |
| Cline | https://cline.bot/ |
| Goose (AAIF) | https://goose-docs.ai/ · https://github.com/aaif-goose/goose |
| Crush | https://github.com/charmbracelet/crush |
| Aider | https://aider.chat/ |
| Letta | https://www.letta.com/ · https://www.letta.com/research/ |
| Mem0 | https://mem0.ai/ |
| Khoj | https://github.com/khoj-ai/khoj |
| Mastra | https://mastra.ai/ |
| CrewAI | https://www.crewai.com/ |
| Agno | https://agno.com/ |
| n8n | https://n8n.io/ |
| Cloudflare Kitesurf | https://blog.cloudflare.com/kitesurf/ |
| Notion AI/Agents | https://www.notion.com/product/ai |
| Agent Skills standard | https://agentskills.io |
| GitHub trending + HN front page (signal) | https://github.com/trending · https://news.ycombinator.com/ (2026-08-07) |
