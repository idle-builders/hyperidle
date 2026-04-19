/**
 * J5 — Portfolio cycle-management stripe below product cards.
 * Shows current cycle and days remaining.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkPortfolio />
		</MemoryRouter>,
	);
}

describe("WorkPortfolio — cycle stripe (J5)", () => {
	it("renders a cycle management stripe below the product cards", () => {
		renderPage();
		const stripe = screen.getByTestId("cycle-stripe");
		expect(stripe).toBeInTheDocument();

		const firstCard = screen.getAllByTestId("product-card")[0];
		// stripe should come after the product card grid in DOM order
		const order = firstCard.compareDocumentPosition(stripe);
		expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it("shows current cycle label and days remaining", () => {
		renderPage();
		const stripe = screen.getByTestId("cycle-stripe");
		expect(stripe.textContent).toMatch(/cycle/i);
		expect(stripe.textContent).toMatch(/days? remaining/i);
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
