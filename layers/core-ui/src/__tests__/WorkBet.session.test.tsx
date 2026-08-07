/**
 * L19 — WorkBet task list tests (updated for W3, visual-parity-audit).
 *
 * W3 AC-22: Task rows are flat divs. The outcome column and harness-URL
 * jump-out links were removed from the task list in W3.
 *
 * visual-parity-audit: StatusChip replaced by human-readable badge labels.
 * Meta line shows: "owner · stateLabel · relTime" (owner is NOT standalone text).
 *
 * Covers:
 * - Task rows render title and owner (owner appears in meta line)
 * - Human-readable badge labels (in_progress → "In progress", done → "Done")
 * - No "Open session in harness" links in the task list
 * - Tasks with different states render distinct badges
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
		tokenAppetite: null,
		tokensActual: null,
		progress: { done: 0, total: 1 },
		description: "# Problem\n\nTest.",
		tasks: taskOverrides.map((o, i) => ({
			id: `task-${i}`,
			title: `Task ${i}`,
			owner: "Dev Agent",
			state: "in_progress" as const,
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
		// visual-parity-audit: owner appears in the meta line ("Alice · In progress")
		// not as standalone text. Check for the title (always standalone) and that the
		// meta line contains the owner name.
		const bet = makeBet([{ title: "Auth task", owner: "Alice" }]);
		renderBet(bet);
		expect(await screen.findByText("Auth task")).toBeInTheDocument();
		// Owner is in the meta line: "Alice · In progress"
		const rowEl = document.querySelector("[data-testid='task-row']");
		expect(rowEl?.textContent).toMatch(/Alice/);
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

	it("in_progress task renders 'In progress' human-readable badge (visual-parity-audit)", async () => {
		const bet = makeBet([{ title: "Active task", state: "in_progress" }]);
		renderBet(bet);
		// visual-parity-audit: StatusChip replaced by human-readable badge.
		// "In progress" appears in both the badge span and the meta line.
		const labels = await screen.findAllByText(/In progress/);
		expect(labels.length).toBeGreaterThan(0);
	});

	it("done task renders 'Done' human-readable badge (visual-parity-audit)", async () => {
		const bet = makeBet([{ title: "Done task", state: "done" }]);
		renderBet(bet);
		// visual-parity-audit: StatusChip "DONE" replaced by human-readable "Done" badge.
		const labels = await screen.findAllByText(/^Done$/);
		expect(labels.length).toBeGreaterThan(0);
	});

	it("tasks render as flat rows with data-testid='task-row' (no table)", async () => {
		const bet = makeBet([{ title: "Task A" }, { title: "Task B" }]);
		renderBet(bet);
		const rows = await screen.findAllByTestId("task-row");
		expect(rows.length).toBe(2);
		expect(screen.queryByRole("table")).toBeNull();
	});
});
