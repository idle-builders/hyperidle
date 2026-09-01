/**
 * AG6 — WorkTeam migration: Row primitive integration tests (red phase).
 *
 * AC-2: WorkTeam agents+routines render through Row/ItemList, not bespoke rows.
 * AC-3: Rows share one treatment — each row carries data-ds-component=Row.
 * AC-4: New list = compose primitive; bespoke rows removed.
 *
 * Protected testids (AA1/AB2/AB3) must survive migration:
 *   agent-row, agent-status, agent-context, agent-customize-btn,
 *   agent-card-category, routine-row, team-routines-empty.
 *
 * Tests FAIL until T6 (agent migration) and T7 (routine migration) are complete.
 */

import type { RosterMember, TeamDetail } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

vi.mock("../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../shell/ToastRegion.js");
	return { ...actual, useToast: vi.fn(() => ({ showToast: vi.fn() })) };
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
		"agent-1",
		{
			operationalStatus: "idle",
			healthLevel: "healthy",
			healthDetail: "Healthy",
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

const AGENT: RosterMember = {
	agentId: "agent-1",
	name: "Builder Agent",
	role: "builder",
	isLead: false,
	agentCategory: "team",
};

const TEAM: TeamDetail = {
	team: {
		id: "team-ag6",
		name: "AG6 Team",
		phase: "build",
		status: "healthy",
		leadAgentId: null,
	},
	teamMembers: {
		id: "tm-ag6",
		formedAt: "2026-01-01T00:00:00.000Z",
		dissolvedAt: null,
	},
	roster: [AGENT],
	burn: {
		capacity: 5,
	},
	tasksInProgress: [],
	routines: [
		{
			id: "routine-1",
			name: "Daily digest",
			state: "active",
			scheduleLabel: "Every day at 8:00 AM",
			agentName: "Builder Agent",
			agentInitials: "BA",
			lastRunAt: "2026-01-01T08:00:00.000Z",
			lastRunOutcome: "success",
			nextRunAt: "2026-01-02T08:00:00.000Z",
		},
	],
};

function renderPage(data: TeamDetail = TEAM) {
	return render(
		<MemoryRouter initialEntries={["/work/team/team-ag6"]}>
			<Routes>
				<Route
					path="/work/team/:teamId"
					element={<WorkTeam overrideData={data} overrideLoading={false} skipArtifacts />}
				/>
				<Route path="/agents/:id" element={<div data-testid="agent-profile" />} />
				<Route path="/work/routine/:id" element={<div data-testid="routine-page" />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ── AC-2: Agent rows rendered via Row primitive ──────────────────────────────

describe("AG6 AC-2 — agent rows via Row primitive (T6)", () => {
	it("agent rows carry data-ds-component=Row marker", () => {
		renderPage();
		const agentRows = screen.getAllByTestId("agent-row");
		expect(agentRows.length).toBeGreaterThan(0);
		// Every agent-row must be (or be inside) a Row primitive
		for (const row of agentRows) {
			const rowEl = row.closest("[data-ds-component='Row']") ?? row;
			expect(rowEl.getAttribute("data-ds-component")).toBe("Row");
		}
	});

	// Protected testids (AB2/AB3) must survive migration
	it("agent-status testid preserved after migration (AB2 protected)", () => {
		renderPage();
		const statusEls = screen.getAllByTestId("agent-status");
		expect(statusEls.length).toBeGreaterThan(0);
	});

	it("agent-context testid preserved after migration (AB2 protected)", () => {
		renderPage();
		const contextEls = screen.getAllByTestId("agent-context");
		expect(contextEls.length).toBeGreaterThan(0);
	});

	it("agent-customize-btn testid preserved after migration (AB2/AB3 protected)", () => {
		renderPage();
		const btns = screen.getAllByTestId("agent-customize-btn");
		expect(btns.length).toBeGreaterThan(0);
	});

	it("agent-card-category is the FIRST cell in agent rows (AB3 protected — position matters)", () => {
		const teamWithCategory: TeamDetail = {
			...TEAM,
			// @lore BA9d: "strategy" deleted; individual is the non-team category for category-tag test.
			roster: [{ ...AGENT, agentId: "ind-1", name: "Ind Agent", agentCategory: "individual" }],
		};
		renderPage(teamWithCategory);
		const rows = screen.getAllByTestId("agent-row");
		expect(rows.length).toBeGreaterThan(0);
		const firstRow = rows[0] as HTMLElement;
		// category tag must appear before status in DOM order
		const categoryEl = firstRow.querySelector("[data-testid='agent-card-category']");
		const statusEl = firstRow.querySelector("[data-testid='agent-status']");
		expect(categoryEl).not.toBeNull();
		expect(statusEl).not.toBeNull();
		// category comes before status in DOM order
		const allTestIds = Array.from(firstRow.querySelectorAll("[data-testid]")).map(
			(el) => el.getAttribute("data-testid") ?? "",
		);
		const catIdx = allTestIds.indexOf("agent-card-category");
		const statIdx = allTestIds.indexOf("agent-status");
		expect(catIdx).toBeGreaterThanOrEqual(0);
		expect(catIdx).toBeLessThan(statIdx);
	});
});

// ── C1: isLead=true renders " — Lead" text, no literal quote glyphs ──────────

describe("AG6 C1 — lead agent marker renders without literal quote characters", () => {
	it("lead marker renders ' — Lead' (no surrounding quote glyphs) when isLead=true", () => {
		const teamWithLead: TeamDetail = {
			...TEAM,
			roster: [{ ...AGENT, agentId: "lead-1", name: "Builder Agent", isLead: true }],
		};
		renderPage(teamWithLead);
		const agentRows = screen.getAllByTestId("agent-row");
		expect(agentRows.length).toBeGreaterThan(0);
		const leadRow = agentRows[0] as HTMLElement;
		const text = leadRow.textContent ?? "";
		// Must contain the em-dash lead marker (with or without leading space — ml-1 provides visual spacing)
		expect(text).toMatch(/— Lead/);
		// Must NOT contain literal quote characters adjacent to the marker
		expect(text).not.toMatch(/"[^"]*—[^"]*Lead[^"]*"/);
		expect(text).not.toContain('" — Lead"');
	});
});

// ── AC-2: Routine rows rendered via Row primitive ────────────────────────────

describe("AG6 AC-2 — routine rows via Row primitive (T7)", () => {
	it("routine rows carry data-ds-component=Row marker", () => {
		renderPage();
		const routineRows = screen.getAllByTestId("routine-row");
		expect(routineRows.length).toBeGreaterThan(0);
		for (const row of routineRows) {
			const rowEl = row.closest("[data-ds-component='Row']") ?? row;
			expect(rowEl.getAttribute("data-ds-component")).toBe("Row");
		}
	});

	// Protected testid (AA1) must survive
	it("routine-row testid preserved (AA1 protected)", () => {
		renderPage();
		const rows = screen.getAllByTestId("routine-row");
		expect(rows.length).toBeGreaterThan(0);
	});

	it("team-routines-empty testid preserved when routines array is empty (AA1 protected)", () => {
		renderPage({ ...TEAM, routines: [] });
		expect(screen.getByTestId("team-routines-empty")).toBeInTheDocument();
	});
});
