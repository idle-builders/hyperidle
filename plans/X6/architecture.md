# X6 Architecture: Built-in Harness (Best-Practice Agent Loop)

## Required reading

- `plans/X6/concept.md` — locked concept (what the built-in harness IS and IS NOT)
- `packages/shared/src/harness/harness-adapter.ts` — SessionConfig, SessionHandle, SessionResult, HarnessAdapter
- `packages/shared/src/harness/harness-events.ts` — HarnessEvent union
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` — reference adapter patterns
- `packages/server/src/harness/adapter-pool.ts` — AdapterPool, createLocalAdapterPool
- `packages/server/src/services/model-gateway.ts` — resolveModelTier, BUILT_IN_GATEWAY_CONFIG
- `packages/shared/src/model-gateway.ts` — ModelProvider, ResolvedModel, ModelGatewayConfig
- `packages/server/src/skill-tools/tool-registry.ts` — ToolRegistry, ToolContext, buildToolRegistry, ClaudeToolSpec
- `packages/server/src/skill-tools/tool-result.ts` — ToolResult
- `packages/shared/src/types/money.ts` — WireMoney, TokenUsage, TierTokenCount
- `packages/server/src/services/session-provisioning.ts` — provisionSession (11-phase orchestrator)
- `packages/server/src/services/server-config.ts` — readServerConfig, ServerConfig

---

## Plan reconciliation

| Spec assumption | Codebase reality | Resolution |
|---|---|---|
| `write_session_notes` tool exists | Yes — `packages/server/src/skill-tools/write-session-notes.ts` | Use as-is for plan/notes persistence |
| `ToolRegistry` with `invoke(name, args)` | Yes — `packages/server/src/skill-tools/tool-registry.ts` | Built-in harness uses existing registry |
| `toClaudeToolSpecs()` on registry | Yes — returns `ClaudeToolSpec[]` (Anthropic format) | Need OpenAI-format converter too |
| `ResolvedModel` has provider/model/apiKey/baseUrl | Yes — `packages/shared/src/model-gateway.ts` | Use directly |
| No context window size lookup exists | Correct — `maxTokens: 200000` is hardcoded in claude-agent-sdk-adapter | Introduce `MODEL_CONTEXT_WINDOWS` lookup |
| `SessionConfig.resolvedModel` is optional | Yes — backward compat field | Add optional `resolvedFastModel` for tier switching |
| `AdapterPool` has `register(id, adapter, meta)` | Yes — `packages/server/src/harness/adapter-pool.ts` | Register built-in adapter alongside local |
| `createLocalAdapterPool()` creates pool with ClaudeAgentSdkAdapter | Yes — only registers "local" adapter | Extend to also register "builtin" adapter |
| `model-tier-map.ts` deleted (X4) | Yes — replaced by model gateway | No conflict |
| `HarnessEvent` union includes all required event types | Yes — token_usage, tool_call, completion, error, cost_update, pre_compaction | Emit these directly |
| Tool execution currently happens in provisioning Phase 10 | Yes — `registry.invoke(event.toolName, event.args)` on line 518 | Built-in harness executes internally; provisioning skips Phase 10 tool interception for built-in sessions |

---

## Architecture overview

### File structure

```
packages/server/src/harness/
  builtin-harness-adapter.ts     # BuiltinHarnessAdapter class (HarnessAdapter impl)
  llm-client.ts                  # callLlm() function + format normalization
  llm-types.ts                   # LlmMessage, LlmToolCall, LlmResponse, etc.
  context-window.ts              # MODEL_CONTEXT_WINDOWS lookup + token tracking

packages/shared/src/harness/
  harness-adapter.ts             # SessionConfig gains resolvedFastModel (additive)

packages/server/src/harness/__tests__/
  builtin-harness-adapter.test.ts
  llm-client.test.ts
  context-window.test.ts
```

### Layer placement

The `BuiltinHarnessAdapter` lives in `packages/server/src/harness/` — same directory as `ClaudeAgentSdkAdapter` and `IsolatedHarnessAdapter`. It is a Meta Layer component (not Agent Runtime). It calls downward into the model gateway (resolution) and outward to LLM APIs (execution), and inward to the tool registry (skill-tools).

---

## Type signatures

### 1. LLM types (`packages/server/src/harness/llm-types.ts`)

```typescript
/**
 * Wire-format-agnostic message representation used inside the built-in harness.
 * Both Anthropic and OpenAI-compatible formats are normalized to this shape.
 */

export type LlmRole = "system" | "user" | "assistant";

/** A text content block. */
export interface LlmTextBlock {
  readonly type: "text";
  readonly text: string;
}

/** A tool-use request from the assistant. */
export interface LlmToolUseBlock {
  readonly type: "tool_use";
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

/** A tool result from the user (response to a tool_use). */
export interface LlmToolResultBlock {
  readonly type: "tool_result";
  readonly toolUseId: string;
  readonly content: string;
  readonly isError: boolean;
}

export type LlmContentBlock = LlmTextBlock | LlmToolUseBlock | LlmToolResultBlock;

export interface LlmMessage {
  readonly role: LlmRole;
  readonly content: readonly LlmContentBlock[] | string;
}

/** Normalized response from any LLM provider. */
export interface LlmResponse {
  readonly stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop";
  readonly content: readonly (LlmTextBlock | LlmToolUseBlock)[];
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadInputTokens?: number;
    readonly cacheCreationInputTokens?: number;
  };
}

