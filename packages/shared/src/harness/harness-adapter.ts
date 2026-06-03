/** Harness adapter interface — the boundary between meta-layer and agent runtime (D1). */

import type { ResolvedModel } from "../model-gateway.js";
import type { TokenUsage, WireMoney } from "../types/money.js";
import type { ModelTier } from "../types.js";
import type { HarnessEvent } from "./harness-events.js";

export interface SessionConfig {
	readonly workspacePath: string;
	/** @deprecated Use composedPrompt instead. Retained for path validation. */
	readonly soulPromptPath: string;
	/** X1: fully composed prompt text, written as CLAUDE.md in the workspace. */
	readonly composedPrompt: string;
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
}

export interface HarnessAdapter {
	startSession(config: SessionConfig): Promise<SessionHandle>;
	streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent>;
	stopSession(handle: SessionHandle): Promise<SessionResult>;
	getCapabilities(): HarnessCapabilities;
}
