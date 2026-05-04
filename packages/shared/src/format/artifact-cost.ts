// L3 — formatter that collapses the precision-safe DB integer columns
// into the wire-shape display strings consumed by ArtifactCostChip.
// Source: plans/architecture/L3.md §3.3.

import type { ArtifactCostFromSession } from "../types/artifact.js";

export interface ArtifactCostInput {
	readonly money_micros: number | null;
	readonly tokens_input: number | null;
	readonly tokens_output: number | null;
}

function formatMoney(micros: number): string {
	const dollars = micros / 1_000_000;
	return `$${dollars.toFixed(2)}`;
}

function formatTokens(total: number): string {
	if (total < 1000) return String(total);
	const k = total / 1000;
	const rounded = Math.round(k * 10) / 10;
	return `${rounded}k`;
}

export function formatArtifactCost(input: ArtifactCostInput): ArtifactCostFromSession {
	const money = input.money_micros === null ? null : formatMoney(input.money_micros);
	const tokensNull = input.tokens_input === null && input.tokens_output === null;
	const tokens = tokensNull
		? null
		: formatTokens((input.tokens_input ?? 0) + (input.tokens_output ?? 0));
	return { money, tokens };
}
