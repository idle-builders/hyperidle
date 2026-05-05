/**
 * L13 — WorkPortfolio test extension: product card click navigates to /work/product/:id.
 *
 * AC coverage:
 * - 14. Click on a product card navigates to /work/product/:id (productId from fixture).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { WorkPortfolio } from "../pages/WorkPortfolio";

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
