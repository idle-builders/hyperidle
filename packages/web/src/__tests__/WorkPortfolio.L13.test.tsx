/**
 * L13 — WorkPortfolio test extension: product card click navigates to /work/product/:id.
 *
 * AC coverage:
 * - 14. Click on a product card navigates to /work/product/:id (productId from fixture).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { WorkPortfolio } from "../pages/WorkPortfolio";

// M3 G1: MOCK_PRODUCTS removed — mock useProducts for tests that need product cards.
// @lore U1: TeamListResponse uses `teams` array (renamed from `products`).
vi.mock("../hooks/useProducts", () => ({
	useProducts: vi.fn().mockReturnValue({
		data: {
			teams: [
				{
					id: "p-drill-1",
					name: "Drill-Down Product",
					status: "healthy",
					activeBets: 1,
					shipRate: "80%",
					leadAgentId: "ag-1",
					shipped: 3,
					progress: { done: 1, total: 2 },
				},
			],
		},
	}),
}));

function renderPortfolioWithRouter(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/work/portfolio"]}>
			<Routes>
				<Route path="/work/portfolio" element={<WorkPortfolio />} />
				<Route
					path="/work/product/:productId"
					element={<div data-testid="work-product-page">Product Page</div>}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkPortfolio — L13 drill-down", () => {
	it("14. click on a product card navigates to /work/product/:id", async () => {
		const user = userEvent.setup();
		renderPortfolioWithRouter();

		// The product cards are rendered with data-testid="product-card"
		const cards = screen.getAllByTestId("product-card");
		expect(cards.length).toBeGreaterThan(0);

		// Click the first card
		await user.click(cards[0]);

		await waitFor(() => {
			expect(screen.getByTestId("work-product-page")).toBeInTheDocument();
		});
	});
});
