/**
 * L13 — WorkPortfolio test extension: bet card click navigates to /work/bet/:id.
 *
 * @lore U9: Old "product card" (team-card) navigation replaced with BetCard navigation
 * to /work/bet/:id. The L13 AC was "click on a product card navigates to /work/team/:id" —
 * in U9 the portfolio no longer shows team cards, it shows bet cards.
 * Updated AC: click on a bet card navigates to /work/bet/:id.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { WorkPortfolio } from "../pages/WorkPortfolio";

vi.mock("../hooks/useTeams", () => ({
	useTeams: vi.fn().mockReturnValue({
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

vi.mock("../hooks/useBets", () => ({
	useBets: vi.fn().mockReturnValue({
		bets: [
			{
				id: "bet-drill-1",
				title: "Drill-Down Bet",
				teamId: "p-drill-1",
				status: "active",
				description: "Drill-down bet description",
				costAppetite: null,
				atRisk: false,
			},
		],
		loading: false,
		error: null,
		refresh: vi.fn(),
	}),
}));

// @lore U9: BetCard navigation goes to /work/bet/:id
function renderPortfolioWithRouter(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/work/portfolio"]}>
			<Routes>
				<Route path="/work/portfolio" element={<WorkPortfolio />} />
				<Route path="/work/bet/:betId" element={<div data-testid="work-bet-page">Bet Page</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkPortfolio — L13 drill-down", () => {
	it("14. click on a bet card navigates to /work/bet/:id", async () => {
		const user = userEvent.setup();
		renderPortfolioWithRouter();

		// Bet cards are rendered in the bet-grid
		const grid = screen.getByTestId("bet-grid");
		expect(grid).toBeInTheDocument();
		expect(screen.getByText("Drill-Down Bet")).toBeInTheDocument();

		// Click the bet card — BetCard is a div with onClick
		const betCard = grid.querySelector("[data-testid='bet-card']") as HTMLElement | null;
		if (betCard) {
			await user.click(betCard);
		} else {
			// BetCard may render as a button or div — find by text
			await user.click(screen.getByText("Drill-Down Bet"));
		}

		await waitFor(() => {
			expect(screen.getByTestId("work-bet-page")).toBeInTheDocument();
		});
	});
});
