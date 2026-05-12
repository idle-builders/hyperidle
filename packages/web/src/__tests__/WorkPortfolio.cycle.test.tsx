/**
 * J5 — Portfolio cycle-management stripe below product cards.
 * Shows current cycle and days remaining.
 *
 * @lore M3 G1: MOCK_CYCLE removed. Cycle data is not yet wired from the server.
 * Tests updated to reflect that the cycle-stripe is no longer rendered with mock data.
 * The per-product-card tests still exercise the product card shape using injected
 * fixture data via the products prop.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

// M3 G1: mock useProducts to avoid MOCK_PRODUCTS fallback.
vi.mock("../hooks/useProducts", () => ({
	useProducts: vi.fn().mockReturnValue({
		data: null,
	}),
}));

const FIXTURE_PRODUCTS = [
	{
		id: "p1",
		name: "HyperIdle Core",
		status: "healthy" as const,
		activeBets: 4,
		shipRate: "78%",
		lead: { name: "CEO Agent", initials: "CE" },
		shipped: 12,
		progress: { done: 3, total: 5 },
	},
];

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkPortfolio products={FIXTURE_PRODUCTS} />
		</MemoryRouter>,
	);
}

describe("WorkPortfolio — cycle stripe (J5)", () => {
	it("does NOT render a cycle-stripe element (M3 G1: MOCK_CYCLE removed)", () => {
		renderPage();
		// After M3, the cycle stripe is removed — no testid present.
		expect(screen.queryByTestId("cycle-stripe")).not.toBeInTheDocument();
	});

	it("each product card shows lead avatar, active bets, shipped count", () => {
		renderPage();
		const cards = screen.getAllByTestId("product-card");
		for (const card of cards) {
			// Lead avatar present with aria-label starting with 'Lead agent:'
			expect(card.querySelector("[aria-label^='Lead agent:']")).not.toBeNull();
			// Active bets and shipped counts present (text-based; matches singular or plural)
			expect(card.textContent).toMatch(/active bets?/i);
			expect(card.textContent).toMatch(/shipped/i);
		}
	});
});
