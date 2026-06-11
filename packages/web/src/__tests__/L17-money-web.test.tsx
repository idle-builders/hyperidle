/**
 * L17 RED — Web component Money rendering tests.
 *
 * AC20: ArtifactCostChip renders money via formatMoney (WireMoney input)
 * AF10 AC5: formatMoney golden output tests (JPY zero-decimal, extended cases)
 *
 * @lore U6: Rail (AC23) was removed in U6 (Sidebar replaced IconRail+Rail).
 * @lore AD8a: historical — The AC23 tests that tested Rail's WireMoney cost display have been removed
 * because the component no longer exists. Only ArtifactCostChip tests remain.
 */

import { ArtifactCostChip } from "@hyperidle/design-system";
import { formatMoney } from "@hyperidle/shared";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── AC20: ArtifactCostChip with WireMoney input ──────────────────────────────

describe("ArtifactCostChip renders money via formatMoney (AC20)", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("renders '$12.40' for WireMoney {minor:1240, currency:'USD'}", () => {
		act(() => {
			root.render(
				createElement(ArtifactCostChip, {
					cost: {
						money: { minor: 1240, currency: "USD" },
						tokens: null,
					},
				}),
			);
		});
		expect(container.textContent).toContain("$12.40");
	});

	it("renders '$0.00' for WireMoney {minor:0, currency:'USD'}", () => {
		act(() => {
			root.render(
				createElement(ArtifactCostChip, {
					cost: {
						money: { minor: 0, currency: "USD" },
						tokens: null,
					},
				}),
			);
		});
		expect(container.textContent).toContain("$0.00");
	});

	it("renders '--' for null money", () => {
		act(() => {
			root.render(
				createElement(ArtifactCostChip, {
					cost: {
						money: null,
						tokens: null,
					},
				}),
			);
		});
		expect(container.textContent).toContain("—");
	});

	it("renders token count from TokenUsage (not a raw string)", () => {
		act(() => {
			root.render(
				createElement(ArtifactCostChip, {
					cost: {
						money: { minor: 420, currency: "USD" },
						tokens: {
							byTier: {
								workhorse: { prompt: 100, completion: 50 },
							},
						},
					},
					variant: "full",
				}),
			);
		});
		// Total tokens = 150 → "150"
		expect(container.textContent).toContain("150");
	});

	it("renders compact token summary (42.3k for 42300 total)", () => {
		act(() => {
			root.render(
				createElement(ArtifactCostChip, {
					cost: {
						money: null,
						tokens: {
							byTier: {
								workhorse: { prompt: 25000, completion: 17300 },
							},
						},
					},
					variant: "full",
				}),
			);
		});
		// Total = 42300 → "42.3k"
		expect(container.textContent).toContain("42.3k");
	});
});

// ── AF10 AC5: formatMoney golden output tests (T10) ───────────────────────────
//
// These tests prove the shared `formatMoney` function correctly handles
// JPY (zero-decimal currency) and other edge cases.
//
// The 7 UI surfaces (SessionActivityPanel:100, WorkTask:144/334, TaskSheet:342,
// WorkRoutine:353, WorkTeam:263/270) must route through formatMoney — not
// hardcode `$` / `/100` / `.toFixed(2)`. These golden tests establish the
// contract: any surface that hardcodes those patterns would produce incorrect
// output for JPY.
//
// FROZEN assertions (CC-008): the existing tests above (lines ~35, ~49, ~63)
// are frozen. These new tests add JPY and additional USD cases alongside them.

describe("AF10 AC5: formatMoney golden output tests (T10)", () => {
	// ── Protected frozen assertions (must not be removed) ──────────────────
	it("FROZEN: '$12.40' for {minor:1240,USD}", () => {
		expect(formatMoney({ minor: 1240, currency: "USD" })).toBe("$12.40");
	});

	it("FROZEN: '$0.00' for {minor:0,USD}", () => {
		expect(formatMoney({ minor: 0, currency: "USD" })).toBe("$0.00");
	});

	it("FROZEN: '--' for null money", () => {
		expect(formatMoney(null)).toBe("--");
	});

	// ── AF10 additions: JPY (zero-decimal) ──────────────────────────────────
	//
	// JPY has 0 decimal places (scaleForCurrency("JPY") = 0), so minor units
	// ARE major units. 1500 minor JPY = ¥1,500.
	//
	// A surface that hardcodes `/ 100` would output ¥15.00 (wrong).
	// A surface that hardcodes `$` would output $1,500 (wrong symbol).
	// formatMoney handles both correctly via Intl.NumberFormat.

	it("renders '¥1,500' for JPY {minor:1500} (zero-decimal: no division by 100)", () => {
		const result = formatMoney({ minor: 1500, currency: "JPY" });
		// Must contain yen symbol, not dollar sign
		expect(result).toContain("¥");
		expect(result).not.toContain("$");
		// Must not divide by 100 (1500 JPY, not 15 JPY)
		expect(result).toContain("1,500");
	});

	it("renders '¥0' for JPY {minor:0} (no .00 fraction digits for JPY)", () => {
		const result = formatMoney({ minor: 0, currency: "JPY" });
		expect(result).toContain("¥");
		// JPY has no decimal places — must not contain .00
		expect(result).not.toContain(".00");
	});

	it("renders '¥123' for JPY {minor:123}", () => {
		const result = formatMoney({ minor: 123, currency: "JPY" });
		expect(result).toContain("¥");
		expect(result).toContain("123");
	});

	// ── Additional USD cases ──────────────────────────────────────────────────

	it("renders '$1.00' for {minor:100,USD}", () => {
		expect(formatMoney({ minor: 100, currency: "USD" })).toBe("$1.00");
	});

	it("renders '--' for undefined", () => {
		expect(formatMoney(undefined)).toBe("--");
	});

	it("renders '--' for {minor:100, currency: ''} (empty currency)", () => {
		// An empty currency string has no scaleForCurrency entry → should return '--'
		expect(
			formatMoney({ minor: 100, currency: "" as import("@hyperidle/shared").CurrencyCode }),
		).toBe("--");
	});
});
