/** Harness adapter interface — the boundary between meta-layer and agent runtime (D1). */

import type { ResolvedModel } from "../model-gateway.js";
import type { TokenUsage, WireMoney } from "../types/money.js";
import type { ModelTier } from "../types.js";
import type {
	HarnessAccessMode,
	HarnessAuthActionDescriptor,
	HarnessDiscoveryStatus,
	HarnessModelDescriptor,
} from "./harness-capability-descriptor.js";
import type { HarnessEvent } from "./harness-events.js";

/** X5: MCP bridge connection coordinates for a session. */
export interface McpConnectionInfo {
	readonly url: string; // Full URL: "http://localhost:3001/api/mcp/<token>"
	readonly token: string; // 64-char hex session token
}

/**
 * AH3 §1.4: A single conversational turn carried from the thread transcript.
 * Used to deliver the user's message (and prior context) to the adapter so the
 * model answers the actual question, not a generic task-planning prompt.
 *
 * @lore AH3 H3: The core fix for "user's message never reaches the model."
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
	/** @deprecated Use assembledPrompt instead. Retained for path validation. */
	readonly systemPromptPath: string;
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
	 * X6: Resolved model for the "fast" tier, used by the built-in harness
	 * for mid-session tier switching (summarization, formatting).
	 * Optional — when absent, the harness uses the primary resolvedModel for all calls.
	 */
	readonly resolvedFastModel?: ResolvedModel;
	/**
	 * X5: MCP bridge connection info for this session.
	 * When present, adapters that support MCP can use this to configure
	 * their harness's MCP client connection. Optional because:
	 * - Bridge creation is best-effort (fails gracefully)
	 * - BuiltinHarnessAdapter calls tool registry directly (no MCP needed)
	 */
	readonly mcpConnectionInfo?: McpConnectionInfo;
	/**
	 * AH3 §1.4: Conversational message history from the thread transcript.
	 * When present, the builtin adapter runs a single chat completion seeded with
	 * these messages instead of the task-planning loop. The user's triggering
	 * message is always the last entry. Absent for task sessions (planning loop).
	 *
	 * @lore AH3 H3: This field is the mechanism that delivers "what the user
	 * typed" to the model. Without it, the adapter starts with messages:[] and
	 * responds to PLANNING_PROMPT, never the user's actual question.
	 */
	readonly messages?: readonly ConversationMessage[];
}

export interface SessionHandle {
	readonly sessionId: string;
}

/**
 * L17: SessionResult now returns structured cost (WireMoney) and token usage
 * (TokenUsage with per-tier breakdown) instead of raw numbers.
 *
 * @lore L17: totalCost: number and totalTokens: number are removed — callers
 * must use cost.minor and totalTokens(tokenUsage) respectively. This prevents
 * the unit ambiguity (was totalCost in dollars? cents? micros?) that existed
 * in the pre-L17 interface.
 */
export interface SessionResult {
	readonly outcome: "completed" | "crashed" | "stopped";
	readonly cost: WireMoney;
	readonly tokenUsage: TokenUsage;
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
	readonly descriptorModels?: readonly HarnessModelDescriptor[];
	readonly accessMode?: HarnessAccessMode;
	readonly authAction?: HarnessAuthActionDescriptor;
	readonly discovery?: HarnessDiscoveryStatus;
	readonly fileEditing?: boolean;
	readonly toolUse?: boolean;
}

export interface HarnessAdapter {
	startSession(config: SessionConfig): Promise<SessionHandle>;
	streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent>;
	stopSession(handle: SessionHandle): Promise<SessionResult>;
	getCapabilities(): HarnessCapabilities;
}
