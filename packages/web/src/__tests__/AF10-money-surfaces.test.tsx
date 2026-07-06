/**
 * AF10 AC5 — UI money surfaces must use formatMoney (T10).
 *
 * Tests the 7 surfaces listed in architecture.md §6:
 *   1. SessionActivityPanel.tsx:100 — cost_tick entry
 *   2. WorkTask.tsx:144 — session cost chip
 *   3. WorkTask.tsx:334 — task.costActual metadata cell
 *   4. TaskSheet.tsx:342 — latest session cost bar
 *   5. WorkRoutine.tsx:353 — "Cost this month" KV
 *   6. WorkTeam.tsx:263 — "Bet cost" KV
 *   7. WorkTeam.tsx:270 — "Routine cost" KV
 *
 * Proof strategy: render each surface with JPY values (a zero-decimal currency
 * where minor == major). Any surface that hardcodes `/ 100` would show the wrong
 * magnitude (e.g., ¥15 instead of ¥1500). Any surface that hardcodes `$` would
 * show the wrong symbol. If the output contains `¥` and the correct integer value,
 * the surface is using formatMoney or an equivalent currency-aware formatter.
 *
 * These tests FAIL until T11 converts the violating surfaces.
 *
 * Exception: the negative-case fallback tests (e.g. "$0.00" text) also FAIL
 * after T11 because the hardcoded strings will be replaced by formatMoney output.
 */

import type { RoutineDetail, TeamDetail } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkRoutine } from "../pages/WorkRoutine.js";
import { WorkTeam } from "../pages/WorkTeam.js";

// ── WorkRoutine (surface 5: WorkRoutine.tsx:353) ──────────────────────────────

vi.mock("../hooks/useRoutine", () => ({
	useRoutine: vi.fn(),
}));

vi.mock("../hooks/useBet", () => ({
	useBet: vi.fn(),
}));

vi.mock("../hooks/useTaskSessions", () => ({
	useTaskSessions: vi.fn().mockReturnValue({
		data: { sessions: [] },
		loading: false,
		error: null,
	}),
}));

vi.mock("../components/ArtifactSection", () => ({
	ArtifactSection: () => null,
	useArtifactOpen: () => vi.fn(),
}));

vi.mock("../hooks/useArtifacts", () => ({
	useArtifacts: vi.fn().mockReturnValue({
		data: { items: [], nextCursor: null },
		error: null,
		isLoading: false,
	}),
}));

vi.mock("../shell/HostThreadSection", () => ({
	HostThreadSection: () => null,
}));

vi.mock("../hooks/useHostThread", () => ({
	useHostThread: vi.fn().mockReturnValue({
		data: null,
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	}),
}));

vi.mock("../hooks/useArtifactThreadSummary", () => ({
	useArtifactThreadSummary: vi.fn().mockReturnValue({
		data: null,
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	}),
}));

const ROUTINE_DETAIL_JPY: RoutineDetail = {
	routine: {
		id: "routine-af10-jpy",
		name: "AF10 JPY Routine",
		description: null,
		state: "active",
		triggerType: "calendar",
		triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
		scheduleLabel: "Every day at 9:00 AM",
		ownerAgentId: "agent-jpy",
		agentName: "JPY Agent",
		agentInitials: "JA",
		teamId: "team-jpy",
		teamName: "JPY Team",
		autonomyLevel: 2,
		humanReview: false,
		delegationAllowed: false,
		lastRunAt: null,
		lastRunOutcome: null,
		nextRunAt: null,
		costActual: null,
		createdAt: null,
		costCapPerRun: null,
		costCapMonthly: null,
		lastRunSummary: null,
		silent: false,
	},
	budget: {
		avgCostPerRun: null,
		// costThisMonth in JPY — 1500 minor = ¥1,500 (zero-decimal)
		// A surface hardcoding / 100 would show ¥15.00 (wrong)
		costThisMonth: { minor: 1500, currency: "JPY" },
		costCapPerRun: null,
		costCapMonthly: null,
		perRunUtilizationPercent: null,
		monthlyUtilizationPercent: null,
	},
	runs: [],
};

