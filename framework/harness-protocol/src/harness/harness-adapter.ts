/** Harness adapter interface — the boundary between meta-layer and agent runtime. */

import type { ModelTier, TokenUsage } from "@hyperidle/domain-model";
import type {
	HarnessAuthActionDescriptor,
	HarnessDiscoveryStatus,
	HarnessModelDescriptor,
	ReturnEnforcementChannel,
} from "@hyperidle/harness-capability";
import type { HarnessEvent } from "./harness-events.js";

/** MCP bridge connection coordinates for a session. */
export interface McpConnectionInfo {
	readonly url: string; // Full URL: "http://localhost:3001/api/mcp/<token>"
	readonly token: string; // 64-char hex session token
}

/**
 * A single message from a session's calling-thread transcript.
 * Delivers the caller's message (and prior context) to the adapter so the
 * model answers the actual question, not a generic task-planning prompt.
 * Generic — any kind that bakes a `transcript` gets this, not assistant-only.
 */
export interface ConversationMessage {
	readonly role: "user" | "assistant";
	readonly content: string;
}

export interface SessionConfig {
	/**
	 * The provisioning-assigned session id. This is the isolation
	 * contract — adapters key their per-session state on this exact id rather
	 * than minting their own. Only the builtin adapter's correctness depends on
	 * it (it pre-registers a tool registry under this id before startSession);
	 * other adapters may keep their handles internal and ignore it.
	 */
	readonly sessionId: string;
	/** Absolute path to the provisioned sandbox directory. */
	readonly sandboxPath: string;
	/** Fully assembled context prompt text, written as AGENTS.md + CLAUDE.md in the sandbox. */
	readonly assembledPrompt: string;
	/**
	 * What the agent is being asked to do — the session's opening user turn.
	 *
	 * Distinct from `assembledPrompt`, which is CONTEXT and goes to AGENTS.md:
	 * who the agent is, what it knows, what tools it has. This is the ask.
	 *
	 * @lore: instruction must arrive whole — context is not an instruction; a truncated instruction looks complete to the model
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
	 * MCP bridge connection info for this session.
	 * Optional because bridge creation is best-effort (it fails gracefully).
	 */
	readonly mcpConnectionInfo?: McpConnectionInfo;
	/**
	 * Per-session return-hook configuration.
	 * The process wrapper reads this to reach the enforcement registry and bridge
	 * callback. settings-* adapters use bridgeToken/mcpUrl
	 * when writing their hook config files (handled by provisionReturnHook, not startSession).
	 * Optional for backward compatibility; omitted for non-task sessions.
	 */
	readonly returnHook?: ReturnHookConfig;
	/**
	 * Per-session MCP token env var for CLI harnesses that require the
	 * token via an environment variable rather than inline in the config file.
	 *
	 * codex: { HYPERIDLE_MCP_TOKEN: "<token>" } — injected OUTSIDE the envAllowlist
	 * (per-session-generated, not forwarded from process.env; mirrors CODEX_HOME).
	 * opencode: undefined (token is inline in opencode.json headers.Authorization).
	 *
	 * @lore: must inject outside envAllowlist — MCP token is per-session-generated and NOT in process.env; forwarding from process.env silently misses it
	 */
	readonly mcpTokenEnv?: Readonly<Record<string, string>>;
	/**
	 * The session's required return subset, computed by `run-orchestration`.
	 * e.g. `["reply"]` for a session whose output belongs in a calling thread.
	 * Absent means any member of the closed return set satisfies.
	 * Forwarded into `provisionReturnHook` for CLI/MCP channels.
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
 * @lore: callers must use totalTokens(tokenUsage), not a raw number — prevents unit ambiguity; every harness reports token usage; cost is NOT included
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
	 * Model provider identifiers this adapter can run (e.g. ["anthropic"]).
	 * Used by AdapterPool to filter eligible adapters for a given session.
	 */
	readonly modelProviders: readonly string[];
	/**
	 * Whether this adapter supports MCP for tool calling.
	 * When true, the provisioner skips event-stream tool interception — the harness handles tools via MCP directly.
	 * When false, tool_call events are intercepted and dispatched to the tool registry.
	 */
	readonly mcpSupport: boolean;
	/**
	 * Per-harness return-enforcement provisioning channel.
	 * Non-optional — every adapter must declare its channel.
	 * provisionReturnHook dispatches on this to install the right enforcement.
	 *
	 * @lore: the non-optional field is the "uniform across harnesses" forcing function; npm run check fails any adapter that doesn't declare this
	 */
	readonly returnEnforcement: ReturnEnforcementChannel;
	readonly descriptorModels?: readonly HarnessModelDescriptor[];
	readonly authAction?: HarnessAuthActionDescriptor;
	readonly discovery?: HarnessDiscoveryStatus;
	readonly fileEditing?: boolean;
	readonly toolUse?: boolean;
	/**
	 * Per-session MCP config dialect for CLI harnesses that need a
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
 * @lore: type lives in harness-protocol (shared) — core-api-side read model needs it but cannot import @hyperidle/harness-registry (execution layer boundary)
 */
export interface AdapterMeta {
	readonly name: string;
	readonly kind: "local" | "remote";
	/** Harness type for agent preference matching (e.g. "claude-code", "opencode"). */
	readonly type?: string;
	readonly modelProviders: readonly string[];
	readonly maxConcurrent: number;
}

/** Public view of a pool entry (used by GET /api/workers). */
export interface AdapterInfo {
	readonly id: string;
	readonly name: string;
	readonly kind: "local" | "remote";
	/** Harness type for agent preference matching. */
	readonly type?: string;
	readonly modelProviders: readonly string[];
	readonly currentLoad: number;
	readonly maxConcurrent: number;
	readonly connectedSince: string;
	/** true when the worker has sent a pause message — skipped by select() */
	readonly paused: boolean;
}

/**
 * Configuration for resuming a previously started session.
 *
 * @lore: sandboxPath required for claude + cursor-agent — bound to start dir; selectedModel/mcpTokenEnv mirror SessionConfig fields affecting resume
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
	 * @lore: forceReturnCount comes entirely from the enforcement registry (here for in-process adapters, from registry.get(sessionId).forceCount for all others)
	 */
	getForceReturnCount?(sessionId: string): number;

	/**
	 * Optional: Return the harness's native session id.
	 * Call after streamEvents has started so the id has had a chance to arrive.
	 * Returns undefined when the harness did not emit a session id.
	 *
	 * @lore: claude assigns via --session-id at start; codex/cursor-agent/opencode extract from the first relevant stream event; read AFTER streaming begins
	 */
	getNativeSessionId?(handle: SessionHandle): string | undefined;

	/**
	 * Optional: Resume a previously ended session with a new user message.
	 * The harness replays the session's prior context and delivers the message
	 * as a fresh user turn.
	 *
	 * Per-harness invocations (measured against real installed binaries):
	 *   claude:        claude -p <msg> --resume <uuid> [standard flags]
	 *   codex:         codex exec resume <thread-id> <msg> --json [--model <m>]
	 *   cursor-agent:  cursor-agent -p <msg> --print --output-format stream-json
	 *                  --model <m> --trust --approve-mcps --force --resume <chat-id>
	 *   opencode:      opencode run <msg> --dir <sandbox> --format json --pure
	 *                  --model <m> --session <id>
	 *
	 * @lore: cursor-agent exits 0 even on wrong/missing session id, echoing back the id; caller must verify prior context survived — exit 0 is not proof
	 */
	resumeSession?(
		nativeSessionId: string,
		message: string,
		config: SessionResumeConfig,
	): Promise<SessionHandle>;
}