/** Tool definition in the internal format (derived from ClaudeToolSpec). */
export interface LlmToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: "object";
    readonly properties: Record<string, unknown>;
    readonly required?: readonly string[];
  };
}
```

### 2. LLM client (`packages/server/src/harness/llm-client.ts`)

```typescript
import type { ResolvedModel } from "@hyperidle/shared";
import type { LlmMessage, LlmResponse, LlmToolDef } from "./llm-types.js";

export interface CallLlmOptions {
  readonly model: ResolvedModel;
  readonly messages: readonly LlmMessage[];
  readonly tools?: readonly LlmToolDef[];
  readonly maxTokens?: number;
  readonly system?: string;
}

/**
 * Make a single LLM API call. Switches on model.provider to choose wire format:
 * - "anthropic" → Anthropic Messages API (POST /v1/messages)
 * - "openrouter" → Anthropic Messages API via OpenRouter (POST /api/v1/messages)
 * - "openai-compatible" → OpenAI Chat Completions (POST /v1/chat/completions)
 *
 * Returns a normalized LlmResponse regardless of provider.
 * Throws on HTTP errors (non-2xx) or network failures.
 */
export async function callLlm(options: CallLlmOptions): Promise<LlmResponse>;
```

**Wire format mapping:**

| Provider | API endpoint | Request format | Response format |
|---|---|---|---|
| `"anthropic"` | `{baseUrl}/v1/messages` | Anthropic Messages API: `{ model, messages, tools (input_schema), system, max_tokens }` | `{ stop_reason, content: [{type: "text"/"tool_use"}], usage }` |
| `"openrouter"` | `{baseUrl}/v1/messages` | Same as Anthropic (OpenRouter mirrors the Messages API) with `X-OpenRouter-Title` header | Same as Anthropic |
| `"openai-compatible"` | `{baseUrl}/v1/chat/completions` | OpenAI format: `{ model, messages, tools [{type:"function", function:{name, parameters}}] }` | `{ choices[0].finish_reason, choices[0].message.tool_calls, usage }` |

**Format normalization details:**

*Anthropic → internal:*
- Request: `LlmMessage` maps directly. `tool_result` blocks are sent as user messages with `tool_result` content.
- Response: `stop_reason` maps to `stopReason`. Content blocks map 1:1. `tool_use.input` is already a parsed object.

*OpenAI → internal:*
- Request: Messages must be flattened. System messages go in `messages[0]` with `role: "system"`. Tool results become `role: "tool"` messages with `tool_call_id` and `content` (string). Tool definitions use `type: "function"`, `function: { name, description, parameters }`.
- Response: `finish_reason: "tool_calls"` → `stopReason: "tool_use"`. `finish_reason: "stop"` → `stopReason: "end_turn"`. `tool_calls[].function.arguments` is a JSON string that must be parsed. Text content comes from `choices[0].message.content`.

### 3. Context window management (`packages/server/src/harness/context-window.ts`)

```typescript
/**
 * Known context window sizes for models.
 * Conservative estimates (use effective window, not max).
 * Unknown models default to 128k.
 *
 * @lore X6: These are the *input* context windows. Output token limits
 * are separate and not tracked here — they default to 16384 per call.
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic
  "claude-opus-4-20250514": 200_000,
  "claude-sonnet-4-20250514": 200_000,
  "claude-haiku-3-5-20241022": 200_000,
  // Future-proofing: add models as they're configured in the gateway
};

export const DEFAULT_CONTEXT_WINDOW = 128_000;

/**
 * Get the context window size for a model string.
 */
export function contextWindowForModel(model: string): number;

/**
 * Check if cumulative token usage has crossed a threshold (fraction 0.0-1.0).
 */
export function isAboveThreshold(
  cumulativeInputTokens: number,
  contextWindow: number,
  threshold: number,
): boolean;
```

### 4. SessionConfig extension (`packages/shared/src/harness/harness-adapter.ts`)

```typescript
export interface SessionConfig {
  // ... existing fields unchanged ...

  /**
   * X6: Resolved model for the "fast" tier, used by the built-in harness
   * for mid-session tier switching (summarization, formatting).
   * Optional — when absent, the harness uses the primary resolvedModel for all calls.
   */
  readonly resolvedFastModel?: ResolvedModel;
}
```

### 5. BuiltinHarnessAdapter (`packages/server/src/harness/builtin-harness-adapter.ts`)

```typescript
import type {
  HarnessAdapter,
  HarnessCapabilities,
  HarnessEvent,
  SessionConfig,
  SessionHandle,
  SessionResult,
} from "@hyperidle/shared";
import type { ToolRegistry } from "../skill-tools/tool-registry.js";

