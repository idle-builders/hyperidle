/**
 * AV4 — WorkTeam split-pane routing: RED tests.
 *
 * AC coverage:
 * AC-1: ?routine=r1 → SplitView + RoutineDetailPane in destination; ratio persisted.
 * AC-2: (covered by RoutineDetailPane.AV4.test.tsx — tested in isolation)
 * AC-3: ?agent=a1 → AgentDetailPane in SplitView + no role="dialog"; "Customize" sets ?agent.
 * AC-4: (de-grey — covered by RoutineDetailPane.AV4.test.tsx + paint check)
 *
 * These tests FAIL until WorkTeamLoaded gains SplitView wiring + useSearchParams.
 */

import type { RosterMember, TeamDetail } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../WorkTeam";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../components/ArtifactSection.js", () => ({
	ArtifactSection: () => null,
	useArtifactOpen: () => vi.fn(),
}));

const mockApiFetch = vi.fn();
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("../../shell/ToastRegion.js", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../hooks/useHints", () => ({
	useHint: vi.fn().mockReturnValue({ visible: false, testId: "hint", copy: "", dismiss: vi.fn() }),
}));

vi.mock("../../hooks/useTeamAgents", () => ({
	useTeamAgents: vi.fn().mockReturnValue({ agents: new Map(), refetch: vi.fn() }),
}));

// RoutineDetailPane is new — mock it so we can assert it's rendered without needing
// the full fetch chain from WorkTeam tests. The test for AC-2/AC-4 is in RoutineDetailPane.AV4.test.tsx.
vi.mock("../work/RoutineDetailPane", () => ({
	RoutineDetailPane: ({ routineId }: { routineId: string }) => (
		<div data-testid="routine-detail-pane" data-routine-id={routineId}>
			Routine pane {routineId}
		</div>
	),
}));

vi.mock("../work/AgentDetailPane", () => ({
	AgentDetailPane: ({ onClose }: { onClose: () => void }) => (
		<div data-testid="agent-detail-pane">
			Agent pane
			<button type="button" onClick={onClose}>
				Close
			</button>
		</div>
	),
}));

// @lore AU26 J4: the roster's run state is fetched from `agent-orchestration`
// (`useRosterRunState`), not stamped onto `RosterMember` by core-api. Stub the
// hook with the values the wire fixtures used to carry — the row's rendering
// contract is what these tests cover and it is unchanged.
const ROSTER_RUN_STATE = new Map<string, unknown>([
	[
		"a1",
		{
			operationalStatus: "idle",
			healthLevel: "healthy",
			healthDetail: "Healthy",
			activeTaskTitle: null,
			activeTaskId: null,
		},
	],
]);

vi.mock("../../hooks/useAgentRunState", async () => {
	const actual = await vi.importActual<typeof import("../../hooks/useAgentRunState.js")>(
		"../../hooks/useAgentRunState.js",
	);
	return {
		...actual,
		useRosterRunState: () => ({ byAgent: ROSTER_RUN_STATE, status: "ready" as const }),
	};
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROSTER_MEMBER: RosterMember = {
	agentId: "a1",
	name: "Atlas Builder",
	role: "builder",
	isLead: false,
	agentCategory: "team",
};

const TEAM_DATA: TeamDetail = {
	team: {
		id: "t1",
		name: "AV4 Team",
		phase: "build",
		status: "healthy",
		leadAgentId: null,
	},
	teamMembers: {
		id: "tm-av4",
		formedAt: "2026-01-01T00:00:00.000Z",
		dissolvedAt: null,
	},
	roster: [ROSTER_MEMBER],
	burn: {
		capacity: 5,
	},
	tasksInProgress: [],
	routines: [
		{
			id: "r1",
			name: "Daily digest",
			state: "active",
			scheduleLabel: "Every day at 8:00 AM",
			agentName: "Atlas Builder",
			agentInitials: "AB",
			lastRunAt: null,
			lastRunOutcome: null,
			nextRunAt: null,
		},
	],
};

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderAtPath(path: string, data: TeamDetail = TEAM_DATA): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route path="/work/team/:teamId" element={<WorkTeam overrideData={data} skipArtifacts />} />
			</Routes>
		</MemoryRouter>,
	);
}

beforeEach(() => {
	mockApiFetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
});

afterEach(() => {
	vi.restoreAllMocks();
	mockApiFetch.mockReset();
});

// ---------------------------------------------------------------------------
// AC-1: ?routine=r1 → SplitView present + RoutineDetailPane in destination
// ---------------------------------------------------------------------------

