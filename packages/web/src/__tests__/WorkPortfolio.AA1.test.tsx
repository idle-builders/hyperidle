/**
 * AA1 — WorkPortfolio routine summary tests (Task 9).
 *
 * AC coverage:
 * AC-6: Work portfolio shows routine count per team alongside bet count
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

// vi.mock calls must be at module top level for Vitest to hoist correctly
vi.mock("../hooks/useBets", () => ({
	useBets: vi.fn().mockReturnValue({
		bets: [],
		loading: false,
		error: null,
		refresh: vi.fn(),
	}),
}));

// useTeams mock — set default and override per test
const mockUseTeams = vi.fn();
vi.mock("../hooks/useTeams", () => ({
	useTeams: (...args: unknown[]) => mockUseTeams(...args),
}));

afterEach(() => {
	vi.clearAllMocks();
});

function renderPortfolio(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkPortfolio />
		</MemoryRouter>,
	);
}

describe("WorkPortfolio — AA1 Routine Summary", () => {
	// AC-6: Summary line shows routine count when teams have routines
	it("shows routine summary line when totalActiveRoutines > 0", () => {
		mockUseTeams.mockReturnValue({
			data: {
				teams: [
					{
						id: "team-1",
						name: "Team One",
						status: "healthy",
						activeBets: 2,
						shipRate: "67%",
						leadAgentId: null,
						shipped: 4,
						progress: { done: 1, total: 3 },
						phase: "build",
						routineCount: 3,
					},
					{
						id: "team-2",
						name: "Team Two",
						status: "healthy",
						activeBets: 1,
						shipRate: "50%",
						leadAgentId: null,
						shipped: 2,
						progress: { done: 0, total: 2 },
						phase: "build",
						routineCount: 2,
					},
				],
			},
		});

		renderPortfolio();

		// Should show routine count summary — total 5 routines
		expect(screen.getByTestId("portfolio-routine-summary")).toBeInTheDocument();
		expect(screen.getByText(/5 routine/i)).toBeInTheDocument();
	});

	it("hides routine summary line when routineCount is 0 for all teams", () => {
		mockUseTeams.mockReturnValue({
			data: {
				teams: [
					{
						id: "team-1",
						name: "Team One",
						status: "healthy",
						activeBets: 2,
						shipRate: "67%",
						leadAgentId: null,
						shipped: 4,
						progress: { done: 1, total: 3 },
						phase: "build",
						routineCount: 0,
					},
				],
			},
		});

		renderPortfolio();

		// Should NOT show routine summary when count is 0
		expect(screen.queryByTestId("portfolio-routine-summary")).not.toBeInTheDocument();
	});

	it("hides routine summary line when teams data is not loaded yet", () => {
		mockUseTeams.mockReturnValue({ data: null });

		renderPortfolio();

		expect(screen.queryByTestId("portfolio-routine-summary")).not.toBeInTheDocument();
	});
});
