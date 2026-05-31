/**
 * L17 RED — Web component Money rendering tests.
 *
 * AC20: ArtifactCostChip renders money via formatMoney (WireMoney input)
 *
 * @lore U6: Rail (AC23) was removed in U6 (Sidebar replaced IconRail+Rail).
 * The AC23 tests that tested Rail's WireMoney cost display have been removed
 * because the component no longer exists. Only ArtifactCostChip tests remain.
 */

import { ArtifactCostChip } from "@hyperidle/design-system";
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