/** Configuration options for the built-in harness. */
export interface BuiltinHarnessOptions {
  /** Maximum loop iterations before forced stop. Default: 50. */
  readonly maxIterations?: number;
  /** Tool calls between reflection checkpoints. Default: 5. */
  readonly reflectionInterval?: number;
  /** Context window usage fraction that triggers pre-compaction. Default: 0.8. */
  readonly preCompactionThreshold?: number;
  /** Max output tokens per LLM call. Default: 16384. */
  readonly maxOutputTokens?: number;
}

/**
 * Per-session state held in memory.
 */
interface BuiltinSession {
  readonly sessionId: string;
  readonly config: SessionConfig;
  readonly messages: LlmMessage[];       // mutable conversation history
  readonly toolDefs: LlmToolDef[];
  registry: ToolRegistry | null;         // set via setSessionToolRegistry before startSession
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostMinor: number;                // in minor units (cents for USD)
  tokensByTier: Partial<Record<ModelTier, TierTokenCount>>;
  toolCallCount: number;                 // for reflection checkpoint tracking
  iterationCount: number;
  done: boolean;
  aborted: boolean;
  events: HarnessEvent[];                // buffered for streamEvents
  notifyStream: (() => void) | null;     // wake the async generator
}

export class BuiltinHarnessAdapter implements HarnessAdapter {
  private readonly options: Required<BuiltinHarnessOptions>;
  private readonly sessions: Map<string, BuiltinSession>;
  private nextId: number;

  constructor(options?: BuiltinHarnessOptions);

  /**
   * X6: Inject a tool registry for a session. Must be called before startSession.
   * The provisioning orchestrator calls this after building the registry (Phase 8).
   *
   * This method is on the concrete class, NOT on the HarnessAdapter interface.
   * The provisioning orchestrator casts to BuiltinHarnessAdapter when
   * meta.type === "builtin".
   *
   * @lore X6: We inject the registry rather than taking it in the constructor
   * because the registry is session-scoped (bound to a specific ToolContext
   * with sessionId, agentId, taskId, workspacePath, watcher). The adapter
   * is registered in the pool once; registries are created per-session by
   * the provisioning orchestrator.
   */
  setSessionToolRegistry(sessionId: string, registry: ToolRegistry): void;

  // ── HarnessAdapter interface ──
  async startSession(config: SessionConfig): Promise<SessionHandle>;
  streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent>;
  async stopSession(handle: SessionHandle): Promise<SessionResult>;
  getCapabilities(): HarnessCapabilities;

  // ── Internal loop ──
  private async runLoop(session: BuiltinSession): Promise<void>;
  private async runPlanningTurn(session: BuiltinSession): Promise<void>;
  private async runExecuteTurn(session: BuiltinSession): Promise<void>;
  private async executeToolCalls(
    session: BuiltinSession,
    toolCalls: LlmToolUseBlock[],
  ): Promise<LlmToolResultBlock[]>;
  private async injectReflection(session: BuiltinSession): Promise<void>;
  private async summarizeHistory(session: BuiltinSession): Promise<void>;
  private emitEvent(session: BuiltinSession, event: HarnessEvent): void;
  private estimateCost(
    inputTokens: number,
    outputTokens: number,
    model: string,
  ): number;
}
```

---

## Detailed design

### A. The agent loop

The core loop runs inside `startSession` (spawned as a detached async task — the method returns the `SessionHandle` immediately while the loop runs in the background, similar to how `ClaudeAgentSdkAdapter.startSession` works).

```
startSession(config)
  │
  ├── 1. Initialize session state (messages, tools, counters)
  │    └── System message = config.composedPrompt
  │    └── Tool definitions from config.tools → converted to LlmToolDef[]
  │
  ├── 2. Start background loop (no await — runs independently)
  │    │
  │    ├── PLANNING TURN
  │    │    ├── Append user message: "Begin working on your assigned task.
  │    │    │    Before executing any actions, read the task context and
  │    │    │    propose a plan of subtasks."
  │    │    ├── Call LLM (primary tier)
  │    │    ├── If response has tool calls → execute them (context gathering)
  │    │    │    └── Loop: call LLM again with results until no more tool calls
  │    │    ├── Capture text output as plan
  │    │    ├── Emit completion event with plan text
  │    │    └── Write plan to session notes (if write_session_notes in tools):
  │    │         invoke registry.invoke("write_session_notes", { notes: planText })
  │    │
  │    ├── EXECUTE LOOP (while !done && iteration < maxIterations)
  │    │    ├── Check reflection: if toolCallCount % reflectionInterval === 0
  │    │    │    └── Inject reflection user message
  │    │    │    └── Call LLM → capture reflection text
  │    │    │    └── Emit completion event with reflection
  │    │    │
  │    │    ├── Check context window: if above preCompactionThreshold
  │    │    │    ├── Emit pre_compaction event
  │    │    │    ├── Write session notes (pre-compaction safety)
  │    │    │    └── Summarize older conversation turns (fast tier if available)
  │    │    │
  │    │    ├── Call LLM (primary tier)
  │    │    │    ├── Emit token_usage event
  │    │    │    └── Emit cost_update event
  │    │    │
  │    │    ├── Process response:
  │    │    │    ├── If tool_use blocks:
  │    │    │    │    ├── For each tool call:
  │    │    │    │    │    ├── Emit tool_call event
  │    │    │    │    │    ├── Execute via registry.invoke()
  │    │    │    │    │    ├── Format result as tool_result message
  │    │    │    │    │    └── toolCallCount++
  │    │    │    │    └── Append tool results to messages
  │    │    │    │
  │    │    │    ├── If text only (no tool calls):
  │    │    │    │    ├── Emit completion event
  │    │    │    │    └── done = true
  │    │    │    │
  │    │    │    └── If max_tokens hit:
  │    │    │         └── Continue loop (LLM ran out of output space, not done)
  │    │    │
  │    │    └── iteration++
  │    │
  │    ├── MAX ITERATIONS REACHED (if !done)
  │    │    ├── Inject user message: "You have reached the iteration limit.
  │    │    │    Summarize your progress and wrap up."
  │    │    ├── Call LLM one final time (no tools)
  │    │    ├── Emit completion event
  │    │    └── done = true
  │    │
  │    └── ERROR PATH
  │         ├── Catch any error from LLM calls or tool execution
  │         ├── Emit error event
  │         └── done = true
  │
  └── 3. Return SessionHandle { sessionId }
