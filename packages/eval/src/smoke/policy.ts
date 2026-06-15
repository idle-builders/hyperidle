/**
 * AH5: Smoke lane model-selection policy constants.
 *
 * @lore AH5: Gates are on COMPLETION PRICE ONLY. The spec's "combined prompt+completion
 * price under $0.50/1M" wording is overridden by its own concrete number ($0.50/1M
 * completion). Completion dominates cost for the lane's short prescriptive prompts.
 *
 * @lore AH5: Per-provider `tools` gate uses the /endpoints API, not the model-level
 * `supported_parameters`. The model-level field is a UNION across all providers and is
 * NOT authoritative for per-provider tool support.
 *
 * @lore AH5: `minCreatedUnixSec` = 2026-01-01T00:00:00Z = 1767225600. Models created
 * before this threshold are classified as pre-2026-generation and disqualified.
 */

/** Policy governing which OpenRouter models qualify for the AH5 smoke lane. */
export interface SmokeModelPolicy {
	/** Models created on/after this unix-seconds cutoff qualify as "2026-generation". */
	readonly minCreatedUnixSec: number;
	/**
	 * Max completion price, USD per 1M tokens. Gate on completion price only.
	 * OpenRouter pricing.completion is a per-token USD string; multiply × 1e6 for per-1M.
	 */
	readonly maxCompletionPricePerMillion: number;
	/** Min per-provider uptime_last_30m (0..1). */
	readonly minUptimeLast30m: number;
	/** Min count of tool-capable providers (per-provider tools gate) above the uptime floor. */
	readonly minToolProviders: number;
}

/**
 * Default smoke policy.
 *
 * - 2026-gen cutoff: 2026-01-01T00:00:00Z = 1767225600
 * - Price ceiling: $0.50 per 1M completion tokens
 * - Uptime floor: 99%
 * - Min tool-capable providers: 2 (redundancy gate)
 */
export const DEFAULT_SMOKE_POLICY: SmokeModelPolicy = {
	minCreatedUnixSec: 1_767_225_600,
	maxCompletionPricePerMillion: 0.5,
	minUptimeLast30m: 0.99,
	minToolProviders: 2,
} as const;
