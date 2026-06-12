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

	// AG2 AC-4: Frame invariant — "New bet" header button always present (0 or N bets).
	// @lore AG2: Header "new-bet-btn" is unconditional (removed bets.length>0 gate).
	// R2 contract: empty state carries data-testid="create-bet-cta" with button label "Create bet".
	describe("AG2 AC-4 — New bet button frame invariant", () => {
		it('renders "New bet" header button (new-bet-btn) when bets exist', () => {
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
			const btn = screen.getByTestId("new-bet-btn");
			expect(btn).toBeInTheDocument();
			expect(btn.className).toContain("btn-primary");
		});

		it('renders "New bet" header button (new-bet-btn) even when NO bets exist (frame invariant)', () => {
			// AG2: The header "new-bet-btn" is unconditional — present at zero bets.
			// Default mock: bets: []
			renderPage();
			const btn = screen.getByTestId("new-bet-btn");
			expect(btn).toBeInTheDocument();
		});

		it('"New bet" opens BetCreateDialog when clicked', async () => {
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
			await user.click(screen.getByTestId("new-bet-btn"));
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});

		it("shows empty state when no bets exist", () => {
			// Default mock: bets: []
			renderPage();
			expect(screen.getByTestId("portfolio-empty")).toBeInTheDocument();
		});

		it("AG2 R2 contract: empty state carries create-bet-cta testid", () => {
			// Default mock: bets: []
			renderPage();
			expect(screen.getByTestId("create-bet-cta")).toBeInTheDocument();
		});

		it("AG2 R2 contract: empty state CTA button accessible name is exactly 'Create bet'", () => {
			// Default mock: bets: []
			renderPage();
			// Must be "Create bet" — not "Create a bet" or "Create your first bet"
			expect(screen.getByRole("button", { name: /^create bet$/i })).toBeInTheDocument();
		});
	});

	describe("AG2 AC-5 — Filter-excluded empty state", () => {
		it("shows filter-excluded empty state when bets exist but filteredBets is empty", async () => {
			// Single bet with status "active", then attempt a status filter that excludes it
			// We need bets to exist but filtering to exclude them.
			// We test this via the no-matches testid after the component applies filters.
			// This is covered more thoroughly in the outcome test file; here we verify testid contract.
			mockUseBets.mockReturnValue({
				bets: [
					{
						id: "bet-filter-test",
						title: "Active Bet",
						teamId: "p1",
						status: "active",
						description: "A bet",
						costAppetite: null,
						outcomeVerdict: null,
					},
				],
				loading: false,
				error: null,
				refresh: vi.fn(),
			});
			const user = userEvent.setup();
			renderPage();
			// Click "Draft" status filter — excludes the active bet
			await user.click(screen.getByRole("button", { name: /^draft$/i }));
			expect(screen.getByTestId("portfolio-no-matches")).toBeInTheDocument();
			expect(screen.queryByTestId("portfolio-empty")).not.toBeInTheDocument();
		});
	});
});