```

### B. Tool call execution

The built-in harness executes tool calls synchronously within the loop:

```typescript
async executeToolCalls(session, toolCalls):
  results = []
  for each toolCall in toolCalls:
    // Emit event for observability (before execution, matching provisioning pattern)
    emitEvent(session, {
      type: "tool_call",
      toolName: toolCall.name,
      args: toolCall.input
    })

    // Execute via registry
    result = await session.registry.invoke(toolCall.name, toolCall.input)

    // Format result for LLM consumption
    if result.success:
      content = JSON.stringify(result.data)
      isError = false
    else:
      content = `Error [${result.code}]: ${result.error}`
      isError = true

    results.push({
      type: "tool_result",
      toolUseId: toolCall.id,
      content,
      isError
    })
  return results
```

**Structured output for tool results:** The harness formats results with clear success/failure signals:
- Success: JSON stringified data from `ToolResult.data`
- Failure: `Error [CODE]: message` — includes the machine-readable code so the LLM can reason about retries vs permanent failures

### C. Reflection checkpoint injection

Every `reflectionInterval` tool calls (default 5), the harness injects a reflection:

```typescript
async injectReflection(session):
  reflectionPrompt = `Review your progress on the current task.
What have you accomplished so far?
What remains to be done?
Are you still on track for the task's done condition?
If you are stuck or going in circles, consider a different approach.`

  session.messages.push({
    role: "user",
    content: reflectionPrompt
  })

  // Call LLM for reflection (primary tier — reflection is substantive work)
  response = await callLlm({
    model: session.config.resolvedModel,
    messages: session.messages,
    tools: session.toolDefs,  // tools available during reflection
    system: session.config.composedPrompt
  })

  // Add reflection response to history
  session.messages.push({
    role: "assistant",
    content: response.content
  })

  // Emit the reflection text as a completion event
  for block in response.content:
    if block.type === "text":
      emitEvent(session, { type: "completion", text: block.text })

  // If the model made tool calls during reflection, execute them
  // (the model might check status or write notes)
  toolCalls = response.content.filter(b => b.type === "tool_use")
  if toolCalls.length > 0:
    results = await executeToolCalls(session, toolCalls)
    session.messages.push({
      role: "user",
      content: results
    })
```

### D. Context window management

The harness tracks cumulative input tokens and manages the conversation window:

```typescript
// After each LLM response:
session.totalInputTokens += response.usage.inputTokens
session.totalOutputTokens += response.usage.outputTokens

contextWindow = contextWindowForModel(session.config.resolvedModel.model)

if isAboveThreshold(session.totalInputTokens, contextWindow, preCompactionThreshold):
  // 1. Emit pre_compaction event
  emitEvent(session, {
    type: "pre_compaction",
    contextTokens: session.totalInputTokens,
    maxTokens: contextWindow
  })

  // 2. Write session notes (crash safety)
  if registry has "write_session_notes":
    registry.invoke("write_session_notes", {
      notes: extractProgressSummary(session.messages),
      append: true
    })

  // 3. Summarize conversation
  await summarizeHistory(session)
