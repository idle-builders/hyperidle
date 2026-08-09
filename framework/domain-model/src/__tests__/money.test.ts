/**
 * L17 RED — Money types + formatters contract tests.
 *
 * AC1: Money type with bigint minor, currency, helpers (addMoney, compareMoney, zeroMoney,
 *      moneyFromWire, moneyToWire)
 * AC2: WireMoney type for JSON transport
 * AC3: TokenUsage with per-tier breakdown
 * (AC9/AC10 are asserted in money-harness.test.ts. AC11/CostUpdateEvent no
 * longer exists — @lore AU21 harness-telemetry narrowing. AC4/AC5 covered
 * `formatMoney`/`formatTokenCount`, which had no importer anywhere outside
 * this file — the module was deleted rather than given a package to live in.)
 *
 * These tests will FAIL until Task 1 implementation ships.
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import type { CurrencyCode, Money, TierTokenCount, TokenUsage, WireMoney } from "../types/money.js";
import {
	addMoney,
	addTokenUsage,
	CURRENCY_CODES,
	CURRENCY_SCALE,
	compareMoney,
	moneyFromWire,
	moneyToWire,
	scaleForCurrency,
	totalTokens,
	zeroMoney,
} from "../types/money.js";

// ── AC1: Money helpers ────────────────────────────────────────────────────────

describe("scaleForCurrency (AC1 + critique C1 resolution)", () => {
	it("returns 2 for USD", () => {
		expect(scaleForCurrency("USD")).toBe(2);
	});

	it("returns 2 for EUR", () => {
		expect(scaleForCurrency("EUR")).toBe(2);
	});

	it("returns 2 for GBP", () => {
		expect(scaleForCurrency("GBP")).toBe(2);
	});

	it("returns 0 for JPY", () => {
		expect(scaleForCurrency("JPY")).toBe(0);
	});

	it("matches CURRENCY_SCALE constant", () => {
		for (const code of CURRENCY_CODES) {
			expect(scaleForCurrency(code)).toBe(CURRENCY_SCALE[code]);
		}
	});
});

describe("zeroMoney (AC1)", () => {
	it("returns Money with minor=0n and given currency", () => {
		const m = zeroMoney("USD");
		expect(m.minor).toBe(0n);
		expect(m.currency).toBe("USD");
	});

	it("works for all supported currencies", () => {
		for (const code of CURRENCY_CODES) {
			const m = zeroMoney(code);
			expect(m.minor).toBe(0n);
			expect(m.currency).toBe(code);
		}
	});
});

describe("moneyFromWire / moneyToWire (AC1)", () => {
	it("round-trips USD money", () => {
		const wire: WireMoney = { minor: 1240, currency: "USD" };
		const canonical = moneyFromWire(wire);
		const back = moneyToWire(canonical);
		expect(back.minor).toBe(1240);
		expect(back.currency).toBe("USD");
	});

	it("moneyFromWire produces bigint minor", () => {
		const m = moneyFromWire({ minor: 500, currency: "EUR" });
		expect(typeof m.minor).toBe("bigint");
		expect(m.minor).toBe(500n);
	});

	it("moneyToWire produces number minor (JSON-safe)", () => {
		const m: Money = { minor: 999n, currency: "GBP" };
		const wire = moneyToWire(m);
		expect(typeof wire.minor).toBe("number");
		expect(wire.minor).toBe(999);
	});
});

describe("addMoney (AC1)", () => {
	it("adds two USD amounts correctly", () => {
		const a: Money = { minor: 500n, currency: "USD" };
		const b: Money = { minor: 300n, currency: "USD" };
		const result = addMoney(a, b);
		expect(result.minor).toBe(800n);
		expect(result.currency).toBe("USD");
	});

	it("throws when currencies differ", () => {
		const a: Money = { minor: 500n, currency: "USD" };
		const b: Money = { minor: 300n, currency: "EUR" };
		expect(() => addMoney(a, b)).toThrow();
	});

	it("handles zero amounts", () => {
		const a = zeroMoney("USD");
		const b: Money = { minor: 100n, currency: "USD" };
		expect(addMoney(a, b).minor).toBe(100n);
	});
});

describe("compareMoney (AC1)", () => {
	it("returns -1 when a < b", () => {
		const a: Money = { minor: 100n, currency: "USD" };
		const b: Money = { minor: 200n, currency: "USD" };
		expect(compareMoney(a, b)).toBe(-1);
	});

	it("returns 0 when a === b", () => {
		const a: Money = { minor: 150n, currency: "USD" };
		const b: Money = { minor: 150n, currency: "USD" };
		expect(compareMoney(a, b)).toBe(0);
	});

	it("returns 1 when a > b", () => {
		const a: Money = { minor: 300n, currency: "USD" };
		const b: Money = { minor: 200n, currency: "USD" };
		expect(compareMoney(a, b)).toBe(1);
	});

	it("throws when currencies differ", () => {
		const a: Money = { minor: 100n, currency: "USD" };
		const b: Money = { minor: 100n, currency: "JPY" };
		expect(() => compareMoney(a, b)).toThrow();
	});
});

// ── AC2: WireMoney type contract ──────────────────────────────────────────────

describe("WireMoney type contract (AC2)", () => {
	it("WireMoney has number minor (JSON-safe)", () => {
		const wire: WireMoney = { minor: 1240, currency: "USD" };
		expect(typeof wire.minor).toBe("number");
	});

	it("WireMoney is JSON-serializable and round-trips correctly", () => {
		const wire: WireMoney = { minor: 1240, currency: "USD" };
		const json = JSON.stringify(wire);
		const parsed = JSON.parse(json) as WireMoney;
		expect(parsed.minor).toBe(1240);
		expect(parsed.currency).toBe("USD");
	});

	it("WireMoney type is structurally assignable to { minor: number, currency: string }", () => {
		expectTypeOf<WireMoney>().toMatchTypeOf<{ minor: number; currency: string }>();
	});
});

// ── AC3: TokenUsage type ──────────────────────────────────────────────────────

describe("TokenUsage type contract (AC3)", () => {
	it("TokenUsage.byTier accepts workhorse tier", () => {
		const usage: TokenUsage = {
			byTier: {
				workhorse: { prompt: 100, completion: 50 },
			},
		};
		expect(usage.byTier.workhorse?.prompt).toBe(100);
		expect(usage.byTier.workhorse?.completion).toBe(50);
	});

	it("TokenUsage.byTier accepts reasoning tier", () => {
		const usage: TokenUsage = {
			byTier: {
				reasoning: { prompt: 200, completion: 100 },
			},
		};
		expect(usage.byTier.reasoning?.prompt).toBe(200);
	});

	it("TokenUsage.byTier accepts fast tier", () => {
		const usage: TokenUsage = {
			byTier: {
				fast: { prompt: 50, completion: 25 },
			},
		};
		expect(usage.byTier.fast?.prompt).toBe(50);
	});

	it("TokenUsage.byTier is Partial (tiers are optional)", () => {
		const usage: TokenUsage = { byTier: {} };
		expect(usage.byTier.workhorse).toBeUndefined();
	});

	it("TierTokenCount has optional cachedPrompt", () => {
		const t: TierTokenCount = { prompt: 100, completion: 50, cachedPrompt: 20 };
		expect(t.cachedPrompt).toBe(20);
		const t2: TierTokenCount = { prompt: 100, completion: 50 };
		expect(t2.cachedPrompt).toBeUndefined();
	});

	it("TokenUsage byTier key type is ModelTier", () => {
		// Verify at compile-time that byTier is a Partial<Record<ModelTier, TierTokenCount>>.
		// A value-level check confirms the key set at runtime.
		const usage: TokenUsage = { byTier: { reasoning: { prompt: 1, completion: 2 } } };
		const keys = Object.keys(usage.byTier);
		expect(keys).toContain("reasoning");
	});
});

// ── Token helpers ─────────────────────────────────────────────────────────────

describe("totalTokens", () => {
	it("sums prompt and completion across all tiers", () => {
		const usage: TokenUsage = {
			byTier: {
				workhorse: { prompt: 100, completion: 50 },
				reasoning: { prompt: 200, completion: 80 },
			},
		};
		const result = totalTokens(usage);
		expect(result.prompt).toBe(300);
		expect(result.completion).toBe(130);
	});

	it("returns zeros for empty byTier", () => {
		const usage: TokenUsage = { byTier: {} };
		const result = totalTokens(usage);
		expect(result.prompt).toBe(0);
		expect(result.completion).toBe(0);
	});
});

describe("addTokenUsage", () => {
	it("merges token counts from two usages", () => {
		const a: TokenUsage = {
			byTier: {
				workhorse: { prompt: 100, completion: 50 },
			},
		};
		const b: TokenUsage = {
			byTier: {
				workhorse: { prompt: 200, completion: 75 },
			},
		};
		const result = addTokenUsage(a, b);
		expect(result.byTier.workhorse?.prompt).toBe(300);
		expect(result.byTier.workhorse?.completion).toBe(125);
	});

	it("combines different tiers from two usages", () => {
		const a: TokenUsage = {
			byTier: {
				workhorse: { prompt: 100, completion: 50 },
			},
		};
		const b: TokenUsage = {
			byTier: {
				reasoning: { prompt: 200, completion: 100 },
			},
		};
		const result = addTokenUsage(a, b);
		expect(result.byTier.workhorse?.prompt).toBe(100);
		expect(result.byTier.reasoning?.prompt).toBe(200);
	});
});

// ── CURRENCY_CODES constant ───────────────────────────────────────────────────

describe("CURRENCY_CODES constant", () => {
	it("contains exactly USD, EUR, GBP, JPY", () => {
		expect(CURRENCY_CODES).toEqual(["USD", "EUR", "GBP", "JPY"]);
	});

	it("CURRENCY_SCALE covers all codes", () => {
		for (const code of CURRENCY_CODES) {
			expect(CURRENCY_SCALE[code]).toBeDefined();
		}
	});
});

// ── Type-level checks ─────────────────────────────────────────────────────────

describe("Type-level: CurrencyCode", () => {
	it("accepts valid currency codes", () => {
		const code: CurrencyCode = "USD";
		expect(code).toBe("USD");
	});

	it("CurrencyCode is a union of the 4 supported currencies", () => {
		// Each valid code should be assignable to CurrencyCode
		const codes: CurrencyCode[] = ["USD", "EUR", "GBP", "JPY"];
		expect(codes).toHaveLength(4);
	});
});
