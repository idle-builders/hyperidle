/**
 * X6: Context window size lookup and threshold checking for the built-in harness.
 */

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
export function contextWindowForModel(_model: string): number {
	throw new Error("not implemented");
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
export function isAboveThreshold(
	_latestInputTokens: number,
	_contextWindow: number,
	_threshold: number,
): boolean {
	throw new Error("not implemented");
}