```

**Summarization strategy:**

```typescript
async summarizeHistory(session):
  // Use fast tier if available, otherwise primary
  summarizeModel = session.config.resolvedFastModel ?? session.config.resolvedModel

  // Keep system message + last N messages intact
  // Summarize everything between
  preserveCount = 6  // last 3 user-assistant pairs
  toSummarize = session.messages.slice(1, -preserveCount)  // skip system, keep recent

  if toSummarize.length < 4:
    return  // not enough to summarize

  summarizeRequest = [{
    role: "user",
    content: `Summarize the following conversation concisely, preserving:
- Key decisions made
- Tool calls and their outcomes
- Current progress toward the task
- Any blockers or issues encountered

Conversation to summarize:
${formatMessagesForSummary(toSummarize)}`
  }]

  response = await callLlm({
    model: summarizeModel,
    messages: summarizeRequest,
    maxTokens: 4096,
    system: "You are a conversation summarizer. Produce a concise summary."
  })

  summaryText = extractText(response)

  // Replace old messages with summary
  session.messages = [
    session.messages[0],  // system message
    { role: "user", content: `[Previous conversation summary]\n${summaryText}` },
    { role: "assistant", content: "Understood. Continuing from the summary." },
    ...session.messages.slice(-preserveCount)  // recent messages
  ]

  // Track tokens for the fast tier
  if summarizeModel !== session.config.resolvedModel:
    accumulateTokens(session, "fast", response.usage)
  else:
    accumulateTokens(session, session.config.modelTier, response.usage)
```

### E. Mid-session tier switching

The harness uses the fast tier for:
1. Conversation summarization (see above)
2. No other automatic switching in v1

The `resolvedFastModel` is passed through `SessionConfig`. If absent, summarization uses the primary tier. The provisioning orchestrator resolves both tiers:

```typescript
// In sessions-routes.ts (extended):
let resolvedFastModel: ResolvedModel | undefined;
if (deps.credentialResolver) {
  try {
    resolvedFastModel = await resolveModelTier(
      "fast",
      serverCfg.modelGateway,
      deps.credentialResolver,
    );
  } catch {
    // Fast tier resolution failure is non-fatal — harness uses primary tier
  }
}
```

### F. Cost estimation

The harness needs to emit `cost_update` events. LLM API responses include token counts but not always cost. The harness estimates cost using known pricing:

```typescript
/**
 * Rough cost estimation per 1M tokens.
 * Updated as pricing changes. Falls back to conservative estimates.
 *
 * @lore X6: These are estimates for event emission only. The provisioning
 * orchestrator's recordCostAndCheck uses the harness-reported cost for
 * actual budget tracking. Inaccuracy here means the cost_update events
 * shown in the UI are approximate, but budget enforcement is correct
 * because it reads from the provider's actual billing data (when available)
 * or from these same estimates (when not).
 */
const COST_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-haiku-3-5-20241022": { input: 0.80, output: 4 },
  // Default for unknown models
};
const DEFAULT_COST = { input: 3, output: 15 };

function estimateCostUsd(inputTokens: number, outputTokens: number, model: string): number {
  const rates = COST_PER_MILLION_TOKENS[model] ?? DEFAULT_COST;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}
```

### G. Provisioning orchestrator integration

The provisioning orchestrator (`session-provisioning.ts`) needs changes to support the built-in harness:

1. **Phase 8.5 (after registry build):** If the selected adapter is the built-in harness (`meta.type === "builtin"`), call `setSessionToolRegistry(sessionId, registry)`.

2. **Phase 10 (event stream):** The built-in harness emits `tool_call` events for observability, but the provisioning orchestrator should NOT re-execute them (they're already executed). The tool_call event handler should skip `registry.invoke()` when the adapter is the built-in harness.

```typescript
// In Phase 10 event loop:
} else if (event.type === "tool_call") {
  // Emit to bus for observability
  eventBus.emit({
    type: "tool_call_recorded",
    streamId: sessionId,
    sessionId,
    toolName: event.toolName,
    argsSummary: summarizeToolArgs(event.args),
    timestamp: Date.now(),
  });

  // Only invoke via registry for external harnesses.
  // The built-in harness executes tools internally.
  if (selectedAdapter.meta.type !== "builtin") {
    await registry.invoke(event.toolName, event.args);
  }
}
```

### H. Adapter pool registration

Extend `createLocalAdapterPool()` to also register the built-in harness:

```typescript
export function createLocalAdapterPool(): AdapterPool {
  const pool = new AdapterPool();

  // Existing: Claude Agent SDK adapter
  const claudeAdapter = new ClaudeAgentSdkAdapter();
  pool.register("local", claudeAdapter, {
    name: "local",
    kind: "local",
    type: "claude-code",
    modelProviders: ["anthropic"],
    maxConcurrent: parseInt(process.env.HYPERIDLE_LOCAL_MAX_CONCURRENT ?? "4", 10),
  });

  // X6: Built-in harness adapter
  const builtinAdapter = new BuiltinHarnessAdapter();
  pool.register("builtin", builtinAdapter, {
    name: "builtin",
    kind: "local",
    type: "builtin",
    modelProviders: ["anthropic", "openrouter", "openai-compatible"],
    maxConcurrent: parseInt(process.env.HYPERIDLE_BUILTIN_MAX_CONCURRENT ?? "8", 10),
  });

  return pool;
}
```

The built-in harness supports all three model providers since it makes direct API calls. It has higher `maxConcurrent` than the Claude Code adapter because it doesn't spawn subprocesses — each session is just an in-memory conversation loop.

**Default adapter selection:** When no agent `harnessType` is configured, the adapter pool selects based on load. The built-in harness is available alongside Claude Code. When Claude Code is not installed (no `claude` binary), the pool still has the built-in harness as a fallback.

The spec says "registered as the default adapter in the pool when no external harnesses are configured." This means: if no external workers connect and the ClaudeAgentSdkAdapter is unavailable (no API key or binary), the built-in harness is the only option. The pool's `select()` already handles this — it returns the least-loaded eligible adapter.

### I. OpenAI tool format conversion

The `ToolRegistry.toClaudeToolSpecs()` returns Anthropic-format tool specs. For OpenAI-compatible providers, we need a converter:

```typescript
// In llm-client.ts

