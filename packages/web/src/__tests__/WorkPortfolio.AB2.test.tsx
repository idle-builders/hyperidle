/**
 * AB2 — WorkPortfolio page: agent summary line and team pill health dot (RED phase)
 *
 * AC coverage:
 * AC-5: Portfolio page shows per-team agent summary: agent count, active count, health indicator
 *   - portfolio-agent-summary shows total agent count and active count
 *   - health dot appears when any team has agentHealthWarning=true
 *   - team pills show agent count and health dot when applicable
 *
 * These tests FAIL until:
 * - TeamListItem extended with agentCount, activeAgentCount, agentHealthWarning
 * - WorkPortfolio.tsx adds agent summary line after routine summary
 * - WorkPortfolio.tsx adds agent count + health dot to team pills
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

// useTeams mock — set per test
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

// Base team fixture with agent fields
const BASE_TEAM_WITH_AGENTS = {
	id: "team-1",
	name: "Team One",
	status: "healthy" as const,
	activeBets: 2,
	shipRate: "67%",
	leadAgentId: null,
	shipped: 4,
	progress: { done: 1, total: 3 },
	phase: "build",
	routineCount: 0,
	agentCount: 3,
	activeAgentCount: 1,
	agentHealthWarning: false,
};

// ---------------------------------------------------------------------------
// AC-5: Agent summary line renders with correct counts
// ---------------------------------------------------------------------------

describe("WorkPortfolio — AB2 Agent Summary", () => {
	it("shows portfolio-agent-summary when teams have agents", () => {
		mockUseTeams.mockReturnValue({
			data: {
				teams: [BASE_TEAM_WITH_AGENTS],
			},
		});

		renderPortfolio();

		expect(screen.getByTestId("portfolio-agent-summary")).toBeInTheDocument();
	});

	it("shows correct total agent count and active count in summary", () => {
		mockUseTeams.mockReturnValue({
			data: {
				teams: [
					{ ...BASE_TEAM_WITH_AGENTS, agentCount: 3, activeAgentCount: 2 },
					{
						...BASE_TEAM_WITH_AGENTS,
						id: "team-2",
						name: "Team Two",
						agentCount: 2,
						activeAgentCount: 0,
					},
				],
			},
		});

		renderPortfolio();

		const summary = screen.getByTestId("portfolio-agent-summary");
		// Total: 5 agents, 2 active
		expect(summary.textContent).toContain("5");
		expect(summary.textContent).toContain("2");
	});

	it("shows singular 'agent' when count is 1", () => {
		mockUseTeams.mockReturnValue({
			data: {
				teams: [{ ...BASE_TEAM_WITH_AGENTS, agentCount: 1, activeAgentCount: 0 }],
			},
		});

		renderPortfolio();

		// "1 agent" (not "1 agents")
		expect(screen.getByText(/1 agent[^s]/i)).toBeInTheDocument();
	});

	it("shows plural 'agents' when count > 1", () => {
		mockUseTeams.mockReturnValue({
			data: {
				teams: [{ ...BASE_TEAM_WITH_AGENTS, agentCount: 3, activeAgentCount: 1 }],
			},
		});

		renderPortfolio();

		expect(screen.getByText(/3 agents/i)).toBeInTheDocument();
	});

	it("hides agent summary when all teams have agentCount = 0", () => {
		mockUseTeams.mockReturnValue({
			data: {
				teams: [
					{
						...BASE_TEAM_WITH_AGENTS,
						agentCount: 0,
						activeAgentCount: 0,
						agentHealthWarning: false,
					},
				],
			},
		});

		renderPortfolio();

		expect(screen.queryByTestId("portfolio-agent-summary")).not.toBeInTheDocument();
	});

	it("hides agent summary when teams data is not loaded", () => {
		mockUseTeams.mockReturnValue({ data: null });

		renderPortfolio();

		expect(screen.queryByTestId("portfolio-agent-summary")).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-5: Health dot in agent summary when agentHealthWarning=true
// ---------------------------------------------------------------------------

describe("WorkPortfolio — AB2 Agent Health Dot in Summary", () => {
	it("does NOT show health dot in summary when no team has agentHealthWarning", () => {
		mockUseTeams.mockReturnValue({
			data: {
				teams: [{ ...BASE_TEAM_WITH_AGENTS, agentHealthWarning: false }],
			},
		});

		renderPortfolio();

		const summary = screen.getByTestId("portfolio-agent-summary");
		// Health dot has title "One or more agents need attention"
		const healthDot = summary.querySelector("[title='One or more agents need attention']");
		expect(healthDot).toBeNull();
	});

	it("shows health dot in summary when any team has agentHealthWarning=true", () => {
		mockUseTeams.mockReturnValue({
			data: {
				teams: [
					{ ...BASE_TEAM_WITH_AGENTS, agentHealthWarning: false },
					{ ...BASE_TEAM_WITH_AGENTS, id: "team-2", name: "Team Two", agentHealthWarning: true },
				],
			},
		});

		renderPortfolio();

		const summary = screen.getByTestId("portfolio-agent-summary");
		const healthDot = summary.querySelector("[title='One or more agents need attention']");
		expect(healthDot).not.toBeNull();
	});
});
