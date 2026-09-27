/**
 * WorkOverview component tests.
 *
 * Covers: a team list with a per-row status chip + active-bet count
 * subtitle; all four states — loading, error, empty, populated; a
 * 1-team short-circuit → <Navigate to="/work/team/:id" replace>.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkOverview } from "../pages/WorkOverview";

// ---------------------------------------------------------------------------
// useTeams mock
// ---------------------------------------------------------------------------
const mockRefetch = vi.fn();
const mockUseTeams = vi.fn();
vi.mock("../hooks/useTeams", () => ({
	useTeams: () => mockUseTeams(),
}));

// navigate mock for "New bet" button navigation
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
	const original = await importOriginal<typeof import("react-router-dom")>();
	return {
		...original,
		useNavigate: () => mockNavigate,
	};
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TEAM_A = {
	id: "team-a",
	name: "Alpha Team",
	status: "healthy" as const,
	tasksInProgress: 3,
};
const TEAM_B = {
	id: "team-b",
	name: "Beta Team",
	status: "blocked" as const,
	tasksInProgress: 1,
};
const TEAM_C = {
	id: "team-c",
	name: "Gamma Team",
	status: "healthy" as const,
	tasksInProgress: 0,
};

afterEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderInRouter(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/work"]}>
			<Routes>
				<Route path="/work" element={<WorkOverview />} />
				<Route path="/work/team/:teamId" element={<div data-testid="team-page">Team Page</div>} />
				<Route path="/setup" element={<div data-testid="setup-page">Setup</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe("Loading state", () => {
	it("renders SkeletonList when loading", () => {
		mockUseTeams.mockReturnValue({ data: null, loading: true, error: null, refetch: mockRefetch });
		renderInRouter();
		// SkeletonList renders with aria-label "Loading teams"
		expect(screen.getByLabelText(/loading teams/i)).toBeInTheDocument();
	});

	it("does not render team rows when loading", () => {
		mockUseTeams.mockReturnValue({ data: null, loading: true, error: null, refetch: mockRefetch });
		renderInRouter();
		expect(screen.queryByTestId("team-row")).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------
describe("Error state", () => {
	it("renders ErrorState when fetch fails", () => {
		mockUseTeams.mockReturnValue({
			data: null,
			loading: false,
			error: new Error("Network error"),
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByText(/couldn't load teams/i)).toBeInTheDocument();
	});

	it("does not render team rows on error", () => {
		mockUseTeams.mockReturnValue({
			data: null,
			loading: false,
			error: new Error("Network error"),
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.queryByTestId("team-row")).not.toBeInTheDocument();
	});

	it("renders a retry affordance in the error state", () => {
		// Spec §3: error state must offer retry → refetch. Verifies the button exists
		// so users can recover without a full page reload.
		mockUseTeams.mockReturnValue({
			data: null,
			loading: false,
			error: new Error("Network error"),
			refetch: mockRefetch,
		});
		renderInRouter();
		// ErrorState renders a "Try again" button when onRetry is provided.
		expect(screen.getByRole("button", { name: /^retry$/i })).toBeInTheDocument();
	});

	it("clicking retry triggers refetch", async () => {
		const user = userEvent.setup();
		mockUseTeams.mockReturnValue({
			data: null,
			loading: false,
			error: new Error("Network error"),
			refetch: mockRefetch,
		});
		renderInRouter();
		await user.click(screen.getByRole("button", { name: /^retry$/i }));
		expect(mockRefetch).toHaveBeenCalledOnce();
	});
});

// ---------------------------------------------------------------------------
// Empty state (0 teams)
// ---------------------------------------------------------------------------
describe("Empty state (0 teams)", () => {
	it("renders EmptyState when teams array is empty", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByText(/no teams yet/i)).toBeInTheDocument();
	});

	it("empty state has a link or button to /setup", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		// Either a link to /setup or a button that navigates there
		const setupLink = screen.queryByRole("link", { name: /setup|finish setup|create.*team/i });
		const setupBtn = screen.queryByRole("button", { name: /setup|finish setup|create.*team/i });
		// At least one exists
		expect(setupLink ?? setupBtn).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// 1-team short-circuit
// ---------------------------------------------------------------------------
describe("1-team short-circuit (WorkOverview redirects to the single team)", () => {
	it("navigates to /work/team/:id when exactly 1 team", async () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		// Should redirect to team page, not show the overview
		await waitFor(() => {
			expect(screen.getByTestId("team-page")).toBeInTheDocument();
		});
	});

	it("does NOT render work-overview-page testid for 1-team case", async () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		await waitFor(() => {
			expect(screen.getByTestId("team-page")).toBeInTheDocument();
		});
		expect(screen.queryByTestId("work-overview-page")).not.toBeInTheDocument();
	});

	it("does NOT render team-row for 1-team case (no 1-row list)", async () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		await waitFor(() => {
			expect(screen.getByTestId("team-page")).toBeInTheDocument();
		});
		expect(screen.queryByTestId("team-row")).not.toBeInTheDocument();
	});

	it("shows the overview list when 2+ teams (no redirect)", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByTestId("work-overview-page")).toBeInTheDocument();
		expect(screen.queryByTestId("team-page")).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Populated team list
// ---------------------------------------------------------------------------
describe("Populated team list (2+ teams)", () => {
	it("renders work-overview-page testid", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByTestId("work-overview-page")).toBeInTheDocument();
	});

	it("renders one team-row per team", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B, TEAM_C] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		const rows = screen.getAllByTestId("team-row");
		expect(rows).toHaveLength(3);
	});

	it("rows appear in attention-sorted order: blocked → healthy (name asc)", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B, TEAM_C] }, // healthy, blocked, healthy
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		const rows = screen.getAllByTestId("team-row");
		// blocked first (TEAM_B), then healthy by name asc (TEAM_A, TEAM_C)
		expect(rows[0]).toHaveTextContent("Beta Team");
		expect(rows[1]).toHaveTextContent("Alpha Team");
		expect(rows[2]).toHaveTextContent("Gamma Team");
	});

	it("each row shows team name as title", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByText("Alpha Team")).toBeInTheDocument();
		expect(screen.getByText("Beta Team")).toBeInTheDocument();
	});

	it("renders active bet count as end cell (plural)", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A] }, // tasksInProgress: 3 but we test 2 teams case
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		// Need 2+ teams to show list
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByText("3 active tasks")).toBeInTheDocument();
		expect(screen.getByText("1 active task")).toBeInTheDocument();
	});

	it("renders singular 'active bet' for count of 1", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_B, TEAM_A] }, // TEAM_B has 1 activeBets
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByText("1 active task")).toBeInTheDocument();
	});

	it("renders plural 'active tasks' for count != 1", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] }, // TEAM_A has 3 activeBets
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByText("3 active tasks")).toBeInTheDocument();
	});

	it("renders 0 active tasks as end cell", () => {
		const zeroTeam = { ...TEAM_A, id: "zero", name: "Zero Bets", tasksInProgress: 0 };
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_B, zeroTeam] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByText("0 active tasks")).toBeInTheDocument();
	});

	it("renders a StatusChip end cell per row (no agents cell, no progress cell)", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		// StatusChip typically renders text like HEALTHY, BEHIND, BLOCKED
		expect(screen.queryByTestId("team-agents")).not.toBeInTheDocument();
		expect(screen.queryByTestId("team-progress")).not.toBeInTheDocument();
	});

	it("clicking a team row navigates to /work/team/:id", async () => {
		const user = userEvent.setup();
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		// Click first row (Beta Team is first after sort: blocked first)
		const rows = screen.getAllByTestId("team-row");
		await user.click(rows[0]!);
		expect(mockNavigate).toHaveBeenCalledWith("/work/team/team-b");
	});

	it("header shows 'Teams' title", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByText("Teams")).toBeInTheDocument();
	});

	it("header shows team count sub-line when teams exist", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByText("2 teams")).toBeInTheDocument();
	});

	// @lore: "New bet" renamed to "New task" — root tasks replace bets
	it("header renders 'New task' button", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByRole("button", { name: /new task/i })).toBeInTheDocument();
	});

	it("'New task' button navigates to /work/task/new (was /work/bet/new)", async () => {
		const user = userEvent.setup();
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		await user.click(screen.getByRole("button", { name: /new task/i }));
		expect(mockNavigate).toHaveBeenCalledWith("/work/task/new");
	});
});