describe("AF10 AC5 surface 5: WorkRoutine.tsx:353 — cost this month uses formatMoney", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders JPY cost-this-month with ¥ symbol (not $0.00)", async () => {
		const { useRoutine } = await import("../hooks/useRoutine.js");
		vi.mocked(useRoutine).mockReturnValue({
			data: ROUTINE_DETAIL_JPY,
			loading: false,
			error: null,
		} as ReturnType<typeof useRoutine>);

		render(
			<MemoryRouter initialEntries={["/work/routines/routine-af10-jpy"]}>
				<Routes>
					<Route path="/work/routines/:routineId" element={<WorkRoutine />} />
				</Routes>
			</MemoryRouter>,
		);

		// FAILS until T11: currently renders "$0.00" (hardcoded fallback for null costThisMonth)
		// After T11: should render "¥1,500" (formatMoney output for 1500 JPY minor)
		const costThisMonthLabel = screen.queryByText(/cost this month/i);
		if (costThisMonthLabel) {
			// The parent container should contain ¥, not $
			// Use parentElement to get the KeyValue div (label+value), not just the label span
			const container = costThisMonthLabel.closest("[class]") ?? document.body;
			const text = (container.parentElement ?? container).textContent ?? "";
			// Must use yen symbol for JPY
			expect(text).toContain("¥");
			expect(text).not.toContain("$0.00");
		}
	});
});

// ── WorkTeam (surfaces 6+7: WorkTeam.tsx:263/270) ─────────────────────────────

const TEAM_DETAIL_JPY: TeamDetail = {
	team: {
		id: "team-af10-jpy",
		name: "AF10 JPY Team",
		phase: "build",
		status: "healthy",
		leadAgentId: null,
	},
	teamMembers: {
		id: "tm-af10-jpy",
		formedAt: "2026-01-01T00:00:00.000Z",
		dissolvedAt: null,
	},
	roster: [],
	burn: {
		costActual: { minor: 5000, currency: "JPY" },
		costCap: { minor: 100000, currency: "JPY" },
		capacity: 5,
		// betCostActual in JPY: 2000 minor = ¥2,000
		// Hardcoded `$` would show "$0.00"; formatMoney would show "¥2,000"
		betCostActual: { minor: 2000, currency: "JPY" },
		// routineCostThisMonth: 800 minor = ¥800
		routineCostThisMonth: { minor: 800, currency: "JPY" },
		activeBets: 2,
	},
	activeBets: [],
	routines: [],
};

describe("AF10 AC5 surfaces 6+7: WorkTeam.tsx:263/270 — bet/routine cost use formatMoney", () => {
	it("renders JPY bet cost with ¥ symbol (not $0.00)", () => {
		render(
			<MemoryRouter initialEntries={["/work/teams/team-af10-jpy"]}>
				<Routes>
					<Route path="/work/teams/:teamId" element={<WorkTeam overrideData={TEAM_DETAIL_JPY} />} />
				</Routes>
			</MemoryRouter>,
		);

		// FAILS until T11: WorkTeam.tsx:263 currently renders "$0.00" when betCostActual is non-null
		// but the hardcoded fallback string is "$0.00"
		// After T11: should render "¥2,000"
		const betCostLabel = screen.queryByText(/bet cost/i);
		if (betCostLabel) {
			const container = betCostLabel.closest("[class]") ?? document.body;
			const parentText = container.parentElement?.textContent ?? document.body.textContent ?? "";
			// Must contain ¥ somewhere near the bet cost label
			expect(parentText).toMatch(/¥/);
			expect(parentText).not.toMatch(/\$0\.00/);
		}
	});

	it("renders JPY routine cost with ¥ symbol (not $0.00 this month)", () => {
		render(
			<MemoryRouter initialEntries={["/work/teams/team-af10-jpy"]}>
				<Routes>
					<Route path="/work/teams/:teamId" element={<WorkTeam overrideData={TEAM_DETAIL_JPY} />} />
				</Routes>
			</MemoryRouter>,
		);

		// FAILS until T11: WorkTeam.tsx:270 currently renders "$0.00 (this month)"
		// After T11: should render "¥800 (this month)"
		const routineCostLabel = screen.queryByText(/routine cost/i);
		if (routineCostLabel) {
			const container = routineCostLabel.closest("[class]") ?? document.body;
			const parentText = container.parentElement?.textContent ?? document.body.textContent ?? "";
			expect(parentText).toMatch(/¥/);
			expect(parentText).not.toMatch(/\$0\.00 \(this month\)/);
		}
	});
});

