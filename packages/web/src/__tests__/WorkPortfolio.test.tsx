import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

/**
 * @lore U9: WorkPortfolio restructured to bet grid. Old team-card grid, Canvas,
 * useCanvasBets, and "Portfolio" heading removed. Now uses useBets hook.
 * Tests updated to reflect new bet grid structure.
 */

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

// U9: useBets replaces useCanvasBets
const mockUseBets = vi.fn().mockReturnValue({
	bets: [],
	loading: false,
	error: null,
	refresh: vi.fn(),
});
vi.mock("../hooks/useBets", () => ({
	useBets: (...args: unknown[]) => mockUseBets(...args),
}));

afterEach(() => {
	vi.clearAllMocks();
	mockUseBets.mockReturnValue({
		bets: [],
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

	it('renders "All bets" heading (U9: replaces old "Portfolio" heading)', () => {
		renderPage();
		expect(screen.getByText(/all bets/i)).toBeInTheDocument();
	});

	describe("spec alignment (U9 AC-2)", () => {
		it('renders "All bets" heading (not "Portfolio Canvas")', () => {
			renderPage();
			expect(screen.queryByText(/portfolio canvas/i)).not.toBeInTheDocument();
			expect(screen.getByText(/all bets/i)).toBeInTheDocument();
		});

		it("does NOT render old team card grid", () => {
			renderPage();
			expect(screen.queryByTestId("team-card")).not.toBeInTheDocument();
		});

		it("renders bet grid when bets exist", () => {
			mockUseBets.mockReturnValue({
				bets: [
					{
						id: "bet-1",
						title: "Bet One",
						teamId: "p1",
						status: "active",
						description: "First bet",
						costAppetite: null,
						atRisk: false,
					},
				],
				loading: false,
				error: null,
				refresh: vi.fn(),
			});
			renderPage();
			const grid = screen.getByTestId("bet-grid");
			expect(grid).toBeInTheDocument();
			expect(screen.getByText("Bet One")).toBeInTheDocument();
		});
	});

	// R2 AC-7 behaviour replaced in U9: "New bet" btn-primary triggers dialog
	// @lore visual-parity: "New bet" header button hidden in empty state (bets.length === 0).
	// Tests that need the header button must mock useBets with at least one bet.
	describe("U9 AC-2 — New bet button", () => {
		it('renders "New bet" button with btn-primary', () => {
			// Provide a bet so the header "New bet" button is visible
			mockUseBets.mockReturnValue({
				bets: [
					{
						id: "bet-header-test",
						title: "Header Bet",
						teamId: "p1",
						status: "active",
						description: "Test bet",
						costAppetite: null,
					},
				],
				loading: false,
				error: null,
				refresh: vi.fn(),
			});
			renderPage();
			// data-testid targets the header button (not the EmptyState CTA)
			const btn = screen.getByTestId("new-bet-btn");
			expect(btn).toBeInTheDocument();
			expect(btn.className).toContain("btn-primary");
		});

		it('"New bet" opens BetCreateDialog when clicked', async () => {
			// Provide a bet so the header "New bet" button is visible
			mockUseBets.mockReturnValue({
				bets: [
					{
						id: "bet-dialog-test",
						title: "Dialog Bet",
						teamId: "p1",
						status: "active",
						description: "Test bet",
						costAppetite: null,
					},
				],
				loading: false,
				error: null,
				refresh: vi.fn(),
			});
			const user = userEvent.setup();
			renderPage();
			// data-testid targets the header button (not the EmptyState CTA)
			await user.click(screen.getByTestId("new-bet-btn"));
			// Dialog should be open
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});

		it("shows empty state when no bets exist", () => {
			// Default mock: bets: []
			renderPage();
			expect(screen.getByTestId("portfolio-empty")).toBeInTheDocument();
		});
	});
});
