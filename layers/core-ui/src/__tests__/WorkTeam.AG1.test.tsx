/**
 * AG1 — WorkTeam desktop composition: RED phase tests.
 *
 * AC coverage:
 * AC-1: 1280–2560px — sections visible, no clipped text, no row exceeds readable measure.
 *        Composition test: content column wrapper exists with expected classes.
 * AC-2: Related values read paired — stat tiles each render label+value together.
 * AC-3: Empty team looks intentional — Status tile MUST read "—" / "No agents",
 *        NOT "Healthy". All tiles always render. Every section header+empty present.
 * AC-4: Narrow layout + all behaviors unchanged — existing testids preserved.
 *        (Existing AA1/AB2/AB3 tests cover the rest; this file adds the new tile ACs.)
 *
 * Status of each test:
 * [RED]   = new AG1 assertion — will FAIL until implementation (T2)
 * [GREEN] = asserts preserved existing behavior — expected to pass now
 *
 * @lore AG1: stat tiles (Capacity, Status) replace the KeyValue list in the
 * burn section. The Status tile is mandatory — empty roster → "—" / "No agents",
 * never "Healthy". See plans/AG1/design/approved.md §2 + §4a.
 *
 * @lore AU21 Increment 14a: the Burn/Cap tiles this file originally covered
 * are HARD-DELETED along with the rest of the cost-cap feature — no
 * replacement. Only Capacity/Status remain.
 */

import type { RosterMember, TeamDetail } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

// ---------------------------------------------------------------------------
// Mocks (mirror AB2 pattern)
// ---------------------------------------------------------------------------

vi.mock("../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: vi.fn() })),
	};
});

vi.mock("../hooks/useTeamAgents", () => ({
	useTeamAgents: vi.fn().mockReturnValue({ agents: new Map(), refetch: vi.fn() }),
}));

vi.mock("../hooks/useHints", () => ({
	useHint: vi.fn().mockReturnValue({ visible: false, testId: "hint", copy: "", dismiss: vi.fn() }),
}));

