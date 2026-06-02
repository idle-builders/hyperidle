/**
 * L19 — WorkBet task list tests (updated for W3).
 *
 * W3 AC-22: Task rows are flat divs. The outcome column and harness-URL
 * jump-out links were removed from the task list in W3.
 *
 * The W3 task row shows: title, owner, and StatusChip for task.state.
 *
 * Covers:
 * - Task rows render title and owner
 * - StatusChip reflects task.state (in_progress → HEALTHY, accepted → DONE)
 * - No "Open session in harness" links in the task list
 * - Tasks with different states render distinct status chips
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkBet } from "../pages/WorkBet";
import type { BetDetail } from "../types/bet";

// Mock useHostThread so HostThreadSection doesn't interfere.
vi.mock("../hooks/useHostThread", () => ({
	useHostThread: vi.fn(() => ({
		data: null,
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	})),
}));

// Mock useArtifactThreadSummary so ArtifactThreadsSummary doesn't crash.
vi.mock("../hooks/useArtifactThreadSummary", () => ({
	useArtifactThreadSummary: vi.fn(() => ({
		data: null,
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	})),
}));

function makeBet(taskOverrides: Partial<BetDetail["tasks"][number]>[] = []): BetDetail {
	return {
		id: "bet-session-test",
		title: "Session Test Bet",
		team: "Alpha Core",
		status: "active",
		atRisk: false,
		costAppetite: null,
		tokenAppetite: null,
		costActual: null,
		tokensActual: null,
		progress: { done: 0, total: 1 },
		description: "# Problem\n\nTest.",
		tasks: taskOverrides.map((o, i) => ({
			id: `task-${i}`,
			title: `Task ${i}`,
			owner: "Dev Agent",
			state: "in_progress" as const,
			costActual: null,
			latestSessionOutcome: null,
			latestSessionHarnessUrl: null,
			...o,
		})),
	};
}

function renderBet(bet: BetDetail): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkBet — task rows (W3 flat list, L19 updated)", () => {
	it("task row shows title and owner", async () => {
		const bet = makeBet([{ title: "Auth task", owner: "Alice" }]);
		renderBet(bet);
		expect(await screen.findByText("Auth task")).toBeInTheDocument();
		expect(await screen.findByText("Alice")).toBeInTheDocument();
	});

	it("W3: no 'Open session in harness' links in task rows", () => {
		const bet = makeBet([
			{
				title: "Auth task",
				latestSessionOutcome: "completed",
				latestSessionHarnessUrl: "https://harness.example.com/session/abc",
			},
		]);
		renderBet(bet);
		// W3 removed the harness link column from task rows
		expect(
			screen.queryByRole("link", { name: /open session in harness/i }),
		).not.toBeInTheDocument();
	});

	it("in_progress task renders HEALTHY status chip", async () => {
		const bet = makeBet([{ title: "Active task", state: "in_progress" }]);
		renderBet(bet);
		// taskStateToStatus("in_progress") → "healthy" → displays "HEALTHY"
		// Multiple StatusChip elements may be present (BetCard + task row); getAllByText is safe
		const chips = await screen.findAllByText(/^healthy$/i);
		expect(chips.length).toBeGreaterThan(0);
	});

	it("done task renders DONE status chip", async () => {
		const bet = makeBet([{ title: "Done task", state: "done" }]);
		renderBet(bet);
		// taskStateToStatus("done") → "done" → displays "DONE"
		const chips = await screen.findAllByText(/^done$/i);
		expect(chips.length).toBeGreaterThan(0);
	});

	it("tasks render as flat rows with data-testid='task-row' (no table)", async () => {
		const bet = makeBet([{ title: "Task A" }, { title: "Task B" }]);
		renderBet(bet);
		const rows = await screen.findAllByTestId("task-row");
		expect(rows.length).toBe(2);
		expect(screen.queryByRole("table")).toBeNull();
	});
});
