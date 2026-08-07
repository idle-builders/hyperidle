/**
 * L17 — Formatters for Money and token counts.
 *
 * @lore L17: formatMoney accepts both WireMoney (number minor) and Money
 * (bigint minor) so callers don't need to convert. The Intl.NumberFormat
 * with currency style produces locale-correct output and handles JPY's
 * zero-decimal-place convention automatically via the currency code.
 */

import type { CurrencyCode, Money, WireMoney } from "../types/money.js";
import { scaleForCurrency } from "../types/money.js";

/** Format a money value for display. Returns "--" for null/undefined. */
export function formatMoney(value: WireMoney | Money | null | undefined): string {
	if (value == null) return "--";
	if (!value.currency) return "--";

	const minor = typeof value.minor === "bigint" ? Number(value.minor) : (value.minor as number);
	const currency = value.currency as CurrencyCode;
	const scale = scaleForCurrency(currency);
	const major = minor / 10 ** scale;

	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: scale,
		maximumFractionDigits: scale,
	}).format(major);
}

/** Format a raw token count for display. Returns "--" for null/undefined. */
export function formatTokenCount(count: number | null | undefined): string {
	if (count == null) return "--";
	if (count === 0) return "0";
	if (count < 1000) return String(count);
	if (count < 1_000_000) {
		const k = count / 1000;
		return `${k.toFixed(1)}k`;
	}
	const m = count / 1_000_000;
	return `${m.toFixed(1)}M`;
}
