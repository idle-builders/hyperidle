# X6 Concept: Built-in Harness (Best-Practice Agent Loop)

## Required reading for downstream agents

- `.pipeline/work-packages/TRACK-X.md` (X6 section)
- `packages/shared/src/harness/harness-adapter.ts` — SessionConfig, SessionHandle, SessionResult, HarnessAdapter interface
- `packages/shared/src/harness/harness-events.ts` — HarnessEvent union (the event types the adapter must emit)
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` — reference adapter; shows event translation, cost tracking, session management patterns
- `packages/server/src/harness/adapter-pool.ts` — AdapterPool, AdapterMeta, createLocalAdapterPool; registration and selection
- `packages/server/src/services/model-gateway.ts` — resolveModelTier, BUILT_IN_GATEWAY_CONFIG; how tier maps to provider/model/key
- `packages/shared/src/model-gateway.ts` — ModelProvider, ResolvedModel, ModelGatewayConfig types
- `packages/server/src/skill-tools/tool-registry.ts` — ToolRegistry, ToolContext, buildToolRegistry, toClaudeToolSpec, ClaudeToolSpec
- `packages/server/src/skill-tools/tool-result.ts` — ToolResult discriminated union (success/error)
- `packages/shared/src/types/money.ts` — WireMoney, TokenUsage, TierTokenCount
- `packages/server/src/services/session-provisioning.ts` — provisionSession; the 11-phase orchestrator that starts sessions
- `docs/agent-layer/model-routing-and-cost.md` — model tier vocabulary (reasoning/workhorse/fast), tier closure rule
- `docs/architecture/components.md` section 2.7 — Harness Adapter component description

---

## BuiltinHarnessAdapter primitive

**Definition.** A concrete `HarnessAdapter` implementation that runs the agent execution loop in-process, making direct HTTP calls to LLM provider APIs and routing tool calls through the existing `ToolRegistry`. The first harness where HyperIdle owns the loop rather than delegating to an external subprocess or SDK.

### Essential properties

- **Structured loop.** The harness drives the LLM through a plan-execute-reflect-stop cycle. The harness controls phase transitions; the LLM proposes actions within the current phase.
- **Direct LLM API calls.** Uses `ResolvedModel` from the model gateway (X4) to make HTTP requests to Anthropic Messages API or OpenAI-compatible chat completions endpoints. No SDK subprocess, no agent framework.
- **Internal tool execution.** Tool calls from the LLM are routed through `ToolRegistry.invoke()` — the same code path used by the event-stream interception in session provisioning, but called directly by the harness instead of intercepted from an external event stream.
- **Multi-provider format normalization.** Translates between Anthropic `tool_use` content blocks and OpenAI `tool_calls` response format. The harness speaks both wire formats and normalizes to a single internal representation.
- **Conversation history management.** Maintains an in-memory array of messages per session. Implements a sliding window with summarization when approaching context limits.
- **Event streaming.** Emits the standard `HarnessEvent` types (`token_usage`, `tool_call`, `completion`, `error`, `cost_update`, `pre_compaction`) through `streamEvents`.
- **Max-iterations guard.** Configurable ceiling (default 50) on the number of loop iterations. Prevents runaway sessions.

### What it is not

- **Not a code execution environment.** The built-in harness cannot edit files, run bash commands, or interact with git. It can ONLY call HyperIdle skill-tools (send_message, create_task, write_memory, submit_review, etc.). Reason: external harnesses (Claude Code, Aider) are purpose-built for code execution with sandboxing, permission models, and file system integration. Duplicating that capability is scope creep and expands the security surface. The built-in harness's value is meta-layer awareness and orchestration quality, not raw execution capability.

- **Not a model proxy or relay.** The built-in harness makes LLM API calls but it is not a proxy that forwards requests from other components. It is the sole consumer of its own API calls. The model gateway resolves configuration; the built-in harness uses that configuration to call providers directly. Reason: proxy patterns introduce latency, error surface, and configuration complexity. Direct calls keep the harness in full control of the conversation for reflection checkpoints and tier switching.

- **Not a multi-agent orchestrator.** The built-in harness runs a single agent loop per session. It does not spawn sub-agents, coordinate multiple LLMs, or implement evaluator-generator patterns. Reason: sub-agent spawning is explicitly out of scope per the spec. Multi-agent coordination is the meta-layer's job (via the provisioning orchestrator). Embedding it inside the harness would violate the three-layer boundary.

- **Not multi-modal.** Text-only input/output. No image processing, no audio, no video. Reason: the skill-tools are text-based; the use cases the built-in harness serves (orchestration, planning, knowledge work) are text-centric. Multi-modal support is a future concern if specific skill-tools require it.

- **Not a replacement for external harnesses.** The built-in harness is the default when nothing else is installed. It is good at meta-layer-aware orchestration tasks. For code execution, file manipulation, and git operations, external harnesses remain the right tool. The harness is additive, not exclusive.

### Composition

- **Uses** `ResolvedModel` (from model gateway X4) — provider, model, apiKey, baseUrl for LLM calls
- **Uses** `ToolRegistry` (from tool-registry.ts) — to execute tool calls via `invoke(name, args)`
- **Uses** `ClaudeToolSpec` / OpenAI function spec — to format tool definitions for the LLM
- **Accepts** `SessionConfig` — workspacePath, composedPrompt, modelTier, tools, resolvedModel
- **Produces** `HarnessEvent` — streamed through `streamEvents` async iterable
- **Produces** `SessionResult` — outcome, cost (WireMoney), tokenUsage (TokenUsage)
- **Maintains** in-memory conversation history (array of messages per session, not persisted)

### Lifecycle

A session in the built-in harness moves through:

1. **Init** — `startSession(config)` called. Resolve model config. Initialize empty conversation with system prompt (from `config.composedPrompt`). Build tool definitions array from `config.tools`. Return `SessionHandle`.

2. **Planning turn** — First LLM call. The harness prepends a planning instruction to the user message: "Read the task, read the available context, propose a plan of subtasks before executing." The model's response is treated as the plan. Tool calls during the planning turn are permitted (the model may call `read_inbox` or `query_practice` to gather context for its plan). The plan text from the model's response is written to `work/task-notes.md` via the `write_session_notes` tool before proceeding to the execute loop.

3. **Execute loop** — The harness enters the main loop:
   - Send conversation to LLM
   - If LLM returns tool calls: execute each via ToolRegistry, append results to conversation, emit `tool_call` events
   - If LLM returns text-only (no tool calls): this is the completion signal. Emit `completion` event. Exit loop.
   - If LLM returns `stop_reason: "end_turn"` with no tool calls: exit loop.
   - Increment iteration counter. If >= max iterations: inject a "you have reached the iteration limit, wrap up now" message, run one final LLM turn, then exit.

4. **Reflection checkpoints** — Every N tool calls (configurable, default 5), before sending the next LLM request, the harness injects a user message: "Review your progress. What have you accomplished? What's next? Are you still on track for the task's done condition?" The model's response is part of the conversation history (not filtered out). The checkpoint counter resets after each reflection.

5. **Context management** — After each LLM response, the harness checks cumulative token usage against the model's context window size. At 80% utilization: emit a `pre_compaction` event. Trigger a summarization pass: the harness asks the LLM (at the "fast" tier) to summarize the conversation so far, then replaces the older messages with the summary. The agent also writes session notes via `write_session_notes` before summarization.

6. **Completion** — The loop exits. The harness returns `SessionResult` with the accumulated cost and token usage.

7. **Stop** — `stopSession(handle)` called. If the session is still running, signal the loop to terminate after the current LLM call completes. Return `SessionResult`.

### Authority

The harness is the authority over the loop. Key decisions:
- **Phase transitions** — the harness decides when to move from planning to execution, when to inject reflection, when to trigger summarization, when to stop.
- **Tool call execution** — the harness decides which tool calls to execute (all of them, filtered by the ToolRegistry's role check). The LLM proposes; the harness executes.
- **Tier switching** — the harness can downgrade to "fast" tier for routine sub-steps (summarization, formatting) and return to the primary tier for substantive work. This is the harness's decision, not the LLM's.
- **Iteration limits** — the harness enforces the max-iterations guard. The LLM cannot override it.

The LLM is an advisor within the loop. It proposes actions (tool calls, text output). The harness decides whether to execute them and what to do next.

### Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **BuiltinHarnessAdapter** | Concrete HarnessAdapter that runs the agent loop in-process via direct LLM API calls. | InternalHarness, NativeHarness, DefaultHarness, SimpleHarness, LightweightHarness |
| **agent loop** | The plan-execute-reflect-stop cycle (lowercase, descriptive). Not reified as a class. | AgentLoop (as a type name), execution engine, orchestration loop, run loop |
| **LLM client** | HTTP client abstraction normalizing Anthropic/OpenAI-compatible formats. | ModelClient, ProviderClient, APIClient, LLMService |
| **reflection checkpoint** | Harness-injected prompt forcing progress assessment. Structural, not prompt-engineered. | self-reflection, introspection, metacognition, review point |
| **conversation history** | In-memory message array for one session. | context, memory, chat history, message buffer |
| **turn** | One round-trip: harness sends messages to LLM, LLM responds. | iteration (reserved for loop iteration count), step, cycle |

### Contracts

**Cardinality:**
- One `BuiltinHarnessAdapter` instance serves multiple concurrent sessions. Each session is an independent in-memory conversation with no shared state.
- Each session maps 1:1 to a `SessionConfig` and produces exactly one `SessionResult`.

**Closure:**
- Provider wire formats are **closed**: `"anthropic"` (Messages API with `tool_use` content blocks) and `"openai-compatible"` (chat completions with `tool_calls`). OpenRouter uses the Anthropic Messages API format via their `/api/v1/messages` endpoint. Adding a fundamentally different wire format requires a code change to the LLM client module.
- Agent loop phases are **closed**: plan, execute, reflect, stop. Phase transitions are harness-controlled.
- Event types emitted are the existing **closed** `HarnessEvent` union. No new event types introduced.
- Model tier vocabulary remains **closed**: `reasoning | workhorse | fast`. The built-in harness does not add tiers.

**Mutability:**
- Conversation history is append-only within a turn. Summarization replaces a range of older messages with a summary message — this is a structural mutation managed by the harness, not an edit to existing messages.
- Session state is immutable once `SessionResult` is returned.
- Mid-session tier switching mutates the active model tier for subsequent LLM calls but does not change the session's recorded primary tier (the `modelTier` field on the session row).

**Identity:**
- Sessions are identified by `sessionId` (opaque string, format `builtin-session-{counter}`). No new identity type.
- The adapter is registered with id `"builtin"` in the adapter pool.

**Hard rules:**
1. The first LLM turn MUST be a planning turn. The harness enforces this structurally by injecting a planning instruction. Tool calls during planning are permitted (for context gathering), but the model's text output is captured as the plan and written to session notes before the execute loop begins.
2. Reflection checkpoints are STRUCTURAL. The harness injects them by appending a user-role message to the conversation. The model cannot skip or suppress them.
3. The max-iterations guard MUST terminate the loop. If triggered, the outcome is `"completed"` (not `"crashed"`), with a completion message noting the iteration limit.
4. All tool calls MUST go through `ToolRegistry.invoke()`. The harness does not implement its own tool execution or bypass the registry's role-based filtering.
5. The harness MUST NOT call providers not supported by `ResolvedModel.provider`. Provider support is determined by the model gateway configuration.
6. Conversation history is in-memory only. No persistence across sessions, no database writes of conversation content. Session notes and task notes are persisted via skill-tools (`write_session_notes`), not by the harness directly writing to the DB.

### Rationale

External harnesses (Claude Code, Aider) are powerful but opaque. They own the agent loop, the tool system, the context management. HyperIdle's meta-layer has rich information — task context, team state, cost posture, knowledge fabric — that external harnesses cannot access because they only see a workspace directory.

The built-in harness exists for two reasons:

1. **Zero-dependency operation.** A deployer should be able to run HyperIdle without installing Claude Code, Aider, or any other external tool. The system must work out of the box for meta-layer tasks (knowledge work, coordination, planning, review).

2. **Meta-layer-aware orchestration.** Because the built-in harness runs inside the server process, it can make cost-aware tier-switching decisions, write structured session notes at pre-compaction boundaries, and access the full tool registry without going through MCP or event-stream interception. This is inherently more efficient and more informed than any external harness that communicates through workspace files and MCP.

The structured loop (plan-execute-reflect-stop) is informed by Anthropic's harness engineering research: agents that plan before acting produce higher-quality work; reflection checkpoints catch drift before it compounds; context management with summarization (not hard truncation) preserves coherence across long sessions. These patterns are encoded structurally in the harness, not left to prompt engineering.

---

## Research findings informing this concept

### Anthropic harness engineering (2025-2026)

From [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents):
- Compaction alone is insufficient for long-horizon tasks. Context resets (clearing and restarting with a structured handoff) outperform in-place compaction for complex work.
- Structured note-taking throughout the session (not just at the end) provides crash safety and enables coherent context resets.
- The harness controls the conversation; the model proposes actions within the harness's structure.

From [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents):
- Context quality has five criteria: relevance, sufficiency, isolation, economy, provenance.
- Agents that write structured progress files enable faster context recovery when starting fresh.

From [Building effective agents](https://www.anthropic.com/research/building-effective-agents):
- Simple agentic loops (while-loops alternating LLM calls and tool execution) are the foundation.
- Tool-first design: clear tool descriptions, structured success/failure signals.

### Wire format comparison

**Anthropic Messages API (`tool_use`):**
- Request: tools array with `input_schema` (JSON Schema), messages array with content blocks
- Response: `stop_reason: "tool_use"`, content array containing `tool_use` blocks with `id`, `name`, `input`
- Tool result: user message with `tool_result` content block referencing the `tool_use` id
- Arguments are parsed objects (not JSON strings)

**OpenAI Chat Completions (`function_calling` / `tool_calls`):**
- Request: tools array with `type: "function"`, function object with `parameters` (JSON Schema)
- Response: `finish_reason: "tool_calls"`, message with `tool_calls` array containing `id`, `function.name`, `function.arguments` (JSON string)
- Tool result: message with `role: "tool"`, `tool_call_id`, `content` (string)
- Arguments are JSON strings that must be parsed

**OpenRouter:**
- Supports the Anthropic Messages API format at `/api/v1/messages` endpoint
- Also supports OpenAI chat completions format at `/api/v1/chat/completions`
- Headers: `Authorization: Bearer <key>`, optional `X-OpenRouter-Title`, `HTTP-Referer`

### Agent loop patterns

The core loop pattern across all frameworks is identical:
1. Send messages + tool definitions to LLM
2. If response contains tool calls: execute them, append results, go to 1
3. If response is text-only (no tool calls): done

The built-in harness adds three structural layers on top of this core pattern:
- **Planning phase** before the execute loop
- **Reflection injection** during the execute loop
- **Context management** (summarization + pre-compaction awareness) throughout
