/**
 * AB2 — WorkTeam page: AgentRow component tests (RED phase)
 *
 * AC coverage:
 * AC-1: Team page shows "Agents" section alongside Bets and Routines
 * AC-2: Each agent appears with name, status (active/idle/error), current task, health indicator
 * AC-3: Agent row click navigates to /agents/:agentId
 *
 * These tests FAIL until:
 * - WorkTeam.tsx replaces R3 Roster/AgentCard with Agents/AgentRow
 * - data-testid changed from "team-roster" → "team-agents", "agent-card" → "agent-row"
 * - AgentRow shows operationalStatus, healthLevel, activeTaskTitle from RosterMember
 * - Row click navigates to /agents/:agentId
 * - Customize button stops propagation and fires onCustomize
 */

import type { RosterMember, TeamDetail } from "@hyperidle/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

// AgentEditDialog calls useToast — mock ToastRegion to avoid "must be used within
// <ToastRegion>" error when the Customize button opens the dialog.
// @lore AB2: Same pattern used in WorkProduct.test.tsx — mock useToast at the
// ToastRegion module level rather than mocking AgentEditDialog entirely.
vi.mock("../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: vi.fn() })),
	};
});

// Mock useTeamAgents — returns empty map (no external agent configs needed for these tests)
vi.mock("../hooks/useTeamAgents", () => ({
	useTeamAgents: vi.fn().mockReturnValue({ agents: new Map(), refetch: vi.fn() }),
}));

// Mock useHints — suppresses hint banners in all tests
vi.mock("../hooks/useHints", () => ({
	useHint: vi.fn().mockReturnValue({ visible: false, testId: "hint", copy: "", dismiss: vi.fn() }),
}));

const BASE_TEAM: TeamDetail = {
	team: {
		id: "team-ab2",
		name: "AB2 Team",
		phase: "build",
		status: "healthy",
		leadAgentId: null,
	},
	teamMembers: {
		id: "tm-ab2",
		formedAt: "2026-01-01T00:00:00.000Z",
		dissolvedAt: null,
	},
	roster: [],
	burn: {
		capacity: 5,
		activeBets: 0,
	},
	activeBets: [],
	routines: [],
};

const AGENT_IDLE: RosterMember = {
	agentId: "agent-idle",
	name: "Idle Agent",
	role: "builder",
	isLead: false,
	agentCategory: null,
	operationalStatus: "idle",
	healthLevel: "healthy",
	healthDetail: "Healthy",
	activeTaskTitle: null,
	activeTaskId: null,
	activeBetId: null,
};

const AGENT_ACTIVE: RosterMember = {
	agentId: "agent-active",
	name: "Active Agent",
	role: "builder",
	isLead: false,
	agentCategory: null,
	operationalStatus: "active",
	healthLevel: "healthy",
	healthDetail: "Healthy",
	activeTaskTitle: "Implement file upload",
	activeTaskId: "task-123",
	activeBetId: "bet-456",
};

const AGENT_ERROR: RosterMember = {
	agentId: "agent-error",
	name: "Error Agent",
	role: "builder",
	isLead: false,
	agentCategory: null,
	operationalStatus: "error",
	healthLevel: "critical",
	healthDetail: "5 of 6 sessions failed",
	activeTaskTitle: null,
	activeTaskId: null,
	activeBetId: null,
};

const TEAM_WITH_AGENTS: TeamDetail = {
	...BASE_TEAM,
	roster: [AGENT_IDLE, AGENT_ACTIVE, AGENT_ERROR],
};

function renderPage(data: TeamDetail = BASE_TEAM): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/work/team/team-ab2"]}>
			<Routes>
				<Route
					path="/work/team/:teamId"
					element={<WorkTeam overrideData={data} overrideLoading={false} skipArtifacts={true} />}
				/>
				<Route
					path="/agents/:agentId"
					element={<div data-testid="agent-profile-page">Agent Profile</div>}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// AC-1: "Agents" section visible
// ---------------------------------------------------------------------------