describe("routine split-pane opens when ?routine param is present in the URL", () => {
	it("[RED] renders [data-ds-component='split-view'] when ?routine=r1 is in the URL", async () => {
		renderAtPath("/work/team/t1?routine=r1");

		await waitFor(() => {
			const splitView = document.querySelector('[data-ds-component="split-view"]');
			expect(splitView).not.toBeNull();
		});
	});

	it("[RED] RoutineDetailPane is rendered inside the split view destination", async () => {
		renderAtPath("/work/team/t1?routine=r1");

		await waitFor(() => {
			expect(screen.getByTestId("routine-detail-pane")).toBeInTheDocument();
		});
	});

	it("[RED] RoutineDetailPane receives the correct routineId prop", async () => {
		renderAtPath("/work/team/t1?routine=r1");

		await waitFor(() => {
			const pane = screen.getByTestId("routine-detail-pane");
			expect(pane.getAttribute("data-routine-id")).toBe("r1");
		});
	});

	it("[RED] no split-view when no ?routine or ?agent param (no-selection path unchanged)", () => {
		renderAtPath("/work/team/t1");
		const splitView = document.querySelector('[data-ds-component="split-view"]');
		expect(splitView).toBeNull();
	});

	it("existing work-team-page testid still present when ?routine is set", async () => {
		renderAtPath("/work/team/t1?routine=r1");

		await waitFor(() => {
			// @lore AZ2: work-team-page now lives on the outer PageScaffold root
			// (consistent across every WorkTeam branch), not inside the SplitView
			// origin pane — the split state uses PageScaffold's "managed" body, so
			// the scaffold's own scroll contract (`data-page-scroll`) is absent here
			// on purpose; SplitView's origin wrapper owns the scroll instead.
			expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
		});
	});

	it("[RED] persisted-ratio wiring: SplitView dividerRatio reflects useUiPreference('work.routine') value", async () => {
		// Seed localStorage before mount so the hook reads it.
		localStorage.setItem("hyperidle.split.work.routine", "0.6");

		renderAtPath("/work/team/t1?routine=r1");

		await waitFor(() => {
			// The split-view must be present.
			const splitView = document.querySelector('[data-ds-component="split-view"]');
			expect(splitView).not.toBeNull();
		});

		// The origin card flex-basis should reflect ratio=0.6 (60%).
		// SplitView renders origin with style flexBasis `${ratio * 100}%` in split mode.
		const originCard = document.querySelector('[data-ds-component="split-view"] > div:first-child');
		expect(originCard).not.toBeNull();
		expect((originCard as HTMLElement).style.flexBasis).toBe("60%");

		localStorage.removeItem("hyperidle.split.work.routine");
	});
});

// ---------------------------------------------------------------------------
// AC-3: ?agent=a1 → AgentDetailPane in SplitView + no role="dialog"
// ---------------------------------------------------------------------------

describe("agent split-pane opens when ?agent param is present in the URL", () => {
	it("[RED] renders [data-ds-component='split-view'] when ?agent=a1 is in the URL", async () => {
		renderAtPath("/work/team/t1?agent=a1");

		await waitFor(() => {
			const splitView = document.querySelector('[data-ds-component="split-view"]');
			expect(splitView).not.toBeNull();
		});
	});

	it("[RED] AgentDetailPane is rendered inside the split view destination", async () => {
		renderAtPath("/work/team/t1?agent=a1");

		await waitFor(() => {
			expect(screen.getByTestId("agent-detail-pane")).toBeInTheDocument();
		});
	});

	it("[RED] no role='dialog' anywhere in the tree when agent pane is open (Dialog shell stripped)", async () => {
		renderAtPath("/work/team/t1?agent=a1");

		await waitFor(() => {
			expect(screen.getByTestId("agent-detail-pane")).toBeInTheDocument();
		});

		const dialogs = document.querySelectorAll('[role="dialog"]');
		expect(dialogs.length).toBe(0);
	});

	it("[RED] 'Customize' button click sets ?agent search param (not a modal)", async () => {
		const user = userEvent.setup();
		renderAtPath("/work/team/t1");

		// Wait for the customize button to be rendered
		const customizeBtn = await waitFor(() => screen.getByTestId("agent-customize-btn"));

		await user.click(customizeBtn);

		await waitFor(() => {
			// After click, AgentDetailPane should appear (no modal)
			expect(screen.getByTestId("agent-detail-pane")).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// AC-1: AG1 contract not broken — work-team-page DOM unchanged when no selection
// ---------------------------------------------------------------------------

describe("no-selection path DOM contract, reconciled onto PageScaffold (AZ2)", () => {
	// @lore AZ2: these two used to assert `outer.className` (the testid'd
	// element) directly contained `overflow-y-auto` / `max-w-[960px]`. Since
	// WorkTeam now composes <PageScaffold>, the testid lives on the scaffold's
	// ROOT (`flex flex-col h-full`) and the scroll body is PageScaffold's own
	// `[data-page-scroll]` element — a component's classes come from what the
	// component renders, never from what a test demands (round.md §6 risk 1).
	// These assert the scaffold CONTRACT (the `data-page-scroll` marker) in
	// place of the class literal.
	it("the team page's scroll body carries data-page-scroll with overflow-y-auto when no selection", () => {
		const { container } = renderAtPath("/work/team/t1");
		const scroller = container.querySelector("[data-page-scroll]");
		expect(scroller).not.toBeNull();
		expect(scroller?.className).toContain("overflow-y-auto");
	});

	it("the no-selection body keeps 960px measure inside the stable page frame", () => {
		const { container } = renderAtPath("/work/team/t1");
		const inner = container.querySelector("[data-page-scroll] [data-page-frame] > div");
		expect(inner?.className).toContain("max-w-[960px]");
		expect(inner?.className).not.toContain("mx-auto");
	});
});
