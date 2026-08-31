/**
 * AG1 — WorkTeam desktop composition: RED phase tests.
 *
 * AC coverage:
 * AC-1: 1280–2560px — sections visible, no clipped text, no row exceeds readable measure.
 *        Composition test: content column wrapper exists with expected classes.
 * AC-2: Related values read paired — stat tiles each render label+value together.
 * AC-3: Empty team looks intentional — Agent Health tile MUST read "—" / "No agents",
 *        NOT "On track". All tiles always render. Every section header+empty present.
 * AC-4: Narrow layout + all behaviors unchanged — existing testids preserved.
 *        (Existing AA1/AB2/AB3 tests cover the rest; this file adds the new tile ACs.)
 *
 * Status of each test:
 * [RED]   = new AG1 assertion — will FAIL until implementation (T2)
 * [GREEN] = asserts preserved existing behavior — expected to pass now
 *
 * @lore AG1: stat tiles (Capacity, Agent Health) replace the KeyValue list in
 * the burn section. The Agent Health tile is mandatory — empty roster →
 * "—" / "No agents", never "On track".
 * Renamed from "Status" to "Agent Health" in AZ7 B4 — see WorkTeam.tsx's tile
 * comment for why.
 *
 * @lore AU21 Increment 14a: the Burn/Cap tiles this file originally covered
 * are HARD-DELETED along with the rest of the cost-cap feature — no
 * replacement. Only Capacity/Agent Health remain.
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

/** Warning-health roster member — triggers "Needs attention" on the Agent Health tile (AZ7 B4: this tile's own vocabulary, distinct from team.status's chip words) */
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