describe("AB2 AC-1: WorkTeam shows Agents section", () => {
	it("renders the Agents section with data-testid=team-agents", () => {
		renderPage(TEAM_WITH_AGENTS);
		expect(screen.getByTestId("team-agents")).toBeInTheDocument();
	});

	it("does NOT render team-roster (replaced by team-agents)", () => {
		renderPage(TEAM_WITH_AGENTS);
		expect(screen.queryByTestId("team-roster")).not.toBeInTheDocument();
	});

	it("shows section heading Agents (uppercase)", () => {
		renderPage(TEAM_WITH_AGENTS);
		const section = screen.getByTestId("team-agents");
		// The heading text should be "AGENTS" (uppercase) or "Agents" (text content)
		expect(section.textContent?.toLowerCase()).toContain("agents");
	});

	it("renders agent-row elements (not agent-card)", () => {
		renderPage(TEAM_WITH_AGENTS);
		const rows = screen.getAllByTestId("agent-row");
		expect(rows.length).toBe(3);
		// agent-card must not exist
		expect(screen.queryAllByTestId("agent-card").length).toBe(0);
	});

	it("renders empty state when roster is empty", () => {
		renderPage(BASE_TEAM);
		expect(screen.getByTestId("team-agents")).toBeInTheDocument();
		// No agent rows
		expect(screen.queryAllByTestId("agent-row").length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// AC-2: AgentRow renders status/health/context correctly
// ---------------------------------------------------------------------------

describe("AB2 AC-2: AgentRow renders operational data", () => {
	it("renders agent names", () => {
		renderPage(TEAM_WITH_AGENTS);
		expect(screen.getByText("Idle Agent")).toBeInTheDocument();
		expect(screen.getByText("Active Agent")).toBeInTheDocument();
		expect(screen.getByText("Error Agent")).toBeInTheDocument();
	});

	it("shows status label for each agent", () => {
		renderPage(TEAM_WITH_AGENTS);
		const statusEls = screen.getAllByTestId("agent-status");
		const statuses = statusEls.map((el) => el.textContent?.trim());
		expect(statuses).toContain("idle");
		expect(statuses).toContain("active");
		expect(statuses).toContain("error");
	});

	it("shows active task title in context column when agent is active", () => {
		renderPage(TEAM_WITH_AGENTS);
		expect(screen.getByText("Implement file upload")).toBeInTheDocument();
	});

	it("shows error detail in context column when agent is in error state", () => {
		renderPage(TEAM_WITH_AGENTS);
		expect(screen.getByText("5 of 6 sessions failed")).toBeInTheDocument();
	});

	it("renders a health indicator for each agent row", () => {
		renderPage(TEAM_WITH_AGENTS);
		// Health dots — each row has one dot element
		const rows = screen.getAllByTestId("agent-row");
		expect(rows.length).toBe(3);
		// Every row should contain some health indicator (dot with title or aria-label)
		for (const row of rows) {
			// The dot has a title attribute equal to healthDetail
			const dot = row.querySelector("[title]");
			expect(dot).not.toBeNull();
		}
	});
});

// ---------------------------------------------------------------------------
// AC-3: Row click navigates to /agents/:agentId
// ---------------------------------------------------------------------------

describe("AB2 AC-3: AgentRow click navigates to agent profile", () => {
	it("clicking agent row navigates to /agents/:agentId", async () => {
		const user = userEvent.setup();
		renderPage(TEAM_WITH_AGENTS);

		// Click the idle agent row
		const rows = screen.getAllByTestId("agent-row");
		const idleRow = rows.find((r) => r.textContent?.includes("Idle Agent"));
		expect(idleRow).toBeDefined();

		await user.click(idleRow as HTMLElement);

		await waitFor(() => {
			expect(screen.getByTestId("agent-profile-page")).toBeInTheDocument();
		});
	});

	it("clicking Customize button does NOT navigate away", async () => {
		const user = userEvent.setup();
		renderPage(TEAM_WITH_AGENTS);

		const customizeButtons = screen.getAllByTestId("agent-customize-btn");
		expect(customizeButtons.length).toBeGreaterThan(0);

		// Click the first Customize button — should not navigate to agent profile
		await user.click(customizeButtons[0] as HTMLElement);

		// Should still be on the team page (not navigated to agent profile)
		await waitFor(() => {
			expect(screen.queryByTestId("agent-profile-page")).not.toBeInTheDocument();
		});
	});
});
