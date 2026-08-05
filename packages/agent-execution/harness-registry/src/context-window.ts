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
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
	// AH2 catalog (current model IDs)
	// @lore AH2: These must stay in sync with MODEL_CATALOG in @hyperidle/shared.
	// Re-key here whenever the catalog changes.
	"claude-opus-4-8": 1_000_000,
	"claude-sonnet-4-6": 1_000_000,
	"claude-haiku-4-5": 200_000,
	"claude-fable-5": 1_000_000,
	"qwen/qwen3.8-max": 1_000_000,
};

const DEFAULT_CONTEXT_WINDOW = 128_000;

/**
 * Get the context window size for a model string.
 */
export function modelContextWindow(model: string): number {
	return MODEL_CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;
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

export { DEFAULT_CONTEXT_WINDOW, isAboveThreshold, MODEL_CONTEXT_WINDOWS };
