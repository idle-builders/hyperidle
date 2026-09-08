/** Harness adapter interface — the boundary between meta-layer and agent runtime (D1). */

import type { ModelTier, TokenUsage } from "@hyperidle/domain-model";
import type {
	HarnessAuthActionDescriptor,
	HarnessDiscoveryStatus,
	HarnessModelDescriptor,
	ReturnEnforcementChannel,
} from "@hyperidle/harness-capability";
import type { HarnessEvent } from "./harness-events.js";

/** X5: MCP bridge connection coordinates for a session. */
export interface McpConnectionInfo {
	readonly url: string; // Full URL: "http://localhost:3001/api/mcp/<token>"
	readonly token: string; // 64-char hex session token
}

/**
 * AH3 §1.4: A single message from a session's calling-thread transcript.
 * Used to deliver the caller's message (and prior context) to the adapter so
 * the model answers the actual question, not a generic task-planning prompt.
 * Generic — any kind that bakes a `transcript` gets this, not assistant-only.
 *
 * @lore AH3 H3: The core fix for "the caller's message never reaches the model."
 * SessionConfig previously had no messages field; the builtin adapter started
 * every session with an empty message list and injected PLANNING_PROMPT. By
 * seeding messages from the thread transcript and branching on their presence,
 * the adapter runs a single chat completion rather than the task-planning loop.
 */
export interface ConversationMessage {
	readonly role: "user" | "assistant";
	readonly content: string;
}