/** Team with one warning agent — Agent Health → "Needs attention" (AZ7 B4) */
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
	// @lore AZ2: WorkTeam now composes <PageScaffold>, which owns the scroll
	// contract. `data-testid="work-team-page"` moved to the scaffold's ROOT
	// (`flex flex-col h-full`) — consistent with every other WorkTeam branch,
	// which already carried it there. The scroll body itself is
	// PageScaffold's own `[data-page-scroll]` element; these assertions moved
	// there instead of pinning class literals on the outer testid'd element.
	it("renders a scroll body carrying data-page-scroll with overflow-y-auto (PageScaffold's contract)", () => {
		const { container } = renderPage(POPULATED_TEAM);
		const scroller = container.querySelector("[data-page-scroll]");
		expect(scroller).not.toBeNull();
		expect(scroller?.className).toContain("overflow-y-auto");
	});

	it("renders an inner content column with max-w-[960px]", () => {
		const { container } = renderPage(POPULATED_TEAM);
		const inner = container.querySelector("[data-page-scroll] [data-page-frame] > div");
		expect(inner).not.toBeNull();
		expect(inner?.className).toContain("max-w-[960px]");
	});

	it("inner column starts in the stable page frame", () => {
		const { container } = renderPage(POPULATED_TEAM);
		const inner = container.querySelector("[data-page-scroll] [data-page-frame] > div");
		expect(inner?.className).not.toContain("mx-auto");
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

	it("[RED] renders a tile labeled 'Agent Health' inside team-burn-vs-cap (mandatory 2nd tile)", () => {
		renderPage(POPULATED_TEAM);
		const section = screen.getByTestId("team-burn-vs-cap");
		const label = Array.from(section.querySelectorAll("span")).find(
			(el) => el.textContent?.trim().toUpperCase() === "AGENT HEALTH",
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

describe("AG1 AC-3 — empty team agent-health tile", () => {
	it("[RED] Agent Health tile shows '—' value when roster is empty (NOT 'On track')", () => {
		renderPage(EMPTY_TEAM);
		const section = screen.getByTestId("team-burn-vs-cap");
		// The Agent Health tile value text must be the neutral dash, not "On track"
		// Find the value span that follows the "AGENT HEALTH" label span within a tile
		const tiles = section.querySelectorAll("[data-testid='stat-tile']");
		const statusTile = Array.from(tiles).find((tile) =>
			Array.from(tile.querySelectorAll("span")).some(
				(s) => s.textContent?.trim().toUpperCase() === "AGENT HEALTH",
			),
		);
		expect(statusTile).toBeDefined();
		const valueSpan = statusTile?.querySelectorAll("span")[1];
		expect(valueSpan?.textContent?.trim()).toBe("—");
	});

	it("[RED] Agent Health tile shows 'No agents' sublabel when roster is empty", () => {
		renderPage(EMPTY_TEAM);
		const section = screen.getByTestId("team-burn-vs-cap");
		// Sublabel "No agents" must appear within the tile
		const tiles = section.querySelectorAll("[data-testid='stat-tile']");
		const statusTile = Array.from(tiles).find((tile) =>
			Array.from(tile.querySelectorAll("span")).some(
				(s) => s.textContent?.trim().toUpperCase() === "AGENT HEALTH",
			),
		);
		expect(statusTile?.textContent).toContain("No agents");
	});

	it("[RED] empty roster — Agent Health tile must NOT contain the text 'On track'", () => {
		renderPage(EMPTY_TEAM);
		const section = screen.getByTestId("team-burn-vs-cap");
		const tiles = section.querySelectorAll("[data-testid='stat-tile']");
		const statusTile = Array.from(tiles).find((tile) =>
			Array.from(tile.querySelectorAll("span")).some(
				(s) => s.textContent?.trim().toUpperCase() === "AGENT HEALTH",
			),
		);
		// Must not read "On track" — that would be a false positive on an agentless team
		expect(statusTile?.textContent).not.toContain("On track");
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
// AC-3: Populated roster — Agent Health tile shows "On track" / "Needs attention"
// [RED] — new tile value assertions for non-empty roster
//
// @lore AZ7 B4: values and label deliberately do NOT reuse team.status's
// vocabulary ("healthy" | "behind" | "blocked", core-api's deriveTeamStatus) —
// this tile rolls up a different signal (per-agent RosterRunState.healthLevel)
// and must not read as a second, possibly-contradicting opinion on the header
// StatusChip's word. See WorkTeam.tsx's Agent Health tile comment.
// ---------------------------------------------------------------------------

describe("AG1 AC-3 — populated roster agent-health tile values", () => {
	it("[RED] Agent Health tile shows 'On track' when all roster members have healthy healthLevel", () => {
		renderPage(TEAM_ALL_HEALTHY);
		const section = screen.getByTestId("team-burn-vs-cap");
		const tiles = section.querySelectorAll("[data-testid='stat-tile']");
		const statusTile = Array.from(tiles).find((tile) =>
			Array.from(tile.querySelectorAll("span")).some(
				(s) => s.textContent?.trim().toUpperCase() === "AGENT HEALTH",
			),
		);
		const valueSpan = statusTile?.querySelectorAll("span")[1];
		expect(valueSpan?.textContent?.trim()).toBe("On track");
	});

	it("[RED] Agent Health tile shows 'Needs attention' when any roster member has warning/critical healthLevel", () => {
		renderPage(TEAM_WITH_WARNING);
		const section = screen.getByTestId("team-burn-vs-cap");
		const tiles = section.querySelectorAll("[data-testid='stat-tile']");
		const statusTile = Array.from(tiles).find((tile) =>
			Array.from(tile.querySelectorAll("span")).some(
				(s) => s.textContent?.trim().toUpperCase() === "AGENT HEALTH",
			),
		);
		const valueSpan = statusTile?.querySelectorAll("span")[1];
		expect(valueSpan?.textContent?.trim()).toBe("Needs attention");
	});

	it("[RED] Agent Health tile shows idle agent count in sublabel for non-empty roster", () => {
		// TEAM_WITH_WARNING: AGENT_WARNING has operationalStatus="idle"
		renderPage(TEAM_WITH_WARNING);
		const section = screen.getByTestId("team-burn-vs-cap");
		const tiles = section.querySelectorAll("[data-testid='stat-tile']");
		const statusTile = Array.from(tiles).find((tile) =>
			Array.from(tile.querySelectorAll("span")).some(
				(s) => s.textContent?.trim().toUpperCase() === "AGENT HEALTH",
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

// ---------------------------------------------------------------------------
// NEW-29 — agent profile page is reachable via a real <a href> link
// ---------------------------------------------------------------------------

describe("NEW-29 — agent roster row has a real <a href> link to the agent profile", () => {
	it("each agent row in the roster has an anchor link to /agents/:agentId", () => {
		renderPage(POPULATED_TEAM);

		const profileLinks = screen.getAllByTestId("agent-profile-link");
		expect(profileLinks).toHaveLength(POPULATED_TEAM.roster.length);

		for (const member of POPULATED_TEAM.roster) {
			const link = profileLinks.find((el) =>
				el.getAttribute("href")?.includes(encodeURIComponent(member.agentId)),
			);
			expect(link).not.toBeUndefined();
			expect(link?.tagName).toBe("A");
			expect(link?.getAttribute("href")).toBe(`/agents/${encodeURIComponent(member.agentId)}`);
		}
	});
});
