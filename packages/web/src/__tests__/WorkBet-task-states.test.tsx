/**
 * AU21 §9 Increment 10a (Decision I) RED — WorkBet tasks-section component tests.
 *
 * SUPERSEDES the original AK3 four-state suite (Decomposing / Blocked /
 * Draft / Populated). Decision I removes the built-in `bet_decomposition`
 * mechanism entirely — `BetDetail` no longer carries `decompositionStatus`/
 * `decompositionBlockerReason`, so the auto-decompose "Decomposing…" and
 * "Blocked — …" empty-states have nothing left to key off of and are
 * replaced by a single honest state for a committed bet with no tasks yet.
 * The draft-state copy is revised to stop promising automatic behavior core
 * no longer provides.
 *
 * Tests cover:
 *   - Draft state: honest copy that does NOT promise automatic decomposition
 *     ("commit this bet and your team will break it into tasks" is gone).
 *   - "No tasks yet" state: a committed/active bet with zero tasks shows a
 *     plain honest empty state — no "Decomposing"/"Planning the work" copy,
 *     no "Blocked"/blocker-reason copy.
 *   - Populated state (tasks > 0) still beats every other state, draft
 *     included — this precedence rule survives Decision I unchanged.
 *
 * These tests FAIL until WorkBet.tsx's tasks section drops its
 * decompositionStatus-keyed branches and BetDetail sheds the two fields.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkBet } from "../pages/WorkBet";
import type { BetDetail } from "../types/bet";

function makeBetDetail(overrides: Partial<BetDetail> = {}): BetDetail {
	return {
		id: "bet-test",
		title: "Test Bet",
		team: "Alpha Core",
		teamId: "team-1",
		status: "active",
		atRisk: false,
		tokenAppetite: null,
		tokensActual: null,
		description: "Solve the problem",
		tasks: [],
		...overrides,
	};
}

function renderBet(bet: BetDetail) {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
				<Route path="/work/team/:teamId" element={<div>Team page</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// State: Draft (status=draft, no tasks) — copy no longer promises auto-decompose
// ---------------------------------------------------------------------------

describe("WorkBet task section — Draft state (honest copy)", () => {
	it("renders bet-tasks-draft when bet is still draft", () => {
		const bet = makeBetDetail({ status: "draft", tasks: [] });
		renderBet(bet);
		expect(screen.getByTestId("bet-tasks-draft")).toBeInTheDocument();
	});

	it("does NOT promise automatic decomposition ('your team will break it into tasks' is gone)", () => {
		const bet = makeBetDetail({ status: "draft", tasks: [] });
		renderBet(bet);
		expect(screen.queryByText(/your team will break it into tasks/i)).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// State: No tasks yet (committed/active bet, zero tasks) — the honest
// replacement for the removed Decomposing/Blocked states.
// ---------------------------------------------------------------------------

describe("WorkBet task section — No tasks yet state", () => {
	it("renders an honest 'no tasks yet' empty state for a committed bet with zero tasks", () => {
		const bet = makeBetDetail({ status: "active", tasks: [] });
		renderBet(bet);
		expect(screen.getByTestId("bet-tasks-empty")).toBeInTheDocument();
	});

	it("does NOT render the removed Decomposing state", () => {
		const bet = makeBetDetail({ status: "active", tasks: [] });
		renderBet(bet);
		expect(screen.queryByTestId("bet-tasks-decomposing")).not.toBeInTheDocument();
		expect(screen.queryByText(/planning the work/i)).not.toBeInTheDocument();
	});

	it("does NOT render the removed Blocked state", () => {
		const bet = makeBetDetail({ status: "active", tasks: [] });
		renderBet(bet);
		expect(screen.queryByTestId("bet-tasks-blocked")).not.toBeInTheDocument();
		expect(screen.queryByText(/couldn't plan the work/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/no one can take this work/i)).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// State: Populated (tasks > 0) — still beats every other state (unchanged).
// ---------------------------------------------------------------------------

describe("WorkBet task section — Populated state, tasks>0 beats everything", () => {
	it("renders task-row items when tasks > 0", () => {
		const bet = makeBetDetail({
			status: "active",
			tasks: [{ id: "t1", title: "Task A", owner: "Builder", state: "accepted" }],
		});
		renderBet(bet);
		expect(screen.getByTestId("task-row")).toBeInTheDocument();
	});

	it("does NOT render empty/draft states when tasks exist", () => {
		const bet = makeBetDetail({
			status: "active",
			tasks: [{ id: "t1", title: "Task A", owner: "Builder", state: "accepted" }],
		});
		renderBet(bet);
		expect(screen.queryByTestId("bet-tasks-empty")).not.toBeInTheDocument();
		expect(screen.queryByTestId("bet-tasks-draft")).not.toBeInTheDocument();
	});

	it("shows tasks even when bet is draft (tasks>0 beats draft — approved.md precedence)", () => {
		const bet = makeBetDetail({
			status: "draft",
			tasks: [{ id: "t2", title: "Drafted task", owner: "Builder", state: "proposed" }],
		});
		renderBet(bet);
		expect(screen.getByTestId("task-row")).toBeInTheDocument();
		expect(screen.queryByTestId("bet-tasks-draft")).not.toBeInTheDocument();
	});
});
