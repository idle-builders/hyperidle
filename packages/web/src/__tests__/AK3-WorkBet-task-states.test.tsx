/**
 * AK3 RED — WorkBet four-state tasks section component tests.
 *
 * Tests cover:
 *   AC3 — Bet surface reflects real task state (never permanent false promise):
 *          (a) decompositionStatus='running', 0 tasks → bet-tasks-decomposing
 *          (b) tasks > 0 (any status) → task-row list (even on a draft bet)
 *          (c) the permanent "Tasks will appear" EmptyState is gone
 *   AC4 — no_eligible_agent blocker → bet-tasks-blocked + "Add an agent" link → /work/team/:teamId
 *   AC4 — empty/failed blocker → bet-tasks-blocked (different copy, no action button)
 *   Design precedence (approved.md): tasks>0 beats all other states
 *
 * These tests FAIL until:
 *   - BetDetail type adds decompositionStatus, decompositionBlockerReason, and teamId fields
 *   - WorkBet.tsx replaces the unconditional EmptyState with the four-state switch
 *
 * Implementation note: The component is rendered with MemoryRouter (required for
 * Link components) and overrideBet to skip the API fetch.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkBet } from "../pages/WorkBet";
import type { BetDetail } from "../types/bet";

// ---------------------------------------------------------------------------
// Fixture factory
// BetDetail will gain decompositionStatus, decompositionBlockerReason, teamId in green phase.
// Use `as any` / `as BetDetail` to allow red phase to compile while asserting the new fields.
// ---------------------------------------------------------------------------

type BetDetailWithDecomp = BetDetail & {
	decompositionStatus?: string | null;
	decompositionBlockerReason?: string | null;
	teamId?: string;
};

function makeBetDetail(overrides: Partial<BetDetailWithDecomp> = {}): BetDetailWithDecomp {
	return {
		id: "bet-test",
		title: "Test Bet",
		team: "Alpha Core",
		// teamId is a new field to be added in green phase (for "Add an agent" link)
		teamId: "team-1" as unknown as string,
		status: "active",
		atRisk: false,
		costAppetite: null,
		tokenAppetite: null,
		costActual: null,
		tokensActual: null,
		description: "Solve the problem",
		tasks: [],
		// AK3: new fields (not yet on BetDetail; green phase adds them)
		decompositionStatus: null,
		decompositionBlockerReason: null,
		...overrides,
	};
}

function renderBet(bet: BetDetailWithDecomp) {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route
					path="/work/bet/:betId"
					// biome-ignore lint/suspicious/noExplicitAny: cast needed until BetDetail gains decomp fields
					element={<WorkBet overrideBet={bet as any as BetDetail} />}
				/>
				{/* Target route for "Add an agent" link */}
				<Route path="/work/team/:teamId" element={<div>Team page</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// State: Decomposing (running, 0 tasks)
// ---------------------------------------------------------------------------

describe("AK3: WorkBet task section — Decomposing state (AC3)", () => {
	it("renders bet-tasks-decomposing when decompositionStatus=running and no tasks", () => {
		const bet = makeBetDetail({ status: "active", decompositionStatus: "running", tasks: [] });
		renderBet(bet);
		expect(screen.getByTestId("bet-tasks-decomposing")).toBeInTheDocument();
	});

	it("does NOT render the permanent false-promise EmptyState when decomposing", () => {
		const bet = makeBetDetail({ status: "active", decompositionStatus: "running", tasks: [] });
		renderBet(bet);
		// The old unconditional empty state must be gone
		expect(screen.queryByTestId("bet-tasks-empty")).not.toBeInTheDocument();
		expect(
			screen.queryByText(/tasks will appear here once agents start work/i),
		).not.toBeInTheDocument();
	});

	it("shows decomposing copy — 'Planning the work'", () => {
		const bet = makeBetDetail({ status: "active", decompositionStatus: "running", tasks: [] });
		renderBet(bet);
		expect(screen.getByText(/planning the work/i)).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// State: Draft (status=draft, no tasks, no decomposition started)
// ---------------------------------------------------------------------------

describe("AK3: WorkBet task section — Draft state", () => {
	it("renders bet-tasks-draft when bet is still draft", () => {
		const bet = makeBetDetail({ status: "draft", decompositionStatus: null, tasks: [] });
		renderBet(bet);
		expect(screen.getByTestId("bet-tasks-draft")).toBeInTheDocument();
	});

	it("shows draft copy — 'Not committed yet'", () => {
		const bet = makeBetDetail({ status: "draft", tasks: [] });
		renderBet(bet);
		expect(screen.getByText(/not committed yet/i)).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// State: Blocked — no_eligible_agent (AC4)
// ---------------------------------------------------------------------------

describe("AK3: WorkBet task section — Blocked/no_eligible_agent state (AC4)", () => {
	it("renders bet-tasks-blocked for no_eligible_agent", () => {
		const bet = makeBetDetail({
			status: "active",
			decompositionStatus: "blocked",
			decompositionBlockerReason: "no_eligible_agent",
			tasks: [],
		});
		renderBet(bet);
		expect(screen.getByTestId("bet-tasks-blocked")).toBeInTheDocument();
	});

	it("shows 'No one can take this work' copy for no_eligible_agent", () => {
		const bet = makeBetDetail({
			status: "active",
			decompositionStatus: "blocked",
			decompositionBlockerReason: "no_eligible_agent",
			tasks: [],
		});
		renderBet(bet);
		expect(screen.getByText(/no one can take this work/i)).toBeInTheDocument();
	});

	it("renders an icon (amber alert glyph) inside the no_eligible_agent blocked state (WARNING-1)", () => {
		// approved.md binding: BOTH blocked variants must carry the amber alert glyph.
		const bet = makeBetDetail({
			id: "bet-nea-icon",
			status: "active",
			decompositionStatus: "blocked",
			decompositionBlockerReason: "no_eligible_agent",
			teamId: "team-1",
			tasks: [],
		});
		renderBet(bet);
		const blockedEl = screen.getByTestId("bet-tasks-blocked");
		const svg = blockedEl.querySelector("svg");
		expect(svg).not.toBeNull();
	});

	it("shows 'Add an agent' action link targeting /work/team/:teamId (AC4)", () => {
		const bet = makeBetDetail({
			id: "bet-nea",
			status: "active",
			decompositionStatus: "blocked",
			decompositionBlockerReason: "no_eligible_agent",
			teamId: "team-1",
			tasks: [],
		});
		renderBet(bet);
		const addAgentLink = screen.getByRole("link", { name: /add an agent/i });
		expect(addAgentLink).toBeInTheDocument();
		// Must target /work/team/:teamId — the WorkTeam page that owns agent management
		expect(addAgentLink.getAttribute("href")).toBe("/work/team/team-1");
	});
});

// ---------------------------------------------------------------------------
// State: Blocked — empty/failed (AC4)
// ---------------------------------------------------------------------------

describe("AK3: WorkBet task section — Blocked/failed state (AC4)", () => {
	it("renders bet-tasks-blocked for failed reason", () => {
		const bet = makeBetDetail({
			status: "active",
			decompositionStatus: "blocked",
			decompositionBlockerReason: "failed",
			tasks: [],
		});
		renderBet(bet);
		expect(screen.getByTestId("bet-tasks-blocked")).toBeInTheDocument();
	});

	it("shows 'Couldn't plan the work' copy for failed", () => {
		const bet = makeBetDetail({
			status: "active",
			decompositionStatus: "blocked",
			decompositionBlockerReason: "failed",
			tasks: [],
		});
		renderBet(bet);
		expect(screen.getByText(/couldn't plan the work/i)).toBeInTheDocument();
	});

	it("does NOT show 'Add an agent' button for failed reason (no action)", () => {
		const bet = makeBetDetail({
			status: "active",
			decompositionStatus: "blocked",
			decompositionBlockerReason: "failed",
			tasks: [],
		});
		renderBet(bet);
		expect(screen.queryByRole("link", { name: /add an agent/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /add an agent/i })).not.toBeInTheDocument();
	});

	it("renders an icon (amber alert glyph) inside the blocked state (WARNING-1)", () => {
		// approved.md binding: blocked state must carry icon + iconBg="var(--accent-secondary-dim)"
		// EmptyState only renders the icon container when icon prop is provided.
		// We assert the SVG is present inside bet-tasks-blocked.
		const bet = makeBetDetail({
			status: "active",
			decompositionStatus: "blocked",
			decompositionBlockerReason: "failed",
			tasks: [],
		});
		renderBet(bet);
		const blockedEl = screen.getByTestId("bet-tasks-blocked");
		// An SVG (the alert glyph) must be present inside the blocked empty-state container.
		const svg = blockedEl.querySelector("svg");
		expect(svg).not.toBeNull();
	});

	it("renders bet-tasks-blocked for empty reason", () => {
		const bet = makeBetDetail({
			status: "active",
			decompositionStatus: "blocked",
			decompositionBlockerReason: "empty",
			tasks: [],
		});
		renderBet(bet);
		expect(screen.getByTestId("bet-tasks-blocked")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// State: Populated (tasks > 0) — takes precedence over ALL other states (AC3)
// ---------------------------------------------------------------------------

describe("AK3: WorkBet task section — Populated state, tasks>0 beats everything (AC3 precedence)", () => {
	const activeBetWithTasks = makeBetDetail({
		status: "active",
		decompositionStatus: "done",
		tasks: [{ id: "t1", title: "Task A", owner: "Builder", state: "accepted", costActual: null }],
	});

	it("renders task-row items when tasks > 0", () => {
		renderBet(activeBetWithTasks);
		expect(screen.getByTestId("task-row")).toBeInTheDocument();
	});

	it("does NOT render empty/decomposing/blocked states when tasks exist", () => {
		renderBet(activeBetWithTasks);
		expect(screen.queryByTestId("bet-tasks-empty")).not.toBeInTheDocument();
		expect(screen.queryByTestId("bet-tasks-decomposing")).not.toBeInTheDocument();
		expect(screen.queryByTestId("bet-tasks-blocked")).not.toBeInTheDocument();
		expect(screen.queryByTestId("bet-tasks-draft")).not.toBeInTheDocument();
	});

	it("shows tasks even when bet is draft (tasks>0 beats draft — approved.md precedence)", () => {
		// A bet that has tasks but is still in draft status must show them
		const draftBetWithTasks = makeBetDetail({
			status: "draft",
			decompositionStatus: null,
			tasks: [
				{ id: "t2", title: "Drafted task", owner: "Builder", state: "proposed", costActual: null },
			],
		});
		renderBet(draftBetWithTasks);
		expect(screen.getByTestId("task-row")).toBeInTheDocument();
		expect(screen.queryByTestId("bet-tasks-draft")).not.toBeInTheDocument();
	});

	it("shows tasks even when decompositionStatus is blocked but tasks still exist (tasks>0 beats blocker)", () => {
		// Tasks arrived before a later blocker — must still show the tasks
		const blockedBetWithTasks = makeBetDetail({
			status: "active",
			decompositionStatus: "blocked",
			decompositionBlockerReason: "no_eligible_agent",
			tasks: [
				{
					id: "t3",
					title: "Existing task",
					owner: "Builder",
					state: "in_progress",
					costActual: null,
				},
			],
		});
		renderBet(blockedBetWithTasks);
		expect(screen.getByTestId("task-row")).toBeInTheDocument();
		expect(screen.queryByTestId("bet-tasks-blocked")).not.toBeInTheDocument();
	});
});
