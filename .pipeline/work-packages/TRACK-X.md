# Track X: Agent Runtime Completeness

Make HyperIdle capable of actually launching agent sessions that do real work through pluggable harnesses. The kernel layer (provisioning, lifecycle, adapter pool, workspace, materialization, skill-tools) is fully implemented but has never executed a real agent session. This track closes the gap between "infrastructure exists" and "agents produce output."

**Concept:** Run `/concept` per workpackage at pipeline time — this track reshapes the Harness, Agent Configuration, and Session Prompt concepts and introduces new concepts (Eval, Model Gateway, MCP Bridge).

**Constraint:** After each work package merges to main, `npm run dev` must work. The existing provisioning orchestrator (D5) is the integration point — extend, don't replace. External harnesses are additive; the system must function without any external harness installed.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### X1 — Session Prompt Composition

**Workpackage.** As an agent starting a session, I want to receive a composed prompt that tells me who I am, what task I'm working on, what tools I have, and what context is available in my workspace — so that I can actually do useful work instead of receiving only a workspace path with no instructions.

**Depends on.** None. The provisioning orchestrator (D5), soul prompt files (`docs/souls/`), session context builder (`fabric/session-context.ts`), and materialization engine all exist. This workpackage composes their outputs into a coherent prompt and delivers it to the harness.

**Complexity.** M

