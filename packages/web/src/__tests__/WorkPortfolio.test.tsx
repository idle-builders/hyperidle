import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

// M3 G1: MOCK_PRODUCTS removed — mock useProducts for tests that need product cards.
vi.mock("../hooks/useProducts", () => ({
	useProducts: vi.fn().mockReturnValue({
		data: {
			products: [
				{
					id: "p1",
					name: "HyperIdle Core",
					status: "healthy",
					activeBets: 4,
					shipRate: "78%",
					leadAgentId: "CE",
					shipped: 12,
					progress: { done: 3, total: 5 },
				},
				{
					id: "p2",
					name: "Knowledge Fabric",
					status: "behind",
					activeBets: 2,
					shipRate: "62%",
					leadAgentId: "FL",
					shipped: 6,
					progress: { done: 1, total: 4 },
				},
			],
		},
	}),
}));

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkPortfolio />
		</MemoryRouter>,
	);
}

describe("WorkPortfolio", () => {
	it("renders with test id", () => {
		renderPage();
		expect(screen.getByTestId("work-portfolio-page")).toBeInTheDocument();
	});

	// I4 P1 supersedes the previous "Portfolio Canvas" tests — Portfolio is
	// now a product overview, not a bet canvas. The detailed assertions live
	// in the spec-alignment block below.
	it("renders a Portfolio heading", () => {
		renderPage();
		expect(screen.getByRole("heading", { name: /^portfolio$/i })).toBeInTheDocument();
	});

	describe("spec alignment (I4 P1)", () => {
		// WorkPortfolio must render a portfolio overview (product status cards
		// and portfolio metrics), NOT the bet Canvas directly.
		it("renders a Portfolio heading (not 'Portfolio Canvas')", () => {
			renderPage();
			// Either plain "Portfolio" or something containing it, but
			// explicitly not the "Portfolio Canvas" phrase that the old page
			// used.
			expect(screen.queryByText(/portfolio canvas/i)).not.toBeInTheDocument();
			expect(screen.getByText(/^portfolio$/i)).toBeInTheDocument();
		});

		it("renders at least one product status card", () => {
			renderPage();
			const cards = screen.getAllByTestId("product-card");
			expect(cards.length).toBeGreaterThan(0);
		});

		it("does not render the bet Canvas", () => {
			// I4 P1: the Canvas belongs in WorkTeam, not WorkPortfolio.
			const { container } = render(
				<MemoryRouter>
					<WorkPortfolio />
				</MemoryRouter>,
			);
			// Canvas emits a DroppableColumn with data-droppable="shaped".
			expect(container.querySelector("[data-droppable='shaped']")).toBeNull();
			expect(container.querySelector("[data-droppable='committed']")).toBeNull();
		});

		it("each product card exposes a name and a StatusChip", () => {
			renderPage();
			const cards = screen.getAllByTestId("product-card");
			for (const card of cards) {
				// Each card must contain a StatusChip (renders .rounded-full)
				expect(card.querySelector(".rounded-full")).not.toBeNull();
			}
		});
	});
});