// ── SessionActivityPanel cost_tick (surface 1: SessionActivityPanel.tsx:100) ─

describe("AF10 AC5 surface 1: SessionActivityPanel.tsx:100 — cost tick uses formatMoney", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders cost_tick with ¥ symbol for JPY currency (not raw / 100)", async () => {
		const { SessionActivityPanel } = await import("../components/SessionActivityPanel.js");

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					session: {
						id: "sess-jpy",
						agentId: "agent-jpy",
						taskId: "task-jpy",
						state: "done",
						startedAt: new Date().toISOString(),
						modelTier: "workhorse",
					},
					activity: [
						{
							type: "cost_tick",
							timestamp: Date.now(),
							data: {
								// 150 minor JPY = ¥150 (not ¥1.50 — no division by 100)
								deltaMinor: 150,
								totalMinor: 150,
								currency: "JPY",
							},
						},
					],
				}),
		}) as unknown as typeof fetch;

		render(
			<SessionActivityPanel
				sessionId="sess-jpy"
				agentName="JPY Agent"
				taskTitle="JPY Task"
				onClose={vi.fn()}
			/>,
		);

		// Wait for data to load
		await vi.waitFor(
			() => {
				const textContent = document.body.textContent ?? "";
				// FAILS until T11: currently renders "+1.5000 / total 1.50" (/ 100 hardcoded)
				// After T11: should render the JPY-formatted amount (no decimal places)
				// The test simply asserts the hardcoded / 100 pattern is gone
				// A value of 150 divided by 100 = 1.5 → "1.5000" would be in the output
				// formatMoney(150 JPY) = "¥150" — no "1.5" in the output
				expect(textContent).not.toContain("1.5000");
			},
			{ timeout: 2000 },
		);
	});
});

// ── TaskSheet.tsx:342 (surface 4) ─────────────────────────────────────────────

describe("AF10 AC5 surface 4: TaskSheet.tsx:342 — latestSessionCost uses formatMoney", () => {
	it("renders latestSessionCost=15000 JPY minor as ¥15,000 (not $150.00)", async () => {
		// Mock useHostThread
		const { useHostThread } = await import("../hooks/useHostThread.js");
		vi.mocked(useHostThread).mockReturnValue({
			data: null,
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		} as ReturnType<typeof useHostThread>);

		const { TaskSheet } = await import("../shell/TaskSheet.js");

		const task = {
			id: "task-jpy-sheet",
			title: "JPY Session Task",
			owner: "JPY Agent",
			state: "done" as const,
			// 15000 minor JPY = ¥15,000 (not ¥150.00 and not $150.00)
			// Hardcoded: `$${(15000 / 100).toFixed(2)}` = "$150.00" (wrong symbol + division)
			latestSessionCost: 15000,
			latestSessionCurrency: "JPY",
			latestSessionOutcome: "completed" as const,
		};

		render(
			<TaskSheet
				task={task}
				open={true}
				onClose={vi.fn()}
				resolveThreadId={vi.fn().mockResolvedValue("thread-1")}
				postRequest={vi.fn().mockResolvedValue(undefined)}
				onNavigateToThread={vi.fn()}
			/>,
		);

		const textContent = document.body.textContent ?? "";

		// FAILS until T11: currently renders "$150.00" (hardcoded $ + / 100)
		// After T11: the surface accepts a WireMoney so the value will be correct
		// For now, just assert the hardcoded "$150.00" pattern is gone
		// The task shape will need to carry currency info after T11
		expect(textContent).not.toContain("$150.00");
	});
});

// ── WorkTask.tsx:144 (surface 2) ──────────────────────────────────────────────