export interface SessionConfig {
	/**
	 * AF7 §3: The provisioning-assigned session id. This is the isolation
	 * contract — adapters key their per-session state on this exact id rather
	 * than minting their own. Only the builtin adapter's correctness depends on
	 * it (it pre-registers a tool registry under this id before startSession);
	 * other adapters may keep their handles internal and ignore it.
	 */
	readonly sessionId: string;
	/**
	 * Absolute path to the provisioned sandbox directory.
	 * @lore AK1: Renamed per AK1 harness-vocab plan. The cwd VALUE
	 * inside the sandbox is still /workspace; only this field NAME changes.
	 */
	readonly sandboxPath: string;
	/**
	 * X1: Fully assembled context prompt text, written as AGENTS.md + CLAUDE.md in the sandbox.
	 * @lore AK1: Renamed from composedPrompt (harness-vocab rename). Same content,
	 * new name: "assembled prompt" replaces "composed prompt".
	 */
	readonly assembledPrompt: string;
	/**
	 * What the agent is being asked to do — the session's opening user turn.
	 *
	 * Distinct from `assembledPrompt`, which is CONTEXT and goes to AGENTS.md:
	 * who the agent is, what it knows, what tools it has. This is the ask. For a
	 * task session it is the task, because when a task is assigned to an agent the
	 * task is basically all there is to say.
	 *
	 * @lore BA10: the adapter used to build this itself as
	 * `assembledPrompt.slice(0, 200)` with newlines flattened. A real agent read
	 * the result and replied "your initial message appears to have been cut off" —
	 * it had been, at 200 characters. Context is not an instruction, and an
	 * instruction must arrive whole.
	 */
	readonly instruction?: string;
	readonly modelTier: ModelTier;
	readonly tools: readonly string[];
	/**
	 * The model this agent was configured to run on, in the harness's own
	 * vocabulary — `haiku`, `gpt-5.6-sol`, `composer-2.5`,
	 * `openrouter/z-ai/glm-4.7-flash`. Set from the agent's own configuration,
	 * with no credential resolved to produce it.
	 *
	 * Absent means the person chose nothing, and the harness runs on its own
	 * default. That is a stated outcome, not the accident of an empty string.
	 *
	 * Carries only the model name — no provider, no credential.
	 * an API key and a base URL because the built-in harness calls a model API
	 * itself. A spawned CLI authenticates on its own and needs none of that — it
	 * needs the name to put after `--model`, which is this.
	 */
	readonly selectedModel?: string;
	// @lore A `resolvedModel` sat here — provider, model, apiKey and baseUrl, as
	// answered by the model gateway. Only the built-in adapter ever made the call
	// it described. A CLI harness authenticates itself and runs `selectedModel`,
	// so the gateway, its credentials and this field are all gone.
	/**
	 * The harness options this agent's model runs with, set once when the agent
	 * was configured rather than chosen per message.
	 *
	 * Sparse: only a value moved away from the harness's own default is present,
	 * so an absent key means "whatever the harness does". Absent or empty means
	 * the adapter builds exactly the invocation it built before this existed —
	 * that equivalence is the contract, not a convention.
	 */
	readonly modelOptions?: Readonly<Record<string, string | number | boolean>>;
	/**
	 * X5: MCP bridge connection info for this session.
	 * When present, adapters that support MCP can use this to configure
	 * their harness's MCP client connection. Optional because bridge creation is
	 * best-effort (it fails gracefully).
	 */
	readonly mcpConnectionInfo?: McpConnectionInfo;
	// @lore A `messages` field carried the calling thread's transcript here, and
	// the built-in adapter was its only reader: their presence is what selected its
	// chat completion over its task-planning loop. A CLI harness never read it —
	// it takes the same transcript from the `## Conversation` section of the
	// assembled prompt, which every harness reads out of AGENTS.md/CLAUDE.md. The
	// field went with the adapter that read it; the prompt section is now the
	// single delivery.
	/**
	 * Per-session return-hook configuration.
	 * The process wrapper reads this to reach the enforcement registry and bridge
	 * callback. settings-* adapters use bridgeToken/mcpUrl
	 * when writing their hook config files (handled by provisionReturnHook, not startSession).
	 * Optional for backward compatibility; omitted for non-task sessions.
	 */
	readonly returnHook?: ReturnHookConfig;
	/**
	 * AL7 delta: Per-session MCP token env var for CLI harnesses that require the
	 * token via an environment variable rather than inline in the config file.
	 *
	 * codex: { HYPERIDLE_MCP_TOKEN: "<token>" } — injected OUTSIDE the envAllowlist
	 * (per-session-generated, not forwarded from process.env; mirrors CODEX_HOME).
	 * opencode: undefined (token is inline in opencode.json headers.Authorization).
	 *
	 * @lore AL7 N6: must be inject-outside-allowlist (non-optional if set).
	 * The allowlist forwards from process.env, but the MCP token is per-session-generated
	 * and NOT in process.env. The codex CODEX_HOME injection pattern is the precedent.
	 */
	readonly mcpTokenEnv?: Readonly<Record<string, string>>;
	/**
	 * AU27 Increment 3 (Decision 3) — the session's specific required return
	 * subset, when it has one (structural rule computed by `run-orchestration`
	 * — e.g. `["reply"]` for a session whose output belongs in a calling
	 * thread and has no task). Absent ⇒ the pre-Increment-3 default: any
	 * member of the closed return set satisfies. Read by the builtin
	 * adapter's synthetic gate (the registry's `createGate` closure predicate
	 * does not reach `runChatTurn`/`runExecuteTurn`'s own `session.returnSeen`
	 * tracking) and forwarded into `provisionReturnHook` for the CLI/MCP
	 * channels.
	 */
	readonly requiredReturnActions?: readonly string[];
}

export interface SessionHandle {
	readonly sessionId: string;
}

export interface SessionMetrics {
	readonly modelTurns?: number;
	readonly processStarts?: number;
	readonly toolCalls?: number;
	readonly completionEvents?: number;
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly cachedInputTokens?: number;
	readonly cacheCreationInputTokens?: number;
	readonly reasoningOutputTokens?: number;
	readonly durationMs?: number;
	readonly apiDurationMs?: number;
}

/**
 * L17: SessionResult returns structured token usage (TokenUsage with
 * per-tier breakdown) instead of a raw number.
 *
 * @lore L17: totalTokens: number is removed — callers must use
 * totalTokens(tokenUsage). This prevents the unit ambiguity that existed in
 * the pre-L17 interface.
 *
 * @lore AU21 (harness-telemetry narrowing): `cost: WireMoney` (and
 * `SessionMetrics.nativeCostUsd`) is REMOVED — founder ruling: "the session
 * itself can claim... token usage from the harness... just the token usage
 * and not the cost since very few harness can actually report cost."
 * Investigation confirmed the asymmetry: codex reports no cost at all;
 * claude/opencode report a native $ figure; the builtin adapter only
 * ESTIMATED cost from a hardcoded per-model rate table (never a harness
 * self-report). Token usage is the one signal every harness genuinely
 * reports. No replacement $ field — this is a narrowing, not a rename.
 */
