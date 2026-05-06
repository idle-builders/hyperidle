/** Harness adapter interface — the boundary between meta-layer and agent runtime (D1). */

import type { TokenUsage, WireMoney } from "../types/money.js";
import type { ModelTier } from "../types.js";
import type { HarnessEvent } from "./harness-events.js";

export interface SessionConfig {
	readonly workspacePath: string;
	readonly soulPromptPath: string;
	readonly modelTier: ModelTier;
	readonly tools: readonly string[];
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
}

export interface HarnessAdapter {
	startSession(config: SessionConfig): Promise<SessionHandle>;
	streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent>;
	stopSession(handle: SessionHandle): Promise<SessionResult>;
	getCapabilities(): HarnessCapabilities;
}