// @lore AU26 J4: the roster's run state is fetched from `agent-orchestration`
// (`useRosterRunState`), not stamped onto `RosterMember` by core-api. Stub the
// hook with the values the wire fixtures used to carry — the row's rendering
// contract is what these tests cover and it is unchanged.
const ROSTER_RUN_STATE = new Map<string, unknown>([
	[
		"agent-h",
		{
			operationalStatus: "active",
			healthLevel: "healthy",
			healthDetail: "Healthy",
			activeTaskTitle: null,
			activeTaskId: null,
			activeBetId: null,
		},
	],
	[
		"agent-w",
		{
			operationalStatus: "idle",
			healthLevel: "warning",
			healthDetail: "2 of 6 sessions failed",
			activeTaskTitle: null,
			activeTaskId: null,
			activeBetId: null,
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Healthy roster member */
const AGENT_HEALTHY: RosterMember = {
	agentId: "agent-h",
	name: "Healthy Agent",
	role: "builder",
	isLead: true,
	agentCategory: "team",
};

/** Warning-health roster member — triggers "Attention" on Status tile */
const AGENT_WARNING: RosterMember = {
	agentId: "agent-w",
	name: "Warning Agent",
	role: "builder",
	isLead: false,
	agentCategory: "team",
};

/** Base fixture: populated team with bets, routines, and 2-member roster */
const POPULATED_TEAM: TeamDetail = {
	team: {
		id: "team-ag1",
		name: "AG1 Team",
		phase: "build",
		status: "healthy",
		leadAgentId: "agent-h",
	},
	teamMembers: {
		id: "tm-ag1",
		formedAt: "2026-01-01T00:00:00.000Z",
		dissolvedAt: null,
	},
	roster: [AGENT_HEALTHY, AGENT_WARNING],
	burn: {
		capacity: 5,
		activeBets: 2,
	},
	activeBets: [
		{
			id: "bet-1",
			descriptionTitle: "Auth migration",
			status: "active",
			progressDone: 1,
			progressTotal: 2,
		},
	],
	routines: [
		{
			id: "routine-1",
			name: "Daily digest",
			state: "active",
			scheduleLabel: "Every day at 8:00 AM",
			agentName: "Healthy Agent",
			agentInitials: "HA",
			lastRunAt: "2026-01-01T08:00:00.000Z",
			lastRunOutcome: "success",
			nextRunAt: "2026-01-02T08:00:00.000Z",
		},
	],
};

/** Empty team: no bets, no routines, no roster */
const EMPTY_TEAM: TeamDetail = {
	team: {
		id: "team-ag1-empty",
		name: "Empty Team",
		phase: "build",
		status: "healthy",
		leadAgentId: null,
	},
	teamMembers: {
		id: "tm-ag1-empty",
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

/** Team with all-healthy roster */
const TEAM_ALL_HEALTHY: TeamDetail = {
	...POPULATED_TEAM,
	roster: [AGENT_HEALTHY],
};

/** Team with one warning agent — Status → "Attention" */
const TEAM_WITH_WARNING: TeamDetail = {
	...POPULATED_TEAM,
	roster: [AGENT_HEALTHY, AGENT_WARNING],
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(data: TeamDetail | null = POPULATED_TEAM): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/work/team/team-ag1"]}>
			<Routes>
				<Route
					path="/work/team/:teamId"
					element={<WorkTeam overrideData={data} overrideLoading={false} skipArtifacts={true} />}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// AC-1: Composition — content column wrapper (desktop width capping)
// [RED] — new wrapper class assertions; fail until T2a lands
// ---------------------------------------------------------------------------

describe("AG1 AC-1 — desktop content column wrapper", () => {
	it("[RED] renders a scroll body with flex-1 overflow-y-auto on work-team-page outer div", () => {
		renderPage(POPULATED_TEAM);
		const outer = screen.getByTestId("work-team-page");
		// AG1 T2a: outer element must be the scroll body, not the old flex flex-col h-full
		expect(outer.className).toContain("overflow-y-auto");
	});

	it("[RED] renders an inner content column with max-w-[960px]", () => {
		renderPage(POPULATED_TEAM);
		const outer = screen.getByTestId("work-team-page");
		// The inner column child must cap at 960px
		const inner = outer.firstElementChild;
		expect(inner).not.toBeNull();
		expect(inner?.className).toContain("max-w-[960px]");
	});

	it("[RED] inner column has centered auto margins (mx-auto)", () => {
		renderPage(POPULATED_TEAM);
		const outer = screen.getByTestId("work-team-page");
		const inner = outer.firstElementChild;
		expect(inner?.className).toContain("mx-auto");
	});

	it("[GREEN] work-team-page testid is present in populated state", () => {
		renderPage(POPULATED_TEAM);
		expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
	});

	it("[GREEN] work-team-page testid is present in loading state", () => {
		render(
			<MemoryRouter initialEntries={["/work/team/team-ag1"]}>
				<Routes>
					<Route
						path="/work/team/:teamId"
						element={
							<WorkTeam overrideData={POPULATED_TEAM} overrideLoading={true} skipArtifacts />
						}
					/>
				</Routes>
			</MemoryRouter>,
		);
		expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
	});

	it("[GREEN] work-team-page testid is present in null/404 state", () => {
		renderPage(null);
		expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
		expect(screen.getByTestId("team-not-found")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-2: 4 stat tiles — each tile has a paired label and value
// [RED] — new tile assertions; the KeyValue list doesn't have testid="stat-tile-*"
// ---------------------------------------------------------------------------

// @lore AU21 Increment 14a: the "Burn"/"Cap" stat tiles are HARD-DELETED
// along with the rest of the cost-cap feature — the burn section now renders
// 2 stat tiles (Capacity, Status), not 4, no replacement.
describe("AG1 AC-2 — stat tiles in burn section", () => {
	it("[RED] renders a tile labeled 'Capacity' inside team-burn-vs-cap", () => {
		renderPage(POPULATED_TEAM);
		const section = screen.getByTestId("team-burn-vs-cap");
		const label = Array.from(section.querySelectorAll("span")).find(
			(el) => el.textContent?.trim().toUpperCase() === "CAPACITY",
		);
		expect(label).toBeDefined();
	});

	it("[RED] renders a tile labeled 'Status' inside team-burn-vs-cap (mandatory 2nd tile)", () => {
		renderPage(POPULATED_TEAM);
		const section = screen.getByTestId("team-burn-vs-cap");
		const label = Array.from(section.querySelectorAll("span")).find(
			(el) => el.textContent?.trim().toUpperCase() === "STATUS",
		);
		expect(label).toBeDefined();
	});

	it("[RED] renders exactly 2 stat tiles in a flex row", () => {
		renderPage(POPULATED_TEAM);
		// The architecture defines testid="stat-tile" on each tile div
		const tiles = screen.getAllByTestId("stat-tile");
		expect(tiles).toHaveLength(2);
	});

	it("[RED] each stat tile renders both a label span and a value span", () => {
		renderPage(POPULATED_TEAM);
		const tiles = screen.getAllByTestId("stat-tile");
		for (const tile of tiles) {
			const spans = tile.querySelectorAll("span");
			// Every tile must have at least 2 spans: label + value
			expect(spans.length).toBeGreaterThanOrEqual(2);
		}
	});

	it("[GREEN] team-burn-vs-cap section is present", () => {
		renderPage(POPULATED_TEAM);
		expect(screen.getByTestId("team-burn-vs-cap")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-3: Empty team — Status tile reads "—" / "No agents" (NOT "Healthy")
// [RED] — new empty-roster assertion for Status tile value and sublabel
// ---------------------------------------------------------------------------

describe("AG1 AC-3 — empty team status tile", () => {
	it("[RED] Status tile shows '—' value when roster is empty (NOT 'Healthy')", () => {
		renderPage(EMPTY_TEAM);
		const section = screen.getByTestId("team-burn-vs-cap");
		// The Status tile value text must be the neutral dash, not "Healthy"
		// Find the value span that follows the "STATUS" label span within a tile
		const tiles = section.querySelectorAll("[data-testid='stat-tile']");
		const statusTile = Array.from(tiles).find((tile) =>
			Array.from(tile.querySelectorAll("span")).some(
				(s) => s.textContent?.trim().toUpperCase() === "STATUS",
			),
		);
		expect(statusTile).toBeDefined();
		const valueSpan = statusTile?.querySelectorAll("span")[1];
		expect(valueSpan?.textContent?.trim()).toBe("—");
	});

	it("[RED] Status tile shows 'No agents' sublabel when roster is empty", () => {
		renderPage(EMPTY_TEAM);
		const section = screen.getByTestId("team-burn-vs-cap");
		// Sublabel "No agents" must appear within the status tile
		const tiles = section.querySelectorAll("[data-testid='stat-tile']");
		const statusTile = Array.from(tiles).find((tile) =>
			Array.from(tile.querySelectorAll("span")).some(
				(s) => s.textContent?.trim().toUpperCase() === "STATUS",
			),
		);
		expect(statusTile?.textContent).toContain("No agents");
	});

	it("[RED] empty roster — Status tile must NOT contain the text 'Healthy'", () => {
		renderPage(EMPTY_TEAM);
		const section = screen.getByTestId("team-burn-vs-cap");
		const tiles = section.querySelectorAll("[data-testid='stat-tile']");
		const statusTile = Array.from(tiles).find((tile) =>
			Array.from(tile.querySelectorAll("span")).some(
				(s) => s.textContent?.trim().toUpperCase() === "STATUS",
			),
		);
		// Must not read "Healthy" — that would be a false positive on an agentless team
		expect(statusTile?.textContent).not.toContain("Healthy");
	});

	it("[RED] all 2 tiles render even when the team is empty (no 1-tile fallback)", () => {
		renderPage(EMPTY_TEAM);
		const tiles = screen.getAllByTestId("stat-tile");
		expect(tiles).toHaveLength(2);
	});

	it("[GREEN] team-active-bets-empty shows when activeBets is empty", () => {
		renderPage(EMPTY_TEAM);
		expect(screen.getByTestId("team-active-bets-empty")).toBeInTheDocument();
	});

	it("[GREEN] team-routines-empty shows when routines is empty", () => {
		renderPage(EMPTY_TEAM);
		expect(screen.getByTestId("team-routines-empty")).toBeInTheDocument();
	});

	it("[GREEN] team-agents section shows when roster is empty", () => {
		renderPage(EMPTY_TEAM);
		expect(screen.getByTestId("team-agents")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-3: Populated roster — Status tile shows "Healthy" / "Attention"
// [RED] — new tile value assertions for non-empty roster
// ---------------------------------------------------------------------------

describe("AG1 AC-3 — populated roster status tile values", () => {
	it("[RED] Status tile shows 'Healthy' when all roster members have healthy healthLevel", () => {
		renderPage(TEAM_ALL_HEALTHY);
		const section = screen.getByTestId("team-burn-vs-cap");
		const tiles = section.querySelectorAll("[data-testid='stat-tile']");
		const statusTile = Array.from(tiles).find((tile) =>
			Array.from(tile.querySelectorAll("span")).some(
				(s) => s.textContent?.trim().toUpperCase() === "STATUS",
			),
		);
		const valueSpan = statusTile?.querySelectorAll("span")[1];
		expect(valueSpan?.textContent?.trim()).toBe("Healthy");
	});

	it("[RED] Status tile shows 'Attention' when any roster member has warning/critical healthLevel", () => {
		renderPage(TEAM_WITH_WARNING);
		const section = screen.getByTestId("team-burn-vs-cap");
		const tiles = section.querySelectorAll("[data-testid='stat-tile']");
		const statusTile = Array.from(tiles).find((tile) =>
			Array.from(tile.querySelectorAll("span")).some(
				(s) => s.textContent?.trim().toUpperCase() === "STATUS",
			),
		);
		const valueSpan = statusTile?.querySelectorAll("span")[1];
		expect(valueSpan?.textContent?.trim()).toBe("Attention");
	});

	it("[RED] Status tile shows idle agent count in sublabel for non-empty roster", () => {
		// TEAM_WITH_WARNING: AGENT_WARNING has operationalStatus="idle"
		renderPage(TEAM_WITH_WARNING);
		const section = screen.getByTestId("team-burn-vs-cap");
		const tiles = section.querySelectorAll("[data-testid='stat-tile']");
		const statusTile = Array.from(tiles).find((tile) =>
			Array.from(tile.querySelectorAll("span")).some(
				(s) => s.textContent?.trim().toUpperCase() === "STATUS",
			),
		);
		// sublabel should contain "idle agents" (count may vary)
		expect(statusTile?.textContent).toMatch(/idle agent/i);
	});
});

// ---------------------------------------------------------------------------
// AC-4: All existing 18 testids preserved
// [GREEN] — existing testids must still render post-recomposition
// ---------------------------------------------------------------------------

describe("AG1 AC-4 — all existing testids preserved (Tier 1 — test-asserted)", () => {
	it("[GREEN] work-team-page present (Tier 1)", () => {
		renderPage(POPULATED_TEAM);
		expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
	});

	it("[GREEN] team-burn-vs-cap present (Tier 1)", () => {
		renderPage(POPULATED_TEAM);
		expect(screen.getByTestId("team-burn-vs-cap")).toBeInTheDocument();
	});

	it("[GREEN] team-active-bets present (Tier 1)", () => {
		renderPage(POPULATED_TEAM);
		expect(screen.getByTestId("team-active-bets")).toBeInTheDocument();
	});

	it("[GREEN] team-active-bets-empty present when no bets (Tier 1)", () => {
		renderPage(EMPTY_TEAM);
		expect(screen.getByTestId("team-active-bets-empty")).toBeInTheDocument();
	});

	it("[GREEN] team-routines present (Tier 1)", () => {
		renderPage(POPULATED_TEAM);
		expect(screen.getByTestId("team-routines")).toBeInTheDocument();
	});

	it("[GREEN] team-routines-empty present when no routines (Tier 1)", () => {
		renderPage(EMPTY_TEAM);
		expect(screen.getByTestId("team-routines-empty")).toBeInTheDocument();
	});

	it("[GREEN] team-agents present (Tier 1)", () => {
		renderPage(POPULATED_TEAM);
		expect(screen.getByTestId("team-agents")).toBeInTheDocument();
	});

	it("[GREEN] agent-row present for each roster member (Tier 1)", () => {
		renderPage(POPULATED_TEAM);
		const rows = screen.getAllByTestId("agent-row");
		expect(rows).toHaveLength(2);
	});

	it("[GREEN] team-breadcrumb-back present (Tier 1)", () => {
		renderPage(POPULATED_TEAM);
		expect(screen.getByTestId("team-breadcrumb-back")).toBeInTheDocument();
	});

	it("[GREEN] team-not-found present when data is null (Tier 1)", () => {
		renderPage(null);
		expect(screen.getByTestId("team-not-found")).toBeInTheDocument();
	});
});

describe("AG1 AC-4 — existing testids preserved (Tier 2 — silent, no CI net)", () => {
	it("[GREEN] new-routine-btn present (Tier 2)", () => {
		renderPage(POPULATED_TEAM);
		expect(screen.getByTestId("new-routine-btn")).toBeInTheDocument();
	});

	it("[GREEN] add-agent-btn present (Tier 2)", () => {
		renderPage(POPULATED_TEAM);
		expect(screen.getByTestId("add-agent-btn")).toBeInTheDocument();
	});
});
