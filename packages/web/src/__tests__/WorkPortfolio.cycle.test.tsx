/**
 * J5 — Portfolio cycle-management stripe (now removed in U9).
 *
 * @lore U9: Team cards and cycle stripe removed. Portfolio now shows bet grid.
 * J5 cycle stripe tests are no longer applicable — replaced with bet grid tests.
 * File kept but tests updated to confirm team-card / cycle-stripe absence.
 * @lore M3 G1: MOCK_CYCLE removed. Cycle data was never wired from server.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

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
			],
		},
	}),
}));

vi.mock("../hooks/useBets", () => ({
	useBets: vi.fn().mockReturnValue({
		bets: [],
		loading: false,
		error: null,
		refresh: vi.fn(),
	}),
}));

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkPortfolio />
		</MemoryRouter>,
	);
}

describe("WorkPortfolio — cycle stripe (J5)", () => {
	it("does NOT render a cycle-stripe element (M3 G1: MOCK_CYCLE removed)", () => {
		renderPage();
		expect(screen.queryByTestId("cycle-stripe")).not.toBeInTheDocument();
	});

	it("does NOT render team cards (U9: replaced by bet grid)", () => {
		renderPage();
		// Team cards removed in U9 — bet grid is the new structure
		expect(screen.queryByTestId("team-card")).not.toBeInTheDocument();
	});

	it("renders bet grid (U9 AC-2 replacement for team card grid)", () => {
		renderPage();
		// With empty bets, shows EmptyState
		expect(screen.getByTestId("portfolio-empty")).toBeInTheDocument();
	});
});
