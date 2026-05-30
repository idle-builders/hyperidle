/**
 * L17 RED — Web component Money rendering tests.
 *
 * AC20: ArtifactCostChip renders money via formatMoney (WireMoney input)
 * AC23: Rail renders with WireMoney CostInfo — shows "$" in rendered output
 *
 * These tests will FAIL until Task 5 implementation ships.
 */

import { ArtifactCostChip } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetItem, BlockerItem, CostInfo } from "../shell/Rail";
import { Rail } from "../shell/Rail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderInRouter(ui: ReactElement): ReturnType<typeof render> {
	return render(<MemoryRouter>{ui}</MemoryRouter>);
}

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

// ── AC23: Rail renders with WireMoney CostInfo ─────────────────────────────

describe("Rail renders with WireMoney CostInfo (AC23)", () => {
	// M3 C2: BetItem.product removed, BetItem.progress added
	const sampleBets: BetItem[] = [
		{ id: "bet-1", title: "Launch MVP", progress: { done: 2, total: 4 }, status: "active" },
	];

	const sampleBlockers: BlockerItem[] = [];

	// After L17, CostInfo uses WireMoney fields
	const wireMoneyCost: CostInfo = {
		todaySpend: { minor: 1240, currency: "USD" }, // was "$12.40" string
		todayCap: { minor: 5000, currency: "USD" }, // was "$50.00" string
		weekSpend: { minor: 8420, currency: "USD" }, // was "$84.20" string
		weekCap: { minor: 35000, currency: "USD" }, // was "$350.00" string
		weekTokens: 42300,
	};

	it("renders formatted money '$12.40' from WireMoney {minor:1240,currency:'USD'}", () => {
		renderInRouter(
			<Rail
				expanded={true}
				onToggleExpand={vi.fn()}
				bets={sampleBets}
				blockers={sampleBlockers}
				cost={wireMoneyCost}
			/>,
		);
		expect(screen.getByText("$12.40")).toBeInTheDocument();
	});

	it("renders '$50.00' cap from WireMoney todayCap", () => {
		renderInRouter(
			<Rail
				expanded={true}
				onToggleExpand={vi.fn()}
				bets={sampleBets}
				blockers={sampleBlockers}
				cost={wireMoneyCost}
			/>,
		);
		expect(screen.getByText("$50.00")).toBeInTheDocument();
	});

	it("renders '$84.20' week spend from WireMoney weekSpend", () => {
		renderInRouter(
			<Rail
				expanded={true}
				onToggleExpand={vi.fn()}
				bets={sampleBets}
				blockers={sampleBlockers}
				cost={wireMoneyCost}
			/>,
		);
		expect(screen.getByText("$84.20")).toBeInTheDocument();
	});

	it("renders token count '42.3k' from weekTokens", () => {
		renderInRouter(
			<Rail
				expanded={true}
				onToggleExpand={vi.fn()}
				bets={sampleBets}
				blockers={sampleBlockers}
				cost={wireMoneyCost}
			/>,
		);
		expect(screen.getByText("42.3k")).toBeInTheDocument();
	});

	it("does NOT render raw number strings like '1240' for money amounts", () => {
		renderInRouter(
			<Rail
				expanded={true}
				onToggleExpand={vi.fn()}
				bets={sampleBets}
				blockers={sampleBlockers}
				cost={wireMoneyCost}
			/>,
		);
		// Raw minor unit number must not appear verbatim
		expect(screen.queryByText("1240")).not.toBeInTheDocument();
	});
});
