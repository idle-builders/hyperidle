/**
 * AB2 — WorkTeam page: AgentRow component tests (RED phase)
 *
 * AC coverage:
 * AC-1: Team page shows "Agents" section alongside Bets and Routines
 * AC-2: Each agent appears with name, status (active/idle/error), current task, health indicator
 * AC-3: Agent row click navigates to /agents/:agentId
 *
 * @lore AU26 J4: `operationalStatus`/`healthLevel`/`healthDetail`/
 * `activeTaskTitle` no longer ride on `RosterMember` — core-api stopped reading
 * `agent-orchestration`'s `sessions` table, and `useRosterRunState` fetches the
 * runs from that Layer and derives them in the browser. The row's RENDERING
 * contract is unchanged and is exactly what these tests cover, so the hook is
 * stubbed here with the same values the wire fixtures used to carry (the same
 * pattern as the `useTeamAgents` stub below — a fetch hook is not available in
 * JSDOM).
 */

import type { RosterMember, TeamDetail } from "@hyperidle/domain-model";
import { render, screen, waitFor, within } from "@testing-library/react";
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

// AU26 J4: the roster's run state is fetched from agent-orchestration. Stub the
// hook with the values the wire fixtures used to carry.
const ROSTER_RUN_STATE = new Map([
	[
		"agent-idle",
		{
			operationalStatus: "idle",
			healthLevel: "healthy",
			healthDetail: "Healthy",
			activeTaskTitle: null,
			activeTaskId: null,
		},
	],
	[
		"agent-active",
		{
			operationalStatus: "active",
			healthLevel: "healthy",
			healthDetail: "Healthy",
			activeTaskTitle: "Implement file upload",
			activeTaskId: "task-123",
		},
	],
	[
		"agent-error",
		{
			operationalStatus: "error",
			healthLevel: "critical",
			healthDetail: "5 of 6 sessions failed",
			activeTaskTitle: null,
			activeTaskId: null,
		},
	],
]);

vi.mock("../hooks/useAgentRunState", async () => {
	const actual = await vi.importActual<typeof import("../hooks/useAgentRunState.js")>(
		"../hooks/useAgentRunState.js",
	);
	return {
		...actual,
		useRosterRunState: () => ({ byAgent: ROSTER_RUN_STATE, status: "ready" as const }),
	};
});

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
	},
	tasksInProgress: [],
	routines: [],
};

const AGENT_IDLE: RosterMember = {
	agentId: "agent-idle",
	name: "Idle Agent",
	role: "builder",
	isLead: false,
	agentCategory: null,
};

const AGENT_ACTIVE: RosterMember = {
	agentId: "agent-active",
	name: "Active Agent",
	role: "builder",
	isLead: false,
	agentCategory: null,
};

const AGENT_ERROR: RosterMember = {
	agentId: "agent-error",
	name: "Error Agent",
	role: "builder",
	isLead: false,
	agentCategory: null,
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

	// AZ7 E7 (§1.6 finding #1): the agent-status cell now renders through
	// StatusChip (AGENT_OPERATIONAL_STATUS_LABEL — "Idle"/"Active"/"Error"),
	// matching the same word + treatment as every other status on this page,
	// instead of the raw lowercase domain string ("idle"/"active"/"error").
	it("shows status label for each agent", () => {
		renderPage(TEAM_WITH_AGENTS);
		const statusEls = screen.getAllByTestId("agent-status");
		const statuses = statusEls.map((el) => el.textContent?.trim());
		expect(statuses).toContain("Idle");
		expect(statuses).toContain("Active");
		expect(statuses).toContain("Error");
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

		// Click the idle agent row.
		//
		// @lore knowledge-attachment-slot: click the row's NAME text, not the
		// outer `agent-row` testid element. Row.tsx's onClick+actions branch
		// puts the click handler on an inner div that wraps lead/title/cells
		// only — `actions` (Profile link, Customize button) render as a
		// sibling OUTSIDE it, never nested inside the clickable element (a
		// real browser reached the row's onClick from a nested actions click
		// despite the action's own stopPropagation — see Row.tsx's div-branch
		// lore). `data-testid="agent-row"` stays on the OUTER, non-clickable
		// wrapper so it keeps finding the whole row (title AND actions) for
		// other queries; a click on that outer node no longer reaches the
		// inner handler, matching how a real click on empty row padding
		// (outside the clickable content) already didn't navigate before this
		// fix either — this test asserts the row is clickable via its content,
		// which is what a real user actually clicks.
		const rows = screen.getAllByTestId("agent-row");
		const idleRow = rows.find((r) => r.textContent?.includes("Idle Agent"));
		expect(idleRow).toBeDefined();

		await user.click(within(idleRow as HTMLElement).getByText("Idle Agent"));

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