export interface SessionResult {
	readonly outcome: "completed" | "crashed" | "stopped";
	readonly tokenUsage: TokenUsage;
	readonly metrics?: SessionMetrics;
}

/**
 * Per-session return-hook configuration.
 * Passed in SessionConfig so SDK/builtin closures + process wrapper can reach
 * the enforcement registry and bridge callback.
 */
export interface ReturnHookConfig {
	readonly bridgeToken: string; // bridge callback credential
	readonly mcpUrl: string; // ${mcpBaseUrl}/api/mcp/${token}
	readonly forceBudget: number; // MAX_FORCE_RETURNS
}

export interface HarnessCapabilities {
	readonly preCompactionTrigger: boolean;
	readonly subAgents: boolean;
	/**
	 * S2: model provider identifiers this adapter can run (e.g. ["anthropic"]).
	 * Used by AdapterPool to filter eligible adapters for a given session.
	 */
	readonly modelProviders: readonly string[];
	/**
	 * X5: Whether this adapter supports MCP for tool calling.
	 * When true, the provisioning orchestrator skips event-stream tool
	 * interception — the harness handles tools via MCP directly.
	 * When false, tool_call events in the stream are intercepted and
	 * dispatched to the tool registry by the provisioner.
	 */
	readonly mcpSupport: boolean;
	/**
	 * Per-harness return-enforcement provisioning channel.
	 * Non-optional — every adapter must declare its channel.
	 * provisionReturnHook dispatches on this to install the right enforcement.
	 *
	 * @lore The non-optional field is the "uniform across harnesses" forcing
	 * function. npm run check fails any adapter that doesn't declare this.
	 */
	readonly returnEnforcement: ReturnEnforcementChannel;
	readonly descriptorModels?: readonly HarnessModelDescriptor[];
	readonly authAction?: HarnessAuthActionDescriptor;
	readonly discovery?: HarnessDiscoveryStatus;
	readonly fileEditing?: boolean;
	readonly toolUse?: boolean;
	/**
	 * AL7 delta: Per-session MCP config dialect for CLI harnesses that need a
	 * config file written into the sandbox for the binary to discover the bridge.
	 * Absent for a harness that discovers the bridge some other way.
	 *
	 * "codex-toml"    — appends [mcp_servers.hyperidle] to .codex-home/config.toml.
	 * "opencode-json" — writes opencode.json to sandbox cwd.
	 */
	readonly cliMcpDialect?: "codex-toml" | "opencode-json" | "cursor-json";
}

/**
 * Descriptor for a registered adapter-pool entry.
 *
 * @lore AU19 Increment 4: reclassified from `packages/server/src/harness/
 * adapter-pool.ts` to `@hyperidle/harness-protocol` — `harness-registry`'s `AdapterPool`
 * (agent-execution) is the sole owner/constructor of these values, but
 * `packages/server`'s (pre-Layer-split) `services/harness-capability-read-model.ts`
 * (core-api-side read model) needs the TYPE to describe its own
 * `HarnessCapabilityReader` port without importing `@hyperidle/harness-registry`
 * (Mechanism B forbids a non-execution package reaching into an execution
 * Service). Same cross-boundary-type-lives-in-shared idiom as `HttpError`/
 * `CassetteMissError` (Increment 3h) and `HarnessCapabilityDescriptor` above.
 */
export interface AdapterMeta {
	readonly name: string;
	readonly kind: "local" | "remote";
	/** X3: Harness type for agent preference matching (e.g. "claude-code", "opencode"). */
	readonly type?: string;
	readonly modelProviders: readonly string[];
	readonly maxConcurrent: number;
}