interface OpenAiFunctionTool {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: {
      readonly type: "object";
      readonly properties: Record<string, unknown>;
      readonly required?: readonly string[];
    };
  };
}

function claudeSpecToOpenAi(spec: LlmToolDef): OpenAiFunctionTool {
  return {
    type: "function",
    function: {
      name: spec.name,
      description: spec.description,
      parameters: {
        type: "object",
        properties: spec.inputSchema.properties,
        ...(spec.inputSchema.required ? { required: spec.inputSchema.required } : {}),
      },
    },
  };
}
```

---

## Acceptance criteria and verification

### AC-1: BuiltinHarnessAdapter implements HarnessAdapter

**Criterion:** A `BuiltinHarnessAdapter` class implements `HarnessAdapter` with `startSession`, `streamEvents`, `stopSession`, `getCapabilities`.

**Verification:** TypeScript type check (`npm run check`) — the class must satisfy the interface. Unit test: construct adapter, call `getCapabilities()`, assert `{ preCompactionTrigger: true, subAgents: false, modelProviders: ["anthropic", "openrouter", "openai-compatible"] }`.

### AC-2: Structured agent loop (plan → execute → reflect → stop)

**Criterion:** The harness runs a structured loop. First turn is planning. Execute loop follows. Reflection checkpoints fire every N tool calls.

**Verification:** Unit test with a mock LLM (scripted responses):
1. Mock LLM returns a plan text on first call → assert `completion` event contains plan text.
2. Mock LLM returns tool calls → assert `tool_call` events emitted and tool results fed back.
3. After 5 tool calls, assert the conversation includes a reflection prompt injection.
4. Mock LLM returns text-only → assert loop stops and final `completion` event emitted.

### AC-3: LLM API calls via model gateway

**Criterion:** The harness uses `ResolvedModel` to make HTTP calls to Anthropic and OpenAI-compatible APIs.

**Verification:** Unit test for `callLlm`:
1. Mock `fetch` to capture requests. Call with Anthropic provider → assert POST to `{baseUrl}/v1/messages` with correct headers and body shape.
2. Call with OpenAI-compatible provider → assert POST to `{baseUrl}/v1/chat/completions` with correct headers and body shape.
3. Call with OpenRouter provider → assert POST to `{baseUrl}/v1/messages` with `X-OpenRouter-Title` header.

### AC-4: Tool calls via ToolRegistry

**Criterion:** Tool calls from the LLM are executed via `ToolRegistry.invoke()` and results are formatted with success/failure signals.

**Verification:** Unit test:
1. Mock registry returns `{ success: true, data: { id: "123" } }` → assert tool result content is `'{"id":"123"}'` with `isError: false`.
2. Mock registry returns `{ success: false, code: "NOT_FOUND", error: "Unknown tool" }` → assert tool result content is `'Error [NOT_FOUND]: Unknown tool'` with `isError: true`.

### AC-5: Anthropic tool_use format support

**Criterion:** The harness correctly formats requests and parses responses for the Anthropic Messages API.

**Verification:** Unit test for `callLlm` Anthropic path:
1. Assert request body has `tools` with `input_schema` format.
2. Mock response with `tool_use` content blocks → assert `LlmResponse` has correct `LlmToolUseBlock` entries with parsed input objects.
3. Assert `tool_result` messages are formatted correctly for the next request.

### AC-6: OpenAI function_calling format support

**Criterion:** The harness correctly formats requests and parses responses for OpenAI-compatible chat completions.

**Verification:** Unit test for `callLlm` OpenAI-compatible path:
1. Assert request body has `tools` with `type: "function"` format.
2. Mock response with `tool_calls` → assert JSON string arguments are parsed into objects.
3. Assert tool results are sent as `role: "tool"` messages with `tool_call_id`.

### AC-7: Event streaming

**Criterion:** The harness streams `token_usage`, `tool_call`, `completion`, `error`, `cost_update`, `pre_compaction` events through `streamEvents`.

**Verification:** Integration test:
1. Start a session with a mock LLM that returns one tool call then completion.
2. Collect all events from `streamEvents`.
3. Assert events include at least: `token_usage` (with inputTokens, outputTokens, tier), `tool_call` (with toolName, args), `cost_update` (with totalCost, deltaCost), `completion` (with text).

### AC-8: Default adapter registration

**Criterion:** The built-in harness is registered in the adapter pool with type `"builtin"` and supports all three model providers.

**Verification:** Unit test: call `createLocalAdapterPool()`, assert pool has an entry with id `"builtin"`, type `"builtin"`, modelProviders includes `"anthropic"`, `"openrouter"`, `"openai-compatible"`.

### AC-9: Planning turn writes to session notes

**Criterion:** The first turn produces a plan written via `write_session_notes`.

**Verification:** Unit test: mock LLM returns plan text, mock registry tracks invocations → assert `write_session_notes` was called with the plan text.

### AC-10: Reflection checkpoint injection

**Criterion:** Every N tool calls (default 5), a reflection prompt is injected.

**Verification:** Unit test: mock LLM returns tool calls for 6 iterations → assert the conversation history contains a user message matching the reflection prompt pattern after the 5th tool call.

### AC-11: Pre-compaction awareness

**Criterion:** At 80% context window usage, the harness emits `pre_compaction` and triggers summarization.

**Verification:** Unit test: mock LLM returns large token counts pushing cumulative usage above 80% → assert `pre_compaction` event emitted with correct contextTokens and maxTokens. Assert conversation history is compressed (fewer messages after summarization).

### AC-12: Cost-aware tier switching

**Criterion:** Summarization uses the fast tier when `resolvedFastModel` is provided.

**Verification:** Unit test: configure session with `resolvedFastModel`, trigger summarization → assert the summarization LLM call uses the fast model's configuration (mock fetch captures the model field).

### AC-13: Max-iterations guard

**Criterion:** The loop stops at max iterations (default 50) with a completion message.

**Verification:** Unit test: set `maxIterations: 3`, mock LLM always returns tool calls → assert loop stops after 3 iterations, final completion event mentions iteration limit.

### AC-14: Session history management (sliding window + summarization)

**Criterion:** The harness summarizes older turns when approaching context limits rather than hard-truncating.

**Verification:** Unit test: build a session with many messages, trigger summarization → assert the message array is shorter, contains a summary message, and preserves recent messages.

### AC-15: Provisioning orchestrator integration

**Criterion:** The provisioning orchestrator detects the built-in harness and (a) injects the tool registry, (b) skips tool execution on tool_call events.

**Verification:** Integration test: provision a session targeting the built-in harness → assert the session completes without double-executing tool calls.

---

## Security and abuse cases

| Concern | Applicability | Resolution |
|---|---|---|
| **Rate limiting on POST/PATCH** | N/A — no new API routes | The built-in harness has no HTTP endpoints. LLM API calls are rate-limited by the provider. |
| **Input trust boundary (agent-authored fields)** | Applicable — tool call arguments come from the LLM | The ToolRegistry already validates arguments via Zod schemas (`inputSchema.safeParse`). The built-in harness passes raw LLM output to `registry.invoke()` which validates before execution. No additional validation needed. |
| **Secret handling** | Applicable — API keys are used for LLM calls | API keys come from `ResolvedModel.apiKey` (resolved by the model gateway from encrypted credentials). The built-in harness passes them in HTTP headers only — never logged, never stored in conversation history, never emitted in events. |
| **Path traversal** | N/A — the built-in harness does not read/write files directly | Tool calls that write files (e.g., `write_session_notes`) use `workspacePath` from `ToolContext`, which is set by the provisioning orchestrator. Path traversal is the tool's responsibility, not the harness's. |
| **SSRF** | Low risk — LLM API base URLs come from `ResolvedModel.baseUrl` | Base URLs are set by the deployer via model gateway configuration (admin-only Settings UI). The harness does not accept user-supplied URLs at runtime. URLs are validated at configuration time. |
| **Max-iterations guard bypass** | Applicable | The guard is enforced in the harness loop, not prompt-engineered. The LLM cannot override it. If the counter reaches the limit, the loop terminates regardless of what the LLM returns. |
| **Conversation history memory exhaustion** | Applicable — in-memory history grows per session | Summarization compresses history. The max-iterations guard bounds the loop. Each session is independent. A single session with 50 iterations of 200k context is ~10MB — acceptable for in-process memory. |

---

## Protected tests

```
protectedTests: []
```

No existing tests are modified by this workpackage. All tests are new.

---

## Migrations

No database migrations needed. The only shared type change is adding `resolvedFastModel?: ResolvedModel` to `SessionConfig` — this is an additive optional field, backward-compatible, no migration required.

Call sites that construct `SessionConfig`:
- `packages/server/src/services/session-provisioning.ts` — add `resolvedFastModel` from params
- `packages/server/src/routes/sessions-routes.ts` — resolve fast tier and pass through
- `packages/shared/src/harness/mock-harness-adapter.ts` — no change needed (field is optional)
- Test files constructing SessionConfig — no change needed (field is optional)

---

## Risks and ambiguities

1. **LLM response format variations.** OpenAI-compatible providers may have subtle format differences (e.g., some return `finish_reason: "function_call"` instead of `"tool_calls"` for older models). Mitigation: normalize aggressively, treat unknown finish_reason as "end_turn", log a warning.

2. **Cost estimation accuracy.** The harness estimates cost from token counts + pricing table. Real costs may differ (cached prompt tokens, batch discounts). Mitigation: the cost_update events are informational; budget enforcement in the provisioning orchestrator uses the same estimates, which is acceptable for v1.

3. **Summarization quality.** The fast-tier model may produce low-quality summaries that lose critical context. Mitigation: preserve the last 6 messages (3 turns) verbatim. The summary covers older history only. If summarization fails, skip it and let the context window overflow trigger a hard stop.

4. **Race condition between startSession and setSessionToolRegistry.** The provisioning orchestrator must call `setSessionToolRegistry` before `startSession`. If the order is wrong, the adapter has no registry. Mitigation: `startSession` checks for registry presence and throws if absent. The provisioning orchestrator is single-threaded per session — the order is deterministic.

---

## Ordered task list

### Task 1: LLM types (`llm-types.ts`)
- **Files:** `packages/server/src/harness/llm-types.ts` (new)
- **What:** Define `LlmRole`, `LlmTextBlock`, `LlmToolUseBlock`, `LlmToolResultBlock`, `LlmContentBlock`, `LlmMessage`, `LlmResponse`, `LlmToolDef`
- **Test:** Type check only — `npm run check`
- **Dependencies:** None

### Task 2: Context window management (`context-window.ts`)
- **Files:** `packages/server/src/harness/context-window.ts` (new), `packages/server/src/harness/__tests__/context-window.test.ts` (new)
- **What:** `MODEL_CONTEXT_WINDOWS` lookup, `contextWindowForModel()`, `isAboveThreshold()`
- **Test:** Unit tests: known model returns correct window, unknown model returns default, threshold check at 79%/80%/81%
- **Dependencies:** None

### Task 3: LLM client (`llm-client.ts`)
- **Files:** `packages/server/src/harness/llm-client.ts` (new), `packages/server/src/harness/__tests__/llm-client.test.ts` (new)
- **What:** `callLlm()` function with Anthropic and OpenAI-compatible format handling. Internal helper functions for request formatting and response parsing.
- **Test:** Unit tests with mocked `fetch`:
  - Anthropic: correct URL, headers, body shape, response parsing
  - OpenAI-compatible: correct URL, headers, body shape, JSON argument parsing
  - OpenRouter: correct URL with extra headers
  - Error handling: non-2xx status, malformed response, network error
- **Dependencies:** Task 1 (LLM types)

### Task 4: SessionConfig extension
- **Files:** `packages/shared/src/harness/harness-adapter.ts` (modify)
- **What:** Add `resolvedFastModel?: ResolvedModel` to `SessionConfig`
- **Test:** Type check only — existing tests pass unchanged
- **Dependencies:** None

### Task 5: BuiltinHarnessAdapter core
- **Files:** `packages/server/src/harness/builtin-harness-adapter.ts` (new), `packages/server/src/harness/__tests__/builtin-harness-adapter.test.ts` (new)
- **What:** Class implementing HarnessAdapter. `startSession`, `streamEvents`, `stopSession`, `getCapabilities`, `setSessionToolRegistry`. The main agent loop with planning turn, execute loop, reflection checkpoints, context management, and max-iterations guard.
- **Test:** Unit tests with mock LLM (mock `callLlm`) and mock `ToolRegistry`:
  - AC-1: implements interface, getCapabilities returns correct shape
  - AC-2: structured loop phases
  - AC-4: tool call execution and result formatting
  - AC-7: event streaming (all event types)
  - AC-9: planning turn writes session notes
  - AC-10: reflection checkpoint injection
  - AC-11: pre-compaction trigger and summarization
  - AC-12: tier switching for summarization
  - AC-13: max-iterations guard
  - AC-14: sliding window summarization
- **Dependencies:** Tasks 1, 2, 3, 4

### Task 6: Adapter pool registration
- **Files:** `packages/server/src/harness/adapter-pool.ts` (modify), `packages/server/src/harness/__tests__/adapter-pool.test.ts` (modify if exists, else included in builtin test)
- **What:** Extend `createLocalAdapterPool()` to register the built-in harness adapter alongside the Claude Agent SDK adapter.
- **Test:** Unit test: AC-8 — pool has "builtin" entry with correct meta.
- **Dependencies:** Task 5

### Task 7: Provisioning orchestrator integration
- **Files:** `packages/server/src/services/session-provisioning.ts` (modify), `packages/server/src/routes/sessions-routes.ts` (modify)
- **What:**
  - sessions-routes: resolve fast tier alongside primary tier, pass `resolvedFastModel` in params
  - session-provisioning: after registry build (Phase 8), if adapter type is "builtin", call `setSessionToolRegistry`. In Phase 10, skip `registry.invoke()` for tool_call events when adapter type is "builtin".
- **Test:** AC-15 — integration test: provision a session targeting the built-in harness, assert no double tool execution.
- **Dependencies:** Tasks 5, 6

### Task 8: Final verification
- **What:** `npm run check && npm run lint && npm run test`
- **Dependencies:** All previous tasks
