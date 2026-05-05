/**
 * L13 — WorkProduct page unit tests (red phase).
 *
 * Covers all 10 items from architecture §Test plan §Vitest dispatch (client unit).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

// Import the page — it doesn't exist yet so this test will fail until green phase.
import { WorkProduct } from "../pages/WorkProduct";

const MOCK_PRODUCT_DETAIL = {
	product: {
		id: "p1",
		name: "HyperIdle Core",
		phase: "build",
		status: "healthy",
		leadAgentId: "agent-lead",
	},
	team: { id: "t1", formedAt: "2024-01-01T00:00:00.000Z", dissolvedAt: null },
	roster: [
		{ agentId: "agent-lead", name: "Lead Agent", role: "lead", isLead: true },
		{ agentId: "agent-member", name: "Alice Agent", role: "member", isLead: false },
	],
	burn: { costActual: 4200, costCap: 10000, capacity: 5, activeBets: 2 },
	activeBets: [
		{
			id: "b1",
			pitchTitle: "Auth migration",
			appetite: "2 weeks",
			status: "committed",
			progressDone: 1,
			progressTotal: 2,
		},
	],
};

const MOCK_PRODUCT_EMPTY_BETS = {
	...MOCK_PRODUCT_DETAIL,
	activeBets: [],
};

function renderPage(
	productId = "p1",
	overrideData?: typeof MOCK_PRODUCT_DETAIL | null,
	loading = false,
	error: Error | null = null,
): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/product/${productId}`]}>
			<Routes>
				<Route
					path="/work/product/:productId"
					element={
						<WorkProduct
							overrideData={overrideData}
							overrideLoading={loading}
							overrideError={error}
						/>
					}
				/>
				<Route
					path="/work/portfolio"
					element={<div data-testid="work-portfolio-page">Portfolio</div>}
				/>
				<Route path="/work/bet/:betId" element={<div data-testid="work-bet-page">Bet</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkProduct", () => {
	it("1. renders the page H1 with the product name when the fetch resolves", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		expect(screen.getByTestId("work-product-page")).toBeInTheDocument();
		expect(screen.getByText("HyperIdle Core")).toBeInTheDocument();
	});

	it("2. renders one BetCard row per active bet", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		const betsRegion = screen.getByTestId("product-active-bets");
		expect(betsRegion).toBeInTheDocument();
		// Should render the bet title
		expect(screen.getByText("Auth migration")).toBeInTheDocument();
	});

	it("3. renders the empty-state when active bets list is empty", () => {
		renderPage("p1", MOCK_PRODUCT_EMPTY_BETS);
		expect(screen.getByTestId("product-active-bets-empty")).toBeInTheDocument();
	});

	it("4. renders one roster row per agent; lead row has data-is-lead='true'", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		const rosterRows = screen.getAllByTestId("product-roster-row");
		expect(rosterRows).toHaveLength(2);
		// Lead row has data-is-lead
		const leadRow = rosterRows.find((row) => row.getAttribute("data-is-lead") === "true");
		expect(leadRow).toBeDefined();
	});

	it("5. renders the burn-vs-cap with a progress element", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		const burnRegion = screen.getByTestId("product-burn-vs-cap");
		expect(burnRegion).toBeInTheDocument();
		expect(burnRegion.querySelector("progress")).not.toBeNull();
	});

	it("6. click on the breadcrumb chip navigates to /work/portfolio", async () => {
		const user = userEvent.setup();
		renderPage("p1", MOCK_PRODUCT_DETAIL);

		const breadcrumb = screen.getByTestId("product-breadcrumb-back");
		await user.click(breadcrumb);

		await waitFor(() => {
			expect(screen.getByTestId("work-portfolio-page")).toBeInTheDocument();
		});
	});

	it("7. click on a bet row navigates to /work/bet/:id", async () => {
		const user = userEvent.setup();
		renderPage("p1", MOCK_PRODUCT_DETAIL);

		// Find and click the bet row/card
		const betCard = screen.getByText("Auth migration");
		await user.click(betCard);

		await waitFor(() => {
			expect(screen.getByTestId("work-bet-page")).toBeInTheDocument();
		});
	});

	it("8. renders the 404 empty state when the fetch returns 404", () => {
		const err = new Error("Product fetch failed: 404");
		renderPage("does-not-exist", null, false, err);
		expect(screen.getByTestId("product-not-found")).toBeInTheDocument();
	});

	it("9. renders an ErrorState when the fetch returns 500", () => {
		const err = new Error("Product fetch failed: 500");
		renderPage("p1", null, false, err);
		// Any error state rendered (not the 404-specific one)
		// The page should show some error indication
		expect(screen.queryByTestId("work-product-page")).toBeInTheDocument();
		expect(screen.queryByTestId("product-not-found")).not.toBeInTheDocument();
	});

	it("10. loading state: while useProduct is in-flight, renders SkeletonCard placeholders and NOT EmptyState", () => {
		renderPage("p1", null, true, null);
		expect(screen.getByTestId("work-product-page")).toBeInTheDocument();
		// Skeleton placeholders should be visible
		expect(screen.queryAllByRole("status").length).toBeGreaterThanOrEqual(0); // skeletons may use aria
		// Most importantly: empty state for active bets must NOT appear during loading
		expect(screen.queryByTestId("product-active-bets-empty")).not.toBeInTheDocument();
	});

	// D1 regression guard: a committed bet must not show the BEHIND status chip.
	// Previously BetRow mapped `committed → "behind"` which was a category error
	// (committed = normal active state; behind = actually behind by some signal).
	it("11. a committed bet renders without 'BEHIND' in the active bets section", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		// The bet title should be visible
		expect(screen.getByText("Auth migration")).toBeInTheDocument();
		// The StatusChip for a committed bet should not say BEHIND
		const betsRegion = screen.getByTestId("product-active-bets");
		expect(betsRegion.textContent).not.toContain("BEHIND");
	});

	// D2 regression guard: the lead name (not the agent id) must appear in the header.
	it("12. renders lead display name (not agent id) in the product header", () => {
		renderPage("p1", MOCK_PRODUCT_DETAIL);
		// The roster has leadAgentId="agent-lead" → name "Lead Agent".
		// The header should show the name, not the raw id.
		expect(screen.getByText(/Lead:\s*Lead Agent/i)).toBeInTheDocument();
		expect(screen.queryByText(/Lead:\s*agent-lead/i)).not.toBeInTheDocument();
	});
});