/** Public view of a pool entry (used by GET /api/workers). */
export interface AdapterInfo {
	readonly id: string;
	readonly name: string;
	readonly kind: "local" | "remote";
	/** X3: Harness type for agent preference matching. */
	readonly type?: string;
	readonly modelProviders: readonly string[];
	readonly currentLoad: number;
	readonly maxConcurrent: number;
	readonly connectedSince: string;
	/** S4: true when the worker has sent a pause message — skipped by select(). */
	readonly paused: boolean;
}

/**
 * Configuration for resuming a previously started session.
 *
 * @lore BA2: Session resumption is per-harness. The native session id is what
 * each harness assigned (or we assigned, for claude) when the session first ran.
 * sandboxPath is required for claude and cursor-agent (their sessions are bound
 * to the directory they started in). selectedModel and mcpTokenEnv mirror the
 * fields used in SessionConfig that affect the resume invocation.
 */
export interface SessionResumeConfig {
	/** Absolute path to the sandbox where the original session ran. */
	readonly sandboxPath: string;
	/** Model tier for metrics tracking. */
	readonly modelTier: ModelTier;
	/** The model this agent runs; same shape as SessionConfig.selectedModel. */
	readonly selectedModel?: string;
	/** Per-session MCP token env vars; same shape as SessionConfig.mcpTokenEnv. */
	readonly mcpTokenEnv?: Readonly<Record<string, string>>;
}

export interface HarnessAdapter {
	startSession(config: SessionConfig): Promise<SessionHandle>;
	streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent>;
	stopSession(handle: SessionHandle): Promise<SessionResult>;
	getCapabilities(): HarnessCapabilities;

	/**
	 * Optional: Return the count of enforcement-registry blocks applied
	 * by this adapter's native hook or in-process enforcement during a given session.
	 * Used to compute `forceReturnCount` on `ProvisionSessionResult`.
	 *
	 * Returns the enforcement-registry block count (incremented when the provisioned
	 * hook/wrapper got forceMessage!==null), not a loop counter. Only adapters with
	 * in-process enforcement implement this; file-provisioned adapters use the
	 * enforcement registry directly via the bridge.
	 *
	 * @lore forceReturnCount comes entirely from the enforcement registry (read
	 * here for in-process adapters, read from registry.get(sessionId).forceCount
	 * for all others).
	 */
	getForceReturnCount?(sessionId: string): number;

	/**
	 * Optional: Return the harness's own native session id for a completed or
	 * in-progress session. Call after streamEvents has started (or completed)
	 * so the id has had a chance to arrive from the event stream.
	 *
	 * Returns undefined when the harness did not emit a session id (error before
	 * first event, or an adapter type that does not support resumption).
	 *
	 * @lore BA2: The native id is what makes resumption work. For claude we assign
	 * it via --session-id at start time (so it is available immediately). For
	 * codex/cursor-agent/opencode we extract it from the first relevant event in
	 * the stream. Either way, the caller reads it AFTER startSession returns and
	 * AFTER streaming has begun.
	 */
	getNativeSessionId?(handle: SessionHandle): string | undefined;

	/**
	 * Optional: Resume a previously ended session with a new user message.
	 * The harness replays the session's prior context and delivers the message
	 * as a fresh user turn. Returns a new handle whose events can be streamed.
	 *
	 * @lore BA2: Per-harness invocations (measured against real installed binaries):
	 *   claude:        claude -p <msg> --resume <uuid> [standard flags]
	 *   codex:         codex exec resume <thread-id> <msg> --json [--model <m>]
	 *   cursor-agent:  cursor-agent -p <msg> --print --output-format stream-json
	 *                  --model <m> --trust --approve-mcps --force --resume <chat-id>
	 *   opencode:      opencode run <msg> --dir <sandbox> --format json --pure
	 *                  --model <m> --session <id>
	 *
	 * @lore BA2 cursor-agent-silent-fail: cursor-agent exits 0 even on a wrong or
	 * missing session id, echoing back the requested id. The caller MUST verify
	 * from the resumed session's content that prior context survived — exit 0 and
	 * the reported id are not proof.
	 */
	resumeSession?(
		nativeSessionId: string,
		message: string,
		config: SessionResumeConfig,
	): Promise<SessionHandle>;
}
