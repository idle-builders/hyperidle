/**
 * L17 — Money types for structured cost representation.
 *
 * @lore L17: Money uses bigint minor units internally to avoid floating-point
 * arithmetic errors. WireMoney uses number minor units for JSON transport
 * (JSON does not support bigint natively). The scale (decimal places) is
 * derived from the currency code via CURRENCY_SCALE — never stored on the type.
 */

import type { ModelTier } from "../types.js";

// ── Currency codes ────────────────────────────────────────────────────────────

export const CURRENCY_CODES = ["USD", "EUR", "GBP", "JPY"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/**
 * Decimal scale (number of minor-unit digits after the decimal point).
 * USD/EUR/GBP = 2 (cents), JPY = 0 (no sub-unit).
 */
export const CURRENCY_SCALE: Record<CurrencyCode, number> = {
	USD: 2,
	EUR: 2,
	GBP: 2,
	JPY: 0,
};

/** Returns the decimal scale for a given currency code. */
export function scaleForCurrency(currency: CurrencyCode): number {
	return CURRENCY_SCALE[currency];
}

// ── Money types ───────────────────────────────────────────────────────────────

/**
 * Canonical in-memory money representation.
 * Uses bigint for minor units to avoid floating-point rounding errors.
 */
export interface Money {
	readonly minor: bigint;
	readonly currency: CurrencyCode;
}

/**
 * Wire-safe money representation for JSON transport.
 * Uses number for minor units (JSON does not support bigint).
 */
export interface WireMoney {
	readonly minor: number;
	readonly currency: CurrencyCode;
}

// ── Token types ───────────────────────────────────────────────────────────────

// Re-export ModelTier so consumers can import it from money.ts
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

// ── Money helpers ─────────────────────────────────────────────────────────────

/** Create a zero-value Money for the given currency. */
export function zeroMoney(currency: CurrencyCode): Money {
	return { minor: 0n, currency };
}

/** Convert a WireMoney (JSON-safe number) to canonical Money (bigint). */
export function moneyFromWire(wire: WireMoney): Money {
	return { minor: BigInt(wire.minor), currency: wire.currency };
}

/** Convert canonical Money (bigint) to WireMoney (JSON-safe number). */
export function moneyToWire(money: Money): WireMoney {
	return { minor: Number(money.minor), currency: money.currency };
}

/** Add two Money values. Throws if currencies differ. */
export function addMoney(a: Money, b: Money): Money {
	if (a.currency !== b.currency) {
		throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
	}
	return { minor: a.minor + b.minor, currency: a.currency };
}

/** Compare two Money values. Returns -1, 0, or 1. Throws if currencies differ. */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
	if (a.currency !== b.currency) {
		throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
	}
	if (a.minor < b.minor) return -1;
	if (a.minor > b.minor) return 1;
	return 0;
}

// ── Token helpers ─────────────────────────────────────────────────────────────

/** Sum prompt and completion tokens across all tiers. */
export function totalTokens(usage: TokenUsage): { prompt: number; completion: number } {
	let prompt = 0;
	let completion = 0;
	for (const tier of Object.values(usage.byTier)) {
		if (tier) {
			prompt += tier.prompt;
			completion += tier.completion;
		}
	}
	return { prompt, completion };
}

/**
 * Merge two TokenUsage objects by adding counts per tier.
 * Tiers present in only one usage are carried through unchanged.
 */
export function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
	const result: Partial<Record<ModelTier, TierTokenCount>> = { ...a.byTier };
	for (const [tierKey, bTier] of Object.entries(b.byTier)) {
		const tier = tierKey as ModelTier;
		if (!bTier) continue;
		const aTier = result[tier];
		if (aTier) {
			result[tier] = {
				prompt: aTier.prompt + bTier.prompt,
				completion: aTier.completion + bTier.completion,
				...(aTier.cachedPrompt !== undefined || bTier.cachedPrompt !== undefined
					? { cachedPrompt: (aTier.cachedPrompt ?? 0) + (bTier.cachedPrompt ?? 0) }
					: {}),
			};
		} else {
			result[tier] = bTier;
		}
	}
	return { byTier: result };
}