**Acceptance criteria.**
- A prompt composition function assembles: soul prompt content (read from file), task details (title, description, done condition), bet context (pitch, appetite), available tool names with one-line descriptions, and a workspace orientation (directory structure, what's in each zone).
- Template variables in soul prompts (`{{product}}`, `{{community}}`) are substituted with actual values from the session's team/role context.
- The composed prompt is passed to the harness adapter via `SessionConfig` — not hardcoded as `"Session workspace: /path"`.
- A CLAUDE.md file is written into the workspace during materialization (Phase 6) containing the composed instructions, so harnesses that auto-discover CLAUDE.md (like Claude Code) pick it up automatically.
- When `soulPromptPath` is empty (agent has no soul prompt), the composed prompt still includes task context, tool descriptions, and workspace orientation — it just omits the persona section.
- The prompt fits within 4000 tokens for the persona + tools section (knowledge is separate, already budget-managed by materialization).

**Validation scenarios.**
- Given an agent with `soulPromptPath = "docs/souls/product-manager.md"` and a task with title and description, when a session is provisioned, then the harness receives a prompt containing the PM persona, the task details, and available tool names.
- Given a soul prompt containing `{{product}}`, when the prompt is composed, then the template variable is replaced with the actual team/product name.
- Given an agent with no soul prompt, when a session is provisioned, then the harness still receives a prompt with task context and tool descriptions.
- Given a provisioned workspace, when the workspace directory is listed, then a CLAUDE.md file exists at the root with the composed instructions.

**Plan calls.** Skip /design step. Backend-only — build a prompt composition module, wire it into provisioning Phase 6 (after materialization, before harness start). Architecture pass should define the prompt template structure, token budget allocation, and how CLAUDE.md relates to the prompt passed via SessionConfig.

**Contracts / constraints.**
- Soul prompt files in `docs/souls/` remain the template source — they are read at session start, not cached.
- The composed prompt is deterministic given the same inputs (no randomness, no LLM calls during composition).
- Template variable substitution uses a simple `{{key}}` pattern — no nested templates, no conditionals.
- The CLAUDE.md written to the workspace is a session artifact, destroyed with the workspace on session end.

**Out of scope.**
- Agent configuration UI (X3).
- DB-stored soul prompts (X3).
- Multi-harness prompt adaptation (X5 handles harness-specific formatting).

**Effort.** M (~4h)

---

### X2 — MCP Bridge for Skill-Tools

**Workpackage.** As an external harness (Claude Code, Aider, Goose, etc.) running an agent session, I want to call HyperIdle's meta-layer tools (`send_message`, `create_task`, `write_memory`, `submit_review`, etc.) through MCP — so that tool calling works natively through my own tool-use system without HyperIdle intercepting my event stream.

**Depends on.** None. The 14 skill-tools with Zod schemas and the tool registry exist. This workpackage exposes them via a new transport.

**Complexity.** L

**Acceptance criteria.**
- An MCP server process starts alongside (or as part of) the HyperIdle server, exposing all 14 skill-tools as MCP tools with JSON Schema derived from existing Zod definitions.
- Each MCP tool invocation is scoped to a session: the MCP server receives a session token (injected into the workspace environment) that maps to a `ToolContext` (sessionId, agentId, taskId, teamId, workspacePath).
- Tool results are returned to the harness via MCP response — the harness handles presenting them to the agent.
- Role-based filtering is enforced: facilitator-only tools return FORBIDDEN for builder sessions.
- The MCP server is started per-session during provisioning (Phase 8, after tool registry is built) and stopped during teardown (Phase 11).
- An `.mcp.json` or equivalent config file is written to the workspace so harnesses that auto-discover MCP servers connect automatically.
- The existing event-stream tool interception path (`tool_call` events in Phase 10) continues to work as a fallback for harnesses that don't support MCP.

**Validation scenarios.**
- Given a session with MCP bridge running, when an external harness calls `send_message` via MCP, then a message is created in the correct thread and the tool returns success.
- Given a builder session, when the harness calls `route_item` (facilitator-only) via MCP, then the tool returns FORBIDDEN.
- Given a session ends, when the MCP server is stopped, then the port is released and no further tool calls are accepted for that session.
- Given a harness without MCP support, when it emits `tool_call` events on the event stream, then the provisioning orchestrator handles them via the existing registry path.

**Plan calls.** Architecture pass should decide: one MCP server per session (isolated, simple) vs one MCP server with session-scoped routing (efficient, complex). Also: transport choice (stdio vs SSE vs streamable-HTTP), session token format, and how `.mcp.json` is structured for auto-discovery. Concept work needed on the MCP Bridge as a new primitive.

**Contracts / constraints.**
- MCP protocol compliance — must work with any MCP client, not just Claude Code.
- Session token is opaque, short-lived, and scoped to exactly one session.
- Tool definitions are generated from the same Zod schemas used by the existing registry — no duplicate definitions.
- The MCP bridge does not replace the event-stream path — both coexist.

**Out of scope.**
- Exposing non-tool MCP features (resources, prompts, sampling).
- MCP tool discovery from external sources (the harness's own MCP servers are the harness's business).
- Authentication beyond session-scoped tokens.

**Effort.** L (~3d)

---

### X3 — Agent Configuration (DB + UI)

**Workpackage.** As a founder, I want to configure agents through the UI — setting their name, role, soul prompt, assigned harness, model tier preference, and concurrency limits — so that I can staff my team with agents tailored to specific roles instead of relying on static file-based definitions that require code changes.

**Depends on.** X1 (Session Prompt Composition): The prompt composition module must exist so that DB-stored prompts are actually used.

**Complexity.** L

**Acceptance criteria.**
- The `users` table (agent rows) gains columns for: `soulPrompt` (text, the full prompt content — replaces `soulPromptPath`), `harnessType` (text, which harness adapter to use), `modelTierPreference` (text, default model tier).
- A library of default soul prompt templates is seeded per role (builder, product_manager, practice_facilitator, growth, ops) from the existing `docs/souls/` files.
- Settings UI has an "Agents" section listing all agent users with inline editing of name, role, soul prompt (textarea), harness type (dropdown), model tier (dropdown), and max concurrent sessions.
- Creating a new agent pre-fills the soul prompt from the role's default template.
- Agent configuration changes take effect on the next session — no restart required.
- The soul prompt path validation (`validateSoulPromptPath`) is replaced by direct DB reads.

**Validation scenarios.**
- Given the Agents section in Settings, when the user views it, then all agents are listed with their current configuration.
- Given the user edits an agent's soul prompt and saves, when the next session provisions for that agent, then the new prompt is used.
- Given the user creates a new agent with role "builder", when the form opens, then the soul prompt textarea is pre-filled with the builder template.
- Given an agent with `harnessType = "claude-code"`, when a session provisions, then the correct harness adapter is selected from the pool.

**Plan calls.** Requires /design for the Agents configuration UI in Settings. Architecture pass should cover: DB migration (new columns + seed data), deprecation path for `soulPromptPath` file-based approach, and how `harnessType` maps to adapter selection in the pool.

**Contracts / constraints.**
- Migration is additive — new columns with defaults. Existing agents keep working.
- `docs/souls/` files remain as seed templates but are no longer read at session time.
- Soul prompt content is stored as plain text in the DB, not as a file reference.
- The UI uses existing Settings patterns — no new page or navigation entry.

**Out of scope.**
- Agent creation wizard or onboarding flow.
- Team assignment UI (existing team management handles this).
- Skill/tool authorization UI (role-based filtering is automatic).
- Soul prompt versioning or history.

**Effort.** L (~2d)

---

### X4 — Model Gateway (OpenRouter + Direct Providers)

**Workpackage.** As a deployer, I want to route agent sessions through OpenRouter or directly to multiple model providers (Anthropic, OpenAI, Google, etc.) — so that I'm not locked into one provider and can optimize for cost, capability, or availability per model tier.

**Depends on.** X3 (Agent Configuration): Agents need a `harnessType` and model tier preference to drive gateway routing.

**Complexity.** M

**Acceptance criteria.**
- A model gateway configuration in Settings allows the founder to set: provider per model tier (e.g., reasoning → Anthropic Claude Opus, workhorse → OpenRouter/anthropic/claude-sonnet, fast → OpenRouter/google/gemini-flash).
- The gateway resolves a `ModelTier` + optional provider preference into a concrete `{ provider, model, apiKey, baseUrl }` tuple.
- The built-in harness (X6) uses the gateway to make LLM calls. External harnesses receive the resolved model identifier in their session config so they can configure themselves.
- OpenRouter is supported as a provider: the gateway formats requests to OpenRouter's API, passes the `X-Title` header, and handles OpenRouter-specific response fields.
- Direct provider support for Anthropic (existing) and OpenAI-compatible APIs (new).
- Gateway configuration is stored in `factory_settings` (or equivalent DB table) and editable via the Settings UI.
- The existing `model-tier-map.ts` is replaced by the gateway's runtime resolution.

**Validation scenarios.**
- Given a gateway config with `workhorse → openrouter/anthropic/claude-sonnet`, when a session starts with tier "workhorse", then the LLM call goes through OpenRouter with the correct model and API key.
- Given a gateway config with `fast → anthropic/claude-haiku` (direct), when a session starts with tier "fast", then the call goes directly to the Anthropic API.
- Given no gateway config for a tier, when a session starts, then the system falls back to the default (Anthropic direct, same as today).
- Given an invalid API key for a provider, when a session starts, then the error is clear and identifies which provider failed.

**Plan calls.** Skip /design for the gateway module itself. Requires /design for the Settings UI section (provider + model + key per tier). Architecture pass should define: gateway interface, provider adapter pattern, credential storage (reuse existing credential resolver vs new), and how external harnesses receive resolved model info.

**Contracts / constraints.**
- The three-tier vocabulary (`reasoning | workhorse | fast`) is unchanged — the gateway maps tiers to models, it doesn't add tiers.
- API keys for providers are stored via the existing credential resolver (Electron safeStorage / server_credentials).
- OpenRouter responses must be normalized to the same shape as direct provider responses for cost/token tracking.
- The gateway is a resolution layer, not a proxy — it doesn't relay API calls, it provides the config for whoever makes the call.

**Out of scope.**
- Automatic failover between providers.
- Cost comparison or optimization recommendations.
- Per-agent provider overrides (tier-level is sufficient for v1).
- Local model support (Ollama, llama.cpp) — that's a separate harness, not a gateway concern.

**Effort.** M (~1d)

---

### X5 — Multi-Harness Adapter Layer

**Workpackage.** As a founder, I want to plug in different agent harnesses (Claude Code, Aider, Goose, OpenCode, or a built-in lightweight harness) — so that I can choose the best runtime for each agent's role and each task's requirements, rather than being locked to one harness.

**Depends on.**
- X2 (MCP Bridge): External harnesses need MCP to call HyperIdle skill-tools — without MCP, they can't interact with the meta-layer.
- X4 (Model Gateway): Harnesses need resolved model configuration to know which LLM to use.

**Complexity.** L

**Acceptance criteria.**
- The `HarnessAdapter` interface is unchanged (`startSession`, `streamEvents`, `stopSession`, `getCapabilities`).
- At least three harness adapters exist: (a) the existing Claude Agent SDK adapter (updated to use composed prompts from X1), (b) a CLI-based adapter that can wrap any command-line agent tool (Aider, Goose, OpenCode) by spawning a subprocess with the workspace and reading stdout/stderr, (c) the built-in harness adapter (X6).
- The adapter pool selects adapters based on `harnessType` from agent config (X3), matching against each adapter's declared type.
- Each adapter receives a standardized `SessionConfig` that includes: workspace path, composed prompt, MCP server connection info (host:port or socket path), resolved model config from the gateway, and tool list.
- Adapters that support MCP include the MCP connection info in their harness setup (e.g., write to `.mcp.json`, pass as CLI args, set env vars).
- Adapters that don't support MCP fall back to event-stream tool interception.
- New adapters can be added by implementing `HarnessAdapter` and registering in the adapter pool — no changes to the provisioning orchestrator.

**Validation scenarios.**
- Given an agent configured with `harnessType = "claude-code"`, when a session provisions, then the Claude Agent SDK adapter is selected and the session runs via Claude Code.
- Given an agent configured with `harnessType = "cli"` and a CLI adapter wrapping Aider, when a session provisions, then Aider is spawned with the workspace and MCP config, and events stream back.
- Given an agent configured with `harnessType = "builtin"`, when a session provisions, then the built-in harness runs the session using the model gateway.
- Given a harness adapter that doesn't support MCP, when the session runs and the agent calls a HyperIdle tool, then the event-stream fallback handles the tool call.

**Plan calls.** Architecture pass should define: `SessionConfig` expansion (new fields for MCP info, model config), CLI adapter subprocess protocol (how to parse events from stdout, how to inject config), adapter registration pattern, and how `harnessType` in agent config maps to adapter selection. Concept work needed on the CLI adapter — what's the minimal contract a CLI tool must meet to be wrapped.

**Contracts / constraints.**
- The `HarnessAdapter` interface is not changed — adapters are added, the interface stays stable.
- CLI adapter subprocess isolation: same env sandboxing as the existing isolated harness adapter (allowlisted env vars only).
- External harness binaries are not bundled — the deployer installs them. The adapter checks for availability at registration time.
- Adapters declare their type and capabilities at registration. The pool matches on type first, then capabilities.

**Out of scope.**
- Automatic harness installation or version management.
- Harness-specific UI (each harness has its own UX; HyperIdle just dispatches).
- Hot-swapping harnesses mid-session.

**Effort.** L (~3d)

---

### X6 — Built-in Harness (Best-Practice Agent Loop)

**Workpackage.** As a deployer with no external agent tools installed, I want HyperIdle to include a built-in harness that encodes best-practice harness engineering — so that the system works out of the box, and because it sits inside the meta-layer with full system awareness, it can be smarter about orchestration than any external harness that only sees a workspace.

**Depends on.**
- X4 (Model Gateway): The built-in harness needs the gateway to resolve which LLM to call.
- X2 (MCP Bridge): The built-in harness calls HyperIdle skill-tools directly (no MCP needed for self), but must set up MCP for consistency with the workspace contract.

**Complexity.** L

**Acceptance criteria.**

_Core loop:_
- A `BuiltinHarnessAdapter` implements `HarnessAdapter` with a structured agent loop: plan → execute → reflect → continue-or-stop.
- The harness uses the model gateway to make LLM API calls (supports Anthropic, OpenAI-compatible, and OpenRouter).
- Tool calls from the LLM are handled directly via the existing tool registry (same path as current event-stream interception, but internal to the harness).
- The harness supports the Anthropic Messages API tool_use format and the OpenAI function_calling format.
- The harness streams events (`cost_update`, `token_usage`, `tool_call`, `completion`, `error`) through the standard `HarnessAdapter.streamEvents` interface.
- The harness is registered as the default adapter in the pool when no external harnesses are configured.

_Best-practice harness patterns:_
- **Task decomposition first:** The agent's first turn is always a planning turn — read the task, read the context, propose a plan of subtasks before executing. The plan is written to `work/task-notes.md` immediately (continuous notes, not end-of-session dump).
- **Reflection checkpoints:** Every N tool calls (configurable, default 5), the harness injects a reflection prompt: "Review your progress. What have you accomplished? What's next? Are you still on track for the task's done condition?" This catches drift before it compounds.
- **Pre-compaction awareness:** The harness monitors token usage and triggers a session-notes-writing pass when approaching 80% of the model's context window. Notes are written continuously throughout the session (not just at the end), so crash-safety is built in.
- **Cost-aware tier switching:** For routine sub-steps within a session (summarization, formatting, classification), the harness can downgrade to the "fast" tier mid-session via the model gateway — then return to the session's primary tier for substantive work. This leverages the meta-layer's cost posture awareness.
- **Structured output for tool calls:** The harness formats tool-call results with clear success/failure signals and context, not raw dumps. Failed tool calls include the error and a suggestion for the agent's next action.
- **Session history management:** The harness maintains a sliding window of conversation history, summarizing older turns when approaching context limits rather than hard-truncating.

**Validation scenarios.**
- Given a built-in harness session with a task, when the session starts, then the first agent turn produces a plan written to `work/task-notes.md` before any tool calls are made.
- Given a session with 6+ tool calls, when the reflection checkpoint fires, then the agent assesses progress and the assessment is visible in the event stream.
- Given a session approaching 80% context usage, when the pre-compaction trigger fires, then the agent writes session notes before the session ends.
- Given a model gateway configured for OpenRouter, when the built-in harness runs a session, then LLM calls go through OpenRouter and cost/tokens are tracked correctly.
- Given no external harnesses configured, when the server starts, then the built-in harness is the only adapter in the pool and sessions can still run.

**Plan calls.** Architecture pass should define: the structured agent loop (plan → execute → reflect → stop), LLM client abstraction (Anthropic SDK vs generic HTTP), tool-call format normalization (Anthropic tool_use vs OpenAI function_calling), reflection checkpoint injection strategy, context window management with summarization, and mid-session tier switching protocol. The `/concept` phase should research the latest harness engineering findings (Anthropic best practices, Claude Code internals, Pico Agent patterns, OpenHands loop design) to inform the loop design.

**Contracts / constraints.**
- The built-in harness is not minimal — it encodes the best practices we know. But it's not competing with external harnesses on raw execution capability (file editing, bash, git). It excels at orchestration, planning, and meta-layer-aware decisions.
- No file editing, no bash execution, no git operations. The built-in harness can only call HyperIdle skill-tools. For code/file work, use an external harness.
- The agent loop has a configurable max-iterations guard (default 50) to prevent runaway sessions.
- Reflection checkpoints are structural (injected by the harness), not prompt-engineered (hoping the agent self-reflects). The harness controls the loop.
- Conversation history is in-memory only — no persistence across loop iterations (the LLM sees the managed conversation within the session).

**Out of scope.**
- Sub-agent spawning within the built-in harness.
- MCP client support (calling external MCP servers). The built-in harness only calls HyperIdle tools.
- Streaming responses to the UI in real-time (events are batched per turn).
- Image/multimodal input.
- Competing with external harnesses on code/file execution — that's not the built-in harness's job.

**Effort.** L (~3d)

---

### X7 — Eval Framework

**Workpackage.** As a founder, I want the infrastructure to benchmark whether HyperIdle — the full stack of soul prompts, prompt composition, knowledge materialization, tool definitions, and the agent harness loop — actually makes agents do the right thing. This workpackage builds the eval runner, scoring engine, seeding infrastructure, report format, and model comparison matrix. It ships with one proof-of-concept scenario to validate the framework works end-to-end. The full scenario library is X8.

When an eval score is low, the fix is in HyperIdle's code — better tool descriptions, better soul prompts, better knowledge injection, better harness logic. The eval is the tuning instrument for the system. X7 builds the instrument; X8 writes the sheet music.

**Depends on.**
- X1 (Session Prompt Composition): Agents need real composed prompts.
- X6 (Built-in Harness): At least one harness must execute real multi-turn agent loops.

**Complexity.** L

**Acceptance criteria.**
- An eval runner (`npm run eval`) executes eval scenarios against a real (but ephemeral) database with seeded data, using **real LLM calls** through the full provisioning pipeline. An API key is required — there is no mock mode.
- The framework defines the `EvalScenario` contract that X8 scenarios implement:
  - A **seeding function** that populates a realistic world state: team, agents with soul prompts and role-appropriate tool access, bets, tasks, knowledge items across the five layers (L0–L4), threads with history.
  - A **trigger** that assigns a task to an agent and runs a real session through `provisionSession` → harness → LLM → tool calls → DB writes.
  - A **scoring rubric** with named dimensions that a judge (LLM-as-judge, rule-based DB checks, or a combination) evaluates after the session completes. Dimensions score the agent's decisions, not just outputs: tool selection correctness, role-appropriate strategy, output quality, session note completeness, cost discipline, harmful action absence.
- A **scoring engine** that runs the rubric against the post-session DB state and produces per-dimension scores (not just pass/fail). A scenario can partially succeed.
- A **seeding library** with composable helpers for building realistic world states (create team, add agent with soul prompt, create bet with tasks, seed knowledge layers, create threads). Scenarios in X8 compose these helpers — they don't each reinvent DB seeding.
- Eval results are written to a structured JSON report (`eval-results.json`) with per-scenario rubric scores, duration, token usage by tier, cost, model used, and qualitative notes from the judge.
- The runner supports `--model <model-id>` to run the same scenarios against different models, producing a comparison matrix.
- A `--quick` mode runs a subset of scenarios. Full mode runs all.
- **One proof-of-concept scenario** ships with the framework to validate the full loop works: seeding → provisioning → real LLM session → tool execution → scoring → report. The scenario should exercise a simple but representative workflow (e.g., an agent given a task that requires writing session notes and creating a knowledge item). This is not a throwaway — it becomes part of X8's library.

**Validation scenarios.**
- Given `npm run eval` is executed with an API key, when the proof-of-concept scenario runs, then a real agent session executes through the full provisioning pipeline, and the report contains rubric scores with per-dimension breakdown.
- Given `npm run eval -- --model claude-sonnet-4-6` and then `npm run eval -- --model claude-haiku-4-5`, the reports show different scores for the same scenario, demonstrating the comparison matrix works.
- Given a new scenario file is added to the scenarios directory, when `npm run eval` runs, then it discovers and executes the new scenario without any framework changes.

**Plan calls.** Architecture pass should: (1) define the `EvalScenario` contract (seeding, trigger, rubric, judge interface); (2) define the scoring rubric structure — what dimensions, how scored, how aggregated; (3) design the composable seeding library; (4) determine the eval runner infrastructure (standalone script, scenario discovery, serial execution, report generation); (5) design the model comparison matrix output; (6) define the proof-of-concept scenario. No /design step.

**Contracts / constraints.**
- **Nothing is mocked.** The eval runs the real application. Real database (ephemeral but full-schema Postgres via PGlite). Real provisioning pipeline (`provisionSession` with all 11 phases). Real knowledge materialization (L0–L4 layers queried and written to real workspace directories). Real prompt composition (soul prompt + context + tools assembled exactly as production does). Real harness agent loop (multi-turn LLM calls with real tool dispatch). Real tool execution (Zod-validated, writing to the real DB). Real file watchers, real workspace teardown, real cost tracking accumulated on real bet rows. If any layer is stubbed, mocked, or short-circuited, it is not an eval — it is a test, and it does not belong here.
- **Evals are not tests.** Tests are deterministic, scripted, and run in CI. Evals require real LLM calls, are non-deterministic, and benchmark system quality. They are never part of `npm run verify` or `npm run test`. There is no mock LLM path — if no API key is present, the runner exits with "API key required."
- The framework must be scenario-agnostic. X8 adds scenarios without touching framework code.
- Cost awareness: each eval run costs real money. The report must include per-scenario and total cost. `--quick` mode must exist for iteration.

**Out of scope.**
- The full scenario library (that's X8).
- Automated CI gating on eval scores (follow-up).
- Automated prompt/tool-description optimization based on eval results (follow-up).

**Effort.** L (~3d)

---

### X8 — Eval Scenario Library

**Workpackage.** As a founder, I want a comprehensive library of eval scenarios that benchmarks every feature in HyperIdle. Feature meaning the interfaces where agents interact with hypedidle (mcp, tools, file sync, prompt composion, knowledge creation, ...), and thus an agent becomes the user. We cover both kernel features and strategy features. Evals should be living side by side with the feature that they are testing. Similar to how we can measure user facing features with user behaviour on how succusful in their user experience, we can measure agents using the agent facing features. For agents we have the advantage that we can simulate agents using the agent facing interfaces. To make the setup realistic we need to structure realistic scenarios that cover a feature of that journey in different variants. Thus for each feature we need multiple scenario with a realistic setup and domain (like development, design, sales, operations, finance, marketing, ...) and thus a corresponding agent. We need to adopt realistic scenarios since later in real live we do not have power over the tasks and the agent definitions that our users will give their agents. the scenarios need to be an approximation of these real world tasks. 

The outcome of those feature scenarios will be that we use those evals by feature to tune those features to make then more useful for the agents. We need to move our feature to make them useful for the agents and not the other way round. User will expect that our tool is useful from day one.

Scoring judges the agent's *decisions within HyperIdle*, not generic LLM capability. "Did it use `create_task` correctly given its role and the bet context" is an eval question. "Can it write Python" is not. When a scenario scores low, the eval report should make it diagnosable — which rubric dimension failed, what the agent actually did (tools called, artifacts produced, notes written), and what the expected behavior was.

**Depends on.**
- X7 (Eval Framework): The runner, scoring engine, seeding library, and scenario contract.

**Complexity.** L

**Acceptance criteria.**
- Scenarios are grouped by feature. They cover both kernel and strategy. The cover a host of different realistic roles (soul) that can be found in a startup company (development, design, sales, operations, finance, marketing) and expected bets, conversations and knowledge for different industries (software, marketing, consulting, finance, legal, commerce, ...). 
- Each scenario uses X7's composable seeding library to build its world state — no scenario reinvents DB seeding.
- Each scenario defines a rubric with role-specific dimensions. The rubric is explicit about what "good" looks like for that role in that situation.
- `npm run eval` executes all scenarios and produces a report with per-feature rubric breakdowns.
- `npm run eval --feature <feature>` runs scenarios per feature.
- The comparison matrix (`--model`) reveals which roles/workflows degrade on cheaper models and which hold — identifying where HyperIdle's prompt/tool design compensates for model capability and where it doesn't.

**Validation scenarios.**
- Given `npm run eval` with a full run, every defined role has at least one scenario, and the report shows rubric breakdowns per scenario.
- Given a PM-decomposition scenario, the rubric scores whether the PM read the bet's pitch and practice knowledge, proposed tasks that match the team's disciplines, identified dependencies, and assigned owners — not just whether `create_task` was called N times.
- Given two runs with different models, the comparison matrix shows meaningful per-scenario score differences that are actionable (e.g., "PM decomposition degrades on Haiku because the soul prompt is too subtle for the model" is a useful signal).

**Plan calls.** Architecture pass should: (1) identify all features that need eval coverage (2) inventory all agent roles in `users` schema and `docs/agent-layer/the-two-categories.md`, all soul prompt templates in `factory_settings`, and all tool-to-role mappings in the tool registry; (3) for each role, identify the characteristic workflow and which tools the agent should reach for; (4) design realistic seed data for each scenario — world states that exercise knowledge materialization, practice grounding, and cross-agent context; (5) define per-scenario rubrics with explicit "good" criteria;

**Contracts / constraints.**
- **Nothing is mocked.** Same constraint as X7 — every scenario runs the full real application stack.
- Scenarios are additive — new scenarios can be added without modifying the framework or existing scenarios.
- Each scenario must be self-contained: its seeding function creates everything it needs, its rubric judges only what it set up. No cross-scenario dependencies.
- Scoring judges the agent's decisions within HyperIdle, not generic LLM capability.
- When a scenario scores low, the report must make it diagnosable — which rubric dimension failed, what the agent actually did, and what was expected. This is what makes the eval a tuning instrument.
- When a scenario scores low we don't adjust scenario. We leave the insights for someont to improve the feature.

**Out of scope.**
- Framework infrastructure changes (that's X7).
- Automated CI gating on eval scores (follow-up).
- Eval scenarios for external harnesses (follow-up after X5).
- Automated prompt/tool-description optimization based on eval results.

**Effort.** L (~3d)

---

## Track Summary

| Story | Title | Effort | Depends on |
|-------|-------|--------|------------|
| X1 | Session Prompt Composition | M (~4h) | None |
| X2 | MCP Bridge for Skill-Tools | L (~3d) | None |
| X3 | Agent Configuration (DB + UI) | L (~2d) | X1 |
| X4 | Model Gateway (OpenRouter + Direct Providers) | M (~1d) | X3 |
| X5 | Multi-Harness Adapter Layer | L (~3d) | X2, X4 |
| X6 | Built-in Harness (Best-Practice Agent Loop) | L (~3d) | X4, X2 |
| X7 | Eval Framework | L (~3d) | X1, X6 |
| X8 | Eval Scenario Library | L (~3d) | X7 |

**Critical path:** X1 → X3 → X4 → X6 → X7 → X8

**Total effort:** ~19d (1 M + 7 L)

**Parallelism windows:**
- X1 and X2 are fully independent — both can start immediately.
- X3 can start after X1 completes.
- X4 can start after X3 completes.
- X5 and X6 can run in parallel after X2 and X4 complete.
- X7 can start after X1 and X6 complete.
- X8 can start after X7 completes.

**Dependency graph:**
```
X1 (Prompt) ──── X3 (Agent Config) ──── X4 (Gateway) ──┬── X5 (Multi-Harness)
                                                        │
X2 (MCP Bridge) ───────────────────────────────────────┤
                                                        ├── X6 (Built-in Harness)
                                                        │
X1 (Prompt) ────────────────────────────────────────────┴── X7 (Eval Framework) ── X8 (Scenarios)
```
