/**
 * X6: Context window size lookup and threshold checking for the built-in harness.
 */

import { MODEL_CATALOG } from "@hyperidle/domain-model";

const DEFAULT_CONTEXT_WINDOW = 128_000;

/**
 * Get the context window size for a model string.
 * Derived from MODEL_CATALOG — no duplicate map to keep in sync.
 */
export function modelContextWindow(model: string): number {
	return MODEL_CATALOG.find((m) => m.id === model)?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}

/**
 * Check if token usage has crossed a threshold (fraction 0.0-1.0).
 * The correct signal for context window pressure is the most recent
 * call's inputTokens value — NOT a cumulative sum across calls.
 *
 * @lore X6 (critique CRITICAL-1): response.usage.inputTokens reflects the total
 * input tokens for *that specific request* (the full conversation sent), not a
 * delta. Comparing the latest call's inputTokens against the context window gives
 * the actual fill level. Accumulating across calls over-counts by a factor of N
 * (number of calls), triggering pre-compaction far too early.
 */
function isAboveThreshold(
	latestInputTokens: number,
	contextWindow: number,
	threshold: number,
): boolean {
	return latestInputTokens > contextWindow * threshold;
}

export { DEFAULT_CONTEXT_WINDOW, isAboveThreshold };
