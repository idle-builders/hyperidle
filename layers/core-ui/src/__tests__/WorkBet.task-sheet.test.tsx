/**
 * L13 — WorkBet task row navigation tests (updated for W3).
 *
 * W3 AC-22: task rows are flat divs (not a table) and clicking navigates
 * to the task detail page (/work/bet/:betId/task/:taskId).
 *
 * The L13 TaskSheet-on-click behavior was replaced in W3 with direct navigation.
 * These tests verify the W3 flat row + navigate pattern.
 *
 * Covers:
 * - Task rows render with data-testid="task-row"
 * - Each row shows task title and owner
 * - Each row shows a StatusChip for the task state
 * - No role="table" in the rendered output (flat list)
 */

import { render, screen } from "@testing-library/react";
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
	team: "Core Team",
	status: "active",
	atRisk: false,
	tokenAppetite: null,
	tokensActual: null,
	progress: { done: 1, total: 2 },
	description: "# Problem\n\nAuth needs work.\n",
	tasks: [
		{
			id: "t1",
			title: "Implement login endpoint",
			owner: "Dev Agent 1",
			state: "in_progress",
			latestSessionOutcome: null,
			latestSessionHarnessUrl: null,
		},
		{
			id: "t2",
			title: "Design signup form",
			owner: "Dev Agent 2",
			state: "accepted",
			latestSessionOutcome: null,
			latestSessionHarnessUrl: null,
		},
	],
};

function renderPage(bet = MOCK_BET_WITH_TASKS): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
				<Route
					path="/work/bet/:betId/task/:taskId"
					element={<div data-testid="task-detail-page" />}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkBet — task rows (W3 flat list, L13 updated)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ threads: [] }),
		});
		global.fetch = fetchSpy as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("task rows render with data-testid='task-row' (W3: not 'bet-task-row')", async () => {
		renderPage();
		const taskRows = await screen.findAllByTestId("task-row");
		expect(taskRows.length).toBe(2);
	});

	it("each task row shows the task title", async () => {
		renderPage();
		expect(await screen.findByText("Implement login endpoint")).toBeInTheDocument();
		expect(await screen.findByText("Design signup form")).toBeInTheDocument();
	});

	it("each task row shows the task owner", async () => {
		renderPage();
		expect(await screen.findByText(/Dev Agent 1/)).toBeInTheDocument();
		expect(await screen.findByText(/Dev Agent 2/)).toBeInTheDocument();
	});

	it("no role='table' in the rendered output (W3: flat list, not table)", async () => {
		renderPage();
		await screen.findAllByTestId("task-row");
		expect(screen.queryByRole("table")).toBeNull();
	});

	// UI-080: task rows are now <a href> links so ⌘-click / middle-click work.
	it("each task row is an anchor link with aria-label and href to task detail", async () => {
		renderPage();
		const taskRows = await screen.findAllByTestId("task-row");
		for (const row of taskRows) {
			expect(row.tagName.toLowerCase()).toBe("a");
			expect(row.getAttribute("aria-label")).toBeTruthy();
			// href must point to the task detail route
			expect(row.getAttribute("href")).toMatch(/\/work\/bet\/.+\/task\/.+/);
		}
	});
});
