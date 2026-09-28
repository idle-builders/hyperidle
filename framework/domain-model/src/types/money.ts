import type { ModelTier } from "../types.js";

export type { ModelTier };

/** Token counts for a single model tier. */
export interface TierTokenCount {
	readonly prompt: number;
	readonly completion: number;
	readonly cachedPrompt?: number;
}

/** Per-tier token usage breakdown for a session. */
export interface TokenUsage {
	readonly byTier: Partial<Record<ModelTier, TierTokenCount>>;
}
