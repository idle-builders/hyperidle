/** Harness adapter interface — the boundary between meta-layer and agent runtime (D1). */

import type { ModelTier, ResolvedModel, Reversibility, TokenUsage } from "@hyperidle/domain-model";
import type {
	HarnessAuthActionDescriptor,
	HarnessDiscoveryStatus,
	HarnessModelDescriptor,
	ReturnEnforcementChannel,
} from "@hyperidle/harness-capability";
import type { HarnessEvent } from "./harness-events.js";

/**
 * AL7 trust-first — Session workflow for the route-to-review gate.
 *
 * Injected into `SessionConfig` at provision time. The workflow router in
 * `buildToolRegistry.invoke` reads this to classify reversibility and decide
 * whether to route an irreversible call to review or permit the approved op.
 *
 * session-1 (open-work): routeToReview=["irreversible"], sessionRole="open-work"
 * session-2 (grant-bearing): routeToReview=["irreversible"], sessionRole="grant-bearing",
 *   approvedCall carries the approved op for the CAS-consume.
 *
 * @lore AL7 D1: the workflow is collaboration plumbing, not a security floor.
 * ConversationMessage is NOT widened — no message-seed path.
 */
export interface SessionWorkflow {
	/** Reversibility classes routed to review at init (session 1: ["irreversible"]). */
	readonly routeToReview: readonly Reversibility[];
	readonly sessionRole: "open-work" | "grant-bearing";
	/**
	 * When grant-bearing, the approved op the agent works under (and may be arg-pinned
	 * where a harness expresses arg-level scope).
	 */
	readonly approvedCall?: {
		readonly toolId: string;
		readonly args: Record<string, unknown>; // recorded approved args (used by the optional arg-pin)
		readonly argPinned: boolean; // true ⇒ pin to these exact args where arg-level scope exists
		readonly identityHash?: string; // optional metadata for the arg-pin; NOT a guard
	};
}

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
	readonly modelTier: ModelTier;
	readonly tools: readonly string[];
	/**
	 * X4: Resolved model configuration from the gateway.
	 * When present, adapters use this instead of looking up by modelTier.
	 * Optional for backward compatibility during migration.
	 */
	readonly resolvedModel?: ResolvedModel;
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
	 * their harness's MCP client connection. Optional because:
	 * - Bridge creation is best-effort (fails gracefully)
	 * - BuiltinHarnessAdapter calls tool registry directly (no MCP needed)
	 */
	readonly mcpConnectionInfo?: McpConnectionInfo;
	/**
	 * AH3 §1.4: Message history from a session's calling-thread transcript.
	 * When present, the builtin adapter runs a single chat completion seeded with
	 * these messages instead of the task-planning loop. The caller's triggering
	 * message is always the last entry. Absent for task sessions (planning loop).
	 * Generic — set for any kind that bakes a `transcript` (AU27 Increment 4),
	 * not assistant-only.
	 *
	 * @lore AH3 H3: This field is the mechanism that delivers "what the caller
	 * typed" to the model. Without it, the adapter starts with messages:[] and
	 * responds to PLANNING_PROMPT, never the caller's actual question.
	 */
	readonly messages?: readonly ConversationMessage[];
	/**
	 * Per-session return-hook configuration.
	 * SDK/builtin closures + process wrapper read this to reach the enforcement
	 * registry and bridge callback. settings-* adapters use bridgeToken/mcpUrl
	 * when writing their hook config files (handled by provisionReturnHook, not startSession).
	 * Optional for backward compatibility; omitted for non-task sessions.
	 */
	readonly returnHook?: ReturnHookConfig;
	/**
	 * AL7 trust-first: Session workflow for the route-to-review gate.
	 * When present, `buildToolRegistry.invoke` classifies reversibility and routes
	 * irreversible calls to review (session-1) or permits the approved op (session-2).
	 * Optional — absent for sessions that don't participate in the review workflow.
	 */
	readonly sessionWorkflow?: SessionWorkflow;
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
	 * Absent for non-CLI harnesses (builtin, SDK adapters).
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
}
