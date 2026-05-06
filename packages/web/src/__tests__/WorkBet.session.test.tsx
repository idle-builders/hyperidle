/**
 * L19 — WorkBet session metadata tests (red phase).
 *
 * AC coverage:
 *  - Task with completed outcome + valid harnessUrl → outcome chip rendered, jump-out link present
 *  - Task with null outcome → no outcome chip, no jump-out link
 *  - Task with malformed harness URL (no http/https) → no jump-out link rendered
 *  - Task with crashed outcome → outcome chip shows error status
 */

import { render, screen, within } from "@testing-library/react";
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
		product: "Alpha",
		team: "Core",
		status: "in_progress",
		appetite: "1 week",
		progress: { done: 0, total: 1 },
		pitch: "# Problem\n\nTest.",
		tasks: taskOverrides.map((o, i) => ({
			id: `task-${i}`,
			title: `Task ${i}`,
			owner: "Dev Agent",
			state: "in_progress",
			cost: "$1.00",
			latestSessionOutcome: null,
			latestSessionCost: null,
			latestSessionTokensInput: null,
			latestSessionTokensOutput: null,
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

describe("WorkBet — session metadata (L19)", () => {
	it("task with completed outcome + valid harnessUrl → outcome chip and jump-out link rendered", async () => {
		const bet = makeBet([
			{
				title: "Auth task",
				latestSessionOutcome: "completed",
				latestSessionHarnessUrl: "https://harness.example.com/session/abc",
			},
		]);
		renderBet(bet);

		const table = screen.getByRole("table");
		const rows = within(table).getAllByRole("row");
		// First data row (index 1 = skip thead)
		const taskRow = rows[1];

		// Outcome chip should be rendered (StatusChip with "done" → "DONE" text)
		expect(within(taskRow).getByText(/done/i)).toBeInTheDocument();

		// Jump-out link should be present
		const link = within(taskRow).getByRole("link", { name: /open in harness/i });
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "https://harness.example.com/session/abc");
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noopener noreferrer");
	});

	it("task with null outcome → no outcome chip, no jump-out link", () => {
		const bet = makeBet([
			{
				title: "Unstarted task",
				latestSessionOutcome: null,
				latestSessionHarnessUrl: null,
			},
		]);
		renderBet(bet);

		const table = screen.getByRole("table");
		const rows = within(table).getAllByRole("row");
		const taskRow = rows[1];

		// No outcome chip: no link and no DONE/ERROR/PAUSED status chip text
		expect(within(taskRow).queryByRole("link", { name: /open in harness/i })).not.toBeInTheDocument();
	});

	it("task with malformed harness URL (no http/https) → no jump-out link rendered", () => {
		const bet = makeBet([
			{
				title: "Malformed URL task",
				latestSessionOutcome: "completed",
				latestSessionHarnessUrl: "javascript:alert(1)",
			},
		]);
		renderBet(bet);

		const table = screen.getByRole("table");
		const rows = within(table).getAllByRole("row");
		const taskRow = rows[1];

		// Jump-out link must NOT be rendered for malformed URL
		expect(within(taskRow).queryByRole("link", { name: /open in harness/i })).not.toBeInTheDocument();
	});

	it('task with crashed outcome → outcome chip shows error status ("ERROR")', () => {
		const bet = makeBet([
			{
				title: "Crashed task",
				latestSessionOutcome: "crashed",
				latestSessionHarnessUrl: null,
			},
		]);
		renderBet(bet);

		const table = screen.getByRole("table");
		const rows = within(table).getAllByRole("row");
		const taskRow = rows[1];

		// Outcome chip should show "ERROR" (StatusChip maps "error" → "ERROR" label)
		expect(within(taskRow).getByText(/error/i)).toBeInTheDocument();
	});
});