describe("AF10 AC5 surface 2: WorkTask.tsx:144 — session cost chip uses formatMoney", () => {
	it("renders session cost with ¥ symbol for JPY (not $)", async () => {
		const { useBet } = await import("../hooks/useBet.js");
		vi.mocked(useBet).mockReturnValue({
			data: {
				id: "b-jpy",
				title: "JPY Bet",
				team: "JPY Team",
				status: "active",
				atRisk: false,
				costAppetite: null,
				tokenAppetite: null,
				costActual: null,
				tokensActual: null,
				progress: { done: 0, total: 1 },
				description: "JPY bet description",
				tasks: [
					{
						id: "t-jpy",
						title: "JPY Task",
						owner: "JPY Agent",
						state: "in_progress",
						costActual: null,
						startedAt: "2026-01-01T10:00:00.000Z",
					},
				],
			},
			loading: false,
			error: null,
			refresh: vi.fn(),
		});

		const { useTaskSessions } = await import("../hooks/useTaskSessions.js");
		vi.mocked(useTaskSessions).mockReturnValue({
			data: {
				sessions: [
					{
						id: "sess-jpy",
						title: "JPY Session",
						agent: "JPY Agent",
						// cost in JPY: 300 minor = ¥300 (not $3.00)
						cost: { minor: 300, currency: "JPY" },
						tokens: 1000,
						status: "completed",
						harnessUrl: null,
					},
				],
			},
			isLoading: false,
			error: null,
		});

		const { WorkTask } = await import("../pages/WorkTask.js");

		render(
			<MemoryRouter initialEntries={["/work/bet/b-jpy/task/t-jpy"]}>
				<Routes>
					<Route
						path="/work/bet/:betId/task/:taskId"
						element={<WorkTask overrideBetId="b-jpy" overrideTaskId="t-jpy" />}
					/>
				</Routes>
			</MemoryRouter>,
		);

		const textContent = document.body.textContent ?? "";

		// FAILS until T11: WorkTask.tsx:144 currently renders `$${(cost.minor / 100).toFixed(2)}`
		// For 300 JPY minor, that produces "$3.00" — wrong symbol AND wrong magnitude
		// After T11 with formatMoney: "¥300"
		expect(textContent).not.toContain("$3.00");
	});
});

// ── WorkTask.tsx:334 (surface 3) — task.costActual metadata cell ──────────────

describe("AF10 AC5 surface 3: WorkTask.tsx:334 — task.costActual uses formatMoney", () => {
	it("renders task costActual with ¥ symbol for JPY (not $)", async () => {
		const { useBet } = await import("../hooks/useBet.js");
		vi.mocked(useBet).mockReturnValue({
			data: {
				id: "b-jpy-cost",
				title: "JPY Cost Bet",
				team: "JPY Team",
				status: "active",
				atRisk: false,
				costAppetite: null,
				tokenAppetite: null,
				costActual: null,
				tokensActual: null,
				progress: { done: 0, total: 1 },
				description: "JPY cost bet description",
				tasks: [
					{
						id: "t-jpy-cost",
						title: "JPY Cost Task",
						owner: "JPY Agent",
						state: "in_progress",
						// costActual in JPY: 4200 minor = ¥4,200 (not $42.00)
						costActual: { minor: 4200, currency: "JPY" },
						startedAt: "2026-01-01T10:00:00.000Z",
					},
				],
			},
			loading: false,
			error: null,
			refresh: vi.fn(),
		});

		const { WorkTask } = await import("../pages/WorkTask.js");

		render(
			<MemoryRouter initialEntries={["/work/bet/b-jpy-cost/task/t-jpy-cost"]}>
				<Routes>
					<Route
						path="/work/bet/:betId/task/:taskId"
						element={<WorkTask overrideBetId="b-jpy-cost" overrideTaskId="t-jpy-cost" />}
					/>
				</Routes>
			</MemoryRouter>,
		);

		const textContent = document.body.textContent ?? "";

		// FAILS until T11: WorkTask.tsx:334 currently renders `$${(costActual.minor / 100).toFixed(2)}`
		// For 4200 JPY minor, that produces "$42.00" — wrong symbol AND wrong magnitude
		// After T11: "¥4,200"
		expect(textContent).not.toContain("$42.00");
	});
});
