// L3 — formatter that collapses the precision-safe DB integer columns
// into the wire-shape display strings consumed by ArtifactCostChip.
// Source: plans/L3/architecture.md §3.3.
// L17 — updated to produce WireMoney + TokenUsage instead of display strings.

import type { ArtifactCostFromSession } from "../types/artifact.js";
import type { WireMoney } from "../types/money.js";

export interface ArtifactCostInput {
	// biome-ignore lint/style/useNamingConvention: DB column name; snake_case matches PostgreSQL schema
	readonly money_micros: number | null;
	// biome-ignore lint/style/useNamingConvention: DB column name; snake_case matches PostgreSQL schema
	readonly tokens_input: number | null;
	// biome-ignore lint/style/useNamingConvention: DB column name; snake_case matches PostgreSQL schema
	readonly tokens_output: number | null;
}

/**
 * Convert raw DB cost columns to the structured ArtifactCostFromSession shape.
 *
 * @lore L17: money_micros are converted to WireMoney with USD currency and
 * minor units = micros / 10000 (micros → cents: 1_000_000 micros = $1.00 = 100 cents).
 * Tokens are represented as a TokenUsage with a single "workhorse" tier since
 * the old schema didn't capture per-tier breakdown.
 */
export function formatArtifactCost(input: ArtifactCostInput): ArtifactCostFromSession {
	const money: WireMoney | null =
		input.money_micros === null
			? null
			: { minor: Math.round(input.money_micros / 10000), currency: "USD" };

	const tokensNull = input.tokens_input === null && input.tokens_output === null;
	const tokens = tokensNull
		? null
		: {
				byTier: {
					workhorse: {
						prompt: input.tokens_input ?? 0,
						completion: input.tokens_output ?? 0,
					},
				},
			};

	return { money, tokens };
}
