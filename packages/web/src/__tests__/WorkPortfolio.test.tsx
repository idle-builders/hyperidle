import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

// M3 G1: MOCK_PRODUCTS removed — mock useTeams for tests that need product cards.
// @lore U1: TeamListResponse uses `teams` array (renamed from `products`).
vi.mock("../hooks/useTeams", () => ({
	useTeams: vi.fn().mockReturnValue({
		data: {
			teams: [
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

// R2: mock useCanvasBets so we can control empty vs non-empty state
const mockUseCanvasBets = vi.fn().mockReturnValue({
	bets: [],
	capacity: { used: 0, max: 2 },
	loading: false,
	error: null,
	refresh: vi.fn(),
});
vi.mock("../hooks/useCanvasBets", () => ({
	useCanvasBets: (...args: unknown[]) => mockUseCanvasBets(...args),
}));

afterEach(() => {
	vi.clearAllMocks();
	// Reset to empty bets (default)
	mockUseCanvasBets.mockReturnValue({
		bets: [],
		capacity: { used: 0, max: 2 },
		loading: false,
		error: null,
		refresh: vi.fn(),
	});
});

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

	it("renders a Portfolio heading", () => {
		renderPage();
		expect(screen.getByRole("heading", { name: /^portfolio$/i })).toBeInTheDocument();
	});

	describe("spec alignment (I4 P1)", () => {
		it("renders a Portfolio heading (not 'Portfolio Canvas')", () => {
			renderPage();
			expect(screen.queryByText(/portfolio canvas/i)).not.toBeInTheDocument();
			expect(screen.getByText(/^portfolio$/i)).toBeInTheDocument();
		});

		it("renders at least one product status card", () => {
			renderPage();
			const cards = screen.getAllByTestId("team-card");
			expect(cards.length).toBeGreaterThan(0);
		});

		it("each product card exposes a name and a StatusChip", () => {
			renderPage();
			const cards = screen.getAllByTestId("team-card");
			for (const card of cards) {
				expect(card.querySelector(".rounded-full")).not.toBeNull();
			}
		});
	});

	// R2 AC-7: "Create bet" CTA visible and prominent when no bets exist
	describe("R2 AC7 — Create bet CTA", () => {
		it("renders Create bet CTA when products exist but no bets", () => {
			// useCanvasBets returns empty bets (default mock — bets: [])
			// useTeams returns 2 products (default mock above)
			renderPage();
			expect(screen.getByTestId("create-bet-cta")).toBeInTheDocument();
		});

		it("Create bet CTA contains a 'Create bet' button", () => {
			renderPage();
			expect(screen.getByRole("button", { name: /create bet/i })).toBeInTheDocument();
		});

		it("Create bet CTA opens BetCreateDialog when clicked", async () => {
			const user = userEvent.setup();
			renderPage();

			const createBetBtn = screen.getByRole("button", { name: /create bet/i });
			await user.click(createBetBtn);

			// Dialog should be open — look for the dialog element
			const dialog = screen.getByRole("dialog");
			expect(dialog).toBeInTheDocument();
		});

		it("Create bet CTA is hidden when bets exist", () => {
			// Override: canvas has a bet
			mockUseCanvasBets.mockReturnValueOnce({
				bets: [
					{
						id: "bet-1",
						title: "Existing Bet",
						team: "HyperIdle Core",
						teamId: "p1",
						status: "shaped",
						appetite: "—",
					},
				],
				capacity: { used: 1, max: 2 },
				loading: false,
				error: null,
				refresh: vi.fn(),
			});

			renderPage();
			// CTA should not be present when bets exist
			expect(screen.queryByTestId("create-bet-cta")).not.toBeInTheDocument();
		});
	});
});
