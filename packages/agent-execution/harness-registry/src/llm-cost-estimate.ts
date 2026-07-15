/**
 * AH6: Shared LLM cost estimation — single rate source.
 *
 * Extracted from builtin-harness-adapter.ts so llm-cassette.ts can use the
 * same cost math without creating a circular import:
 *   builtin-harness-adapter → llm-client → llm-cassette → builtin-harness-adapter (CYCLE)
 *
 * Both builtin-harness-adapter.ts (trackUsage) and llm-cassette.ts (recordLlm
 * cost writer) import from here — one rate table, one formula.
 *
 * @lore AH6 CRITICAL-2: "Single rate source" from plan §3. The recorder uses
 * estimateCostUsd() to compute ah6-cost.json totals; the adapter uses it in
 * trackUsage() for cost_update events. If the rate table changes, both update.
 */

// AH2 catalog — must stay in sync with MODEL_CATALOG in @hyperidle/shared
// @lore AH2: See also MODEL_CONTEXT_WINDOWS in context-window.ts.
const COST_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
	"claude-opus-4-8": { input: 5, output: 25 },
	"claude-sonnet-4-6": { input: 3, output: 15 },
	"claude-haiku-4-5": { input: 1, output: 5 },
	"claude-fable-5": { input: 10, output: 50 },
};

const DEFAULT_COST = { input: 3, output: 15 };

/**
 * Estimate the cost in USD for a single LLM API call.
 * Falls back to DEFAULT_COST (3/15 per million) for unknown models (e.g. OpenRouter).
 *
 * @param inputTokens - prompt tokens consumed
 * @param outputTokens - completion tokens produced
 * @param model - the model id string (routing suffix like :nitro already stripped by caller)
 */
export function estimateCostUsd(inputTokens: number, outputTokens: number, model: string): number {
	const rates = COST_PER_MILLION_TOKENS[model] ?? DEFAULT_COST;
	return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}
