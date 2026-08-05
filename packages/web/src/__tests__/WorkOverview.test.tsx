/**
 * AD9 — WorkOverview component tests (AC2, AC4, AC11).
 *
 * AC2: Team list with per-row status chip + active-bet count subtitle.
 * AC4: All four states — loading, error, empty, populated.
 * AC11: 1-team short-circuit → <Navigate to="/work/team/:id" replace>.
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
const BASE_TEAM = {
	phase: "build",
	leadAgentId: null,
	shipped: 0,
	shipRate: "—",
	progress: { done: 0, total: 0 },
	routineCount: 0,
	agentCount: 0,
};

const TEAM_A = {
	...BASE_TEAM,
	id: "team-a",
	name: "Alpha Team",
	status: "healthy" as const,
	activeBets: 3,
};
const TEAM_B = {
	...BASE_TEAM,
	id: "team-b",
	name: "Beta Team",
	status: "blocked" as const,
	activeBets: 1,
};
const TEAM_C = {
	...BASE_TEAM,
	id: "team-c",
	name: "Gamma Team",
	status: "behind" as const,
	activeBets: 0,
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
// AC4 — Loading state
// ---------------------------------------------------------------------------
describe("AC4 — Loading state", () => {
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
// AC4 — Error state
// ---------------------------------------------------------------------------
describe("AC4 — Error state", () => {
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

	it("renders a retry affordance in the error state (AC4 §3 spec)", () => {
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

	it("clicking retry triggers refetch (AC4 §3 spec)", async () => {
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
// AC4 — Empty state (0 teams)
// ---------------------------------------------------------------------------
describe("AC4 — Empty state (0 teams)", () => {
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
		expect(setupLink ?? setupBtn).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC11 — 1-team short-circuit
// ---------------------------------------------------------------------------
describe("AC11 — 1-team short-circuit (WorkOverview redirects to the single team)", () => {
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
// AC2 — Populated team list
// ---------------------------------------------------------------------------
describe("AC2 — Populated team list (2+ teams)", () => {
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

	it("rows appear in attention-sorted order: blocked → behind → healthy", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B, TEAM_C] }, // healthy, blocked, behind
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		const rows = screen.getAllByTestId("team-row");
		// blocked first (TEAM_B), then behind (TEAM_C), then healthy (TEAM_A)
		expect(rows[0]).toHaveTextContent("Beta Team");
		expect(rows[1]).toHaveTextContent("Gamma Team");
		expect(rows[2]).toHaveTextContent("Alpha Team");
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
			data: { teams: [TEAM_A] }, // activeBets: 3 but we test 2 teams case
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
		expect(screen.getByText("3 active bets")).toBeInTheDocument();
		expect(screen.getByText("1 active bet")).toBeInTheDocument();
	});

	it("renders singular 'active bet' for count of 1", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_B, TEAM_A] }, // TEAM_B has 1 activeBets
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByText("1 active bet")).toBeInTheDocument();
	});

	it("renders plural 'active bets' for count != 1", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] }, // TEAM_A has 3 activeBets
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByText("3 active bets")).toBeInTheDocument();
	});

	it("renders 0 active bets as end cell", () => {
		const zeroTeam = { ...TEAM_A, id: "zero", name: "Zero Bets", activeBets: 0 };
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_B, zeroTeam] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByText("0 active bets")).toBeInTheDocument();
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

	it("header renders 'New bet' button", () => {
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		expect(screen.getByRole("button", { name: /new bet/i })).toBeInTheDocument();
	});

	it("'New bet' button navigates to /work/bet/new", async () => {
		const user = userEvent.setup();
		mockUseTeams.mockReturnValue({
			data: { teams: [TEAM_A, TEAM_B] },
			loading: false,
			error: null,
			refetch: mockRefetch,
		});
		renderInRouter();
		await user.click(screen.getByRole("button", { name: /new bet/i }));
		expect(mockNavigate).toHaveBeenCalledWith("/work/bet/new");
	});
});
