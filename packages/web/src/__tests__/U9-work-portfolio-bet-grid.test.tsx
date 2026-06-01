/**
 * U9 AC-2 + AC-3: WorkPortfolio bet grid + team pill filters.
 *
 * Verifies:
 * - AC-2: 2-column grid of BetCard components from /api/bets (all statuses)
 * - AC-2: Canvas team card grid removed
 * - AC-2: "New bet" button styled as btn-primary
 * - AC-3: Team pill filter bar shows "All teams" + one pill per team
 * - AC-3: Clicking a team pill filters bets
 * - AC-3: Active pill uses btn-primary, inactive btn-ghost
 *
 * RED PHASE: these tests are written before implementation.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

// Mock useTeams to return two teams
vi.mock("../hooks/useTeams", () => ({
	useTeams: vi.fn().mockReturnValue({
		data: {
			teams: [
				{
					id: "team-1",
					name: "Alpha Team",
					status: "healthy",
					activeBets: 2,
					shipRate: "80%",
					leadAgentId: "agent-1",
					shipped: 5,
					progress: { done: 2, total: 4 },
				},
				{
					id: "team-2",
					name: "Beta Team",
					status: "behind",
					activeBets: 1,
					shipRate: "60%",
					leadAgentId: "agent-2",
					shipped: 3,
					progress: { done: 1, total: 3 },
				},
			],
		},
	}),
}));

// Mock useBets to return a flat list of bets across statuses
vi.mock("../hooks/useBets", () => ({
	useBets: vi.fn().mockReturnValue({
		bets: [
			{
				id: "bet-1",
				title: "Bet One",
				teamId: "team-1",
				status: "active",
				description: "First bet description",
				costAppetite: null,
				atRisk: false,
			},
			{
				id: "bet-2",
				title: "Bet Two",
				teamId: "team-2",
				status: "draft",
				description: "Second bet description",
				costAppetite: null,
				atRisk: false,
			},
			{
				id: "bet-3",
				title: "Bet Three",
				teamId: "team-1",
				status: "completed",
				description: "Third bet description",
				costAppetite: null,
				atRisk: false,
			},
		],
		loading: false,
		error: null,
		refresh: vi.fn(),
	}),
}));

afterEach(() => {
	vi.clearAllMocks();
});

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkPortfolio />
		</MemoryRouter>,
	);
}

describe("U9 AC-2: WorkPortfolio bet grid", () => {
	it("renders the portfolio page", () => {
		renderPage();
		expect(screen.getByTestId("work-portfolio-page")).toBeInTheDocument();
	});

	it('renders "All bets" heading', () => {
		renderPage();
		// New layout has "All bets" instead of "Portfolio"
		expect(screen.getByText(/all bets/i)).toBeInTheDocument();
	});

	it("renders bet cards in a grid", () => {
		renderPage();
		// Should have a grid with grid-cols-2 class
		const grid = screen.getByTestId("bet-grid");
		expect(grid).toBeInTheDocument();
		expect(grid.className).toContain("grid-cols-2");
	});

	it("renders a BetCard for each bet from useBets", () => {
		renderPage();
		// All 3 bets should appear
		expect(screen.getByText("Bet One")).toBeInTheDocument();
		expect(screen.getByText("Bet Two")).toBeInTheDocument();
		expect(screen.getByText("Bet Three")).toBeInTheDocument();
	});

	it('does NOT render old team card grid (data-testid="team-card")', () => {
		renderPage();
		expect(screen.queryByTestId("team-card")).not.toBeInTheDocument();
	});

	it("does NOT render Canvas component", () => {
		renderPage();
		// Canvas had data-testid="canvas-board"
		expect(screen.queryByTestId("canvas-board")).not.toBeInTheDocument();
	});

	it('"New bet" button uses btn-primary class', () => {
		renderPage();
		const newBetBtn = screen.getByRole("button", { name: /new bet/i });
		expect(newBetBtn).toBeInTheDocument();
		expect(newBetBtn.className).toContain("btn-primary");
	});
});

describe("U9 AC-3: WorkPortfolio team pill filters", () => {
	it('renders "All teams" filter pill', () => {
		renderPage();
		expect(screen.getByRole("button", { name: /all teams/i })).toBeInTheDocument();
	});

	it("renders one pill per team", () => {
		renderPage();
		// Find pills within the team-pill-filters group specifically
		const pillBar = screen.getByTestId("team-pill-filters");
		expect(pillBar.querySelector('[class*="btn"]')).not.toBeNull();
		// Check for team names in the pill bar buttons (not BetCard)
		const buttons = Array.from(pillBar.querySelectorAll("button"));
		const names = buttons.map((b) => b.textContent);
		expect(names.some((n) => /alpha team/i.test(n ?? ""))).toBe(true);
		expect(names.some((n) => /beta team/i.test(n ?? ""))).toBe(true);
	});

	it('"All teams" pill uses btn-primary when active (default state)', () => {
		renderPage();
		const allTeamsBtn = screen.getByRole("button", { name: /all teams/i });
		expect(allTeamsBtn.className).toContain("btn-primary");
	});

	it("team pills use btn-ghost when inactive", () => {
		renderPage();
		const pillBar = screen.getByTestId("team-pill-filters");
		const buttons = Array.from(pillBar.querySelectorAll("button"));
		const alphaTeamBtn = buttons.find((b) => /alpha team/i.test(b.textContent ?? ""));
		expect(alphaTeamBtn).toBeDefined();
		expect(alphaTeamBtn?.className).toContain("btn-ghost");
	});

	it("clicking a team pill filters bets by that team", async () => {
		const user = userEvent.setup();
		renderPage();

		// Initially all 3 bets visible
		expect(screen.getByText("Bet One")).toBeInTheDocument();
		expect(screen.getByText("Bet Two")).toBeInTheDocument();
		expect(screen.getByText("Bet Three")).toBeInTheDocument();

		// Click "Alpha Team" pill — use the pill bar to disambiguate from BetCard
		const pillBar = screen.getByTestId("team-pill-filters");
		const alphaBtn = Array.from(pillBar.querySelectorAll("button")).find((b) =>
			/alpha team/i.test(b.textContent ?? ""),
		);
		expect(alphaBtn).toBeDefined();
		if (!alphaBtn) throw new Error("alphaBtn not found");
		await user.click(alphaBtn);

		// Now only Alpha Team bets (bet-1, bet-3) visible; bet-2 (team-2) hidden
		await waitFor(() => {
			expect(screen.getByText("Bet One")).toBeInTheDocument();
			expect(screen.queryByText("Bet Two")).not.toBeInTheDocument();
			expect(screen.getByText("Bet Three")).toBeInTheDocument();
		});
	});

	it("clicking an active team pill again shows all bets", async () => {
		const user = userEvent.setup();
		renderPage();

		const pillBar = screen.getByTestId("team-pill-filters");
		const alphaBtn = Array.from(pillBar.querySelectorAll("button")).find((b) =>
			/alpha team/i.test(b.textContent ?? ""),
		);
		if (!alphaBtn) throw new Error("alphaBtn not found");
		const allTeamsBtn = screen.getByRole("button", { name: /all teams/i });

		// Click "Alpha Team" to filter
		await user.click(alphaBtn);
		// Click "All teams" to deselect
		await user.click(allTeamsBtn);

		await waitFor(() => {
			expect(screen.getByText("Bet Two")).toBeInTheDocument();
		});
	});

	it("active team pill switches to btn-primary", async () => {
		const user = userEvent.setup();
		renderPage();

		const pillBar = screen.getByTestId("team-pill-filters");
		const alphaBtn = Array.from(pillBar.querySelectorAll("button")).find((b) =>
			/alpha team/i.test(b.textContent ?? ""),
		);
		if (!alphaBtn) throw new Error("alphaBtn not found");
		await user.click(alphaBtn);

		await waitFor(() => {
			const updatedPillBar = screen.getByTestId("team-pill-filters");
			const updatedAlphaBtn = Array.from(updatedPillBar.querySelectorAll("button")).find((b) =>
				/alpha team/i.test(b.textContent ?? ""),
			);
			expect(updatedAlphaBtn?.className).toContain("btn-primary");
		});
	});
});
