/**
 * L13 — WorkBet TaskSheet integration tests (red phase).
 *
 * After L13's task 7, WorkBet mounts TaskSheet on task-row click.
 * Before the implementation, WorkBet has no TaskSheet — tests fail.
 *
 * Covers:
 * - Click on a [data-testid="bet-task-row"] opens the TaskSheet (role="dialog").
 * - The request-state-change affordance is reachable from inside the sheet.
 * - Close button returns the sheet to closed state.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkBet } from "../pages/WorkBet";
import type { BetDetail } from "../types/bet";

// Mock useHostThread so HostThreadSection doesn't interfere with fetchSpy sequences.
vi.mock("../hooks/useHostThread", () => ({
	useHostThread: vi.fn(() => ({
		data: null,
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	})),
}));

// Mock useArtifactThreadSummary so ArtifactThreadsSummary doesn't crash on
// the generic fetch mock response (which lacks the expected shape).
vi.mock("../hooks/useArtifactThreadSummary", () => ({
	useArtifactThreadSummary: vi.fn(() => ({
		data: null,
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	})),
}));

// L12: WorkBet now renders ArtifactSection which calls useArtifacts.
// Mock to prevent fetch calls and unstable data shapes in unit tests.
vi.mock("../hooks/useArtifacts", () => ({
	useArtifacts: vi.fn(() => ({
		data: { items: [], nextCursor: null },
		error: null,
		isLoading: false,
	})),
}));

const MOCK_BET_WITH_TASKS: BetDetail = {
	id: "b1",
	title: "User auth flow",
	product: "HyperIdle Core",
	team: "Core Team",
	status: "in_progress",
	appetite: "2 weeks",
	progress: { done: 1, total: 2 },
	pitch: "# Problem\n\nAuth needs work.\n",
	tasks: [
		{
			id: "t1",
			title: "Implement login endpoint",
			owner: "Dev Agent 1",
			state: "in_progress",
			cost: "$4.20",
		},
		{
			id: "t2",
			title: "Design signup form",
			owner: "Dev Agent 2",
			state: "accepted",
			cost: "$1.80",
		},
	],
	comments: [],
};

function renderPage(bet = MOCK_BET_WITH_TASKS): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkBet — TaskSheet (L13 task 7)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ threads: [] }),
		});
		global.fetch = fetchSpy;
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("click on [data-testid='bet-task-row'] opens the TaskSheet (role=dialog)", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		renderPage();

		// Wait for task rows to render
		const taskRows = await screen.findAllByTestId("bet-task-row");
		expect(taskRows.length).toBeGreaterThan(0);

		// Click the first task row
		await user.click(taskRows[0]);

		// TaskSheet should open
		const dialog = screen.getByRole("dialog");
		expect(dialog).toBeInTheDocument();
		// Sheet shows the task title
		expect(dialog).toHaveTextContent("Implement login endpoint");
	});

	it("the request-state-change affordance (radio buttons) is reachable inside the sheet", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		renderPage();

		const taskRows = await screen.findAllByTestId("bet-task-row");
		await user.click(taskRows[0]);

		const dialog = screen.getByRole("dialog");
		expect(dialog).toBeInTheDocument();

		// The "Move to BLOCKED" intent radio should be present
		expect(screen.getByRole("radio", { name: /move to blocked/i })).toBeInTheDocument();
	});

	it("close button returns the sheet to closed state", async () => {
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
		renderPage();

		const taskRows = await screen.findAllByTestId("bet-task-row");
		await user.click(taskRows[0]);

		expect(screen.getByRole("dialog")).toBeInTheDocument();

		// Find and click the close button
		const closeButton = screen.getByRole("button", { name: /close/i });
		await user.click(closeButton);

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		});
	});
});
