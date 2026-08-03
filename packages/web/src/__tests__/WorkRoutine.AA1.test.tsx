/**
 * AA1 — WorkRoutine detail page tests (Task 8).
 *
 * AC coverage:
 * AC-5: Clicking routine shows run history + config
 */

import type { RoutineDetail } from "@hyperidle/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkRoutine } from "../pages/WorkRoutine";

// Full RoutineDetail fixture
const MOCK_ROUTINE_DETAIL: RoutineDetail = {
	routine: {
		id: "routine-detail-1",
		name: "Daily digest",
		description: "Sends a daily summary to the team",
		state: "active",
		triggerType: "calendar",
		triggerConfig: JSON.stringify({ cron: "0 8 * * *" }),
		scheduleLabel: "Every day at 8:00 AM",
		ownerAgentId: "agent-aa1",
		agentName: "AA1 Agent",
		agentInitials: "AA",
		teamId: "team-aa1",
		teamName: "AA1 Team",
		autonomyLevel: 2,
		humanReview: false,
		delegationAllowed: false,
		lastRunAt: "2026-01-01T08:00:00.000Z",
		lastRunOutcome: "success",
		nextRunAt: "2026-01-02T08:00:00.000Z",
		createdAt: null,
		lastRunSummary: null,
		silent: false,
	},
	runs: [
		{
			id: "run-1",
			startedAt: "2026-01-01T08:00:00.000Z",
			endedAt: "2026-01-01T08:01:30.000Z",
			durationSeconds: 90,
			outcome: "success",
			errorMessage: null,
		},
		{
			id: "run-2",
			startedAt: "2025-12-31T08:00:00.000Z",
			endedAt: "2025-12-31T08:01:00.000Z",
			durationSeconds: 60,
			outcome: "error",
			errorMessage: "Connection timeout",
		},
	],
};

const EMPTY_RUNS_DETAIL: RoutineDetail = {
	...MOCK_ROUTINE_DETAIL,
	runs: [],
};

// Mock useRoutine hook
vi.mock("../hooks/useRoutine", () => ({
	useRoutine: vi.fn().mockReturnValue({
		data: null,
		loading: false,
		error: null,
		refetch: () => undefined,
	}),
}));

// AV4: RoutineDetailPane (now used by WorkRoutine) uses ToastContext — spread actual
// module so ToastContext export is preserved alongside the mocked useToast.
vi.mock(import("../shell/ToastRegion"), async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		useToast: () => ({ showToast: vi.fn() }),
	};
});

function renderPage(
	routineId = "routine-detail-1",
	overrideData?: RoutineDetail | null,
	loading = false,
	error: Error | null = null,
): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/routine/${routineId}`]}>
			<Routes>
				<Route
					path="/work/routine/:routineId"
					element={
						<WorkRoutine
							overrideData={overrideData}
							overrideLoading={loading}
							overrideError={error}
						/>
					}
				/>
				{/* AD9: /work/portfolio retired → /work */}
				<Route path="/work" element={<div data-testid="work-overview-page">Work Overview</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkRoutine — AA1 Detail Page", () => {
	// AC-5: Renders routine name and status chip
	it("renders routine name and status", () => {
		renderPage("routine-detail-1", MOCK_ROUTINE_DETAIL);
		// AG4: routine name now appears in both breadcrumb and h1; use heading role
		expect(screen.getByRole("heading", { level: 1, name: "Daily digest" })).toBeInTheDocument();
	});

	it("renders the routine configuration section", () => {
		renderPage("routine-detail-1", MOCK_ROUTINE_DETAIL);
		// Should show schedule label
		expect(screen.getByText("Every day at 8:00 AM")).toBeInTheDocument();
	});

	it("renders agent name", () => {
		renderPage("routine-detail-1", MOCK_ROUTINE_DETAIL);
		expect(screen.getByText("AA1 Agent")).toBeInTheDocument();
	});

	it("renders run history table with run rows", () => {
		renderPage("routine-detail-1", MOCK_ROUTINE_DETAIL);
		// Run history section
		expect(screen.getByTestId("routine-run-history")).toBeInTheDocument();
		// Two runs
		const rows = screen.getAllByTestId("routine-run-row");
		expect(rows).toHaveLength(2);
	});

	it("shows empty state in run history when no runs", () => {
		renderPage("routine-detail-1", EMPTY_RUNS_DETAIL);
		// Approved design: "No runs recorded yet." as text-secondary paragraph
		// (not an EmptyState component — the approved design specifies a plain text message)
		expect(screen.getByText("No runs recorded yet.")).toBeInTheDocument();
	});

	// AC-5: Loading skeleton
	it("shows loading skeleton during fetch", () => {
		renderPage("routine-detail-1", undefined, true);
		expect(screen.getByTestId("work-routine-loading")).toBeInTheDocument();
	});

	// AC-5: Not found / error state
	it("shows not-found EmptyState when data is null and no loading", () => {
		renderPage("nonexistent-routine", null);
		expect(screen.getByTestId("work-routine-not-found")).toBeInTheDocument();
	});

	// Error state
	it("shows error state when fetch errors", () => {
		renderPage("routine-detail-1", undefined, false, new Error("Fetch failed"));
		expect(screen.getByTestId("work-routine-error")).toBeInTheDocument();
	});

	// AD9: W4 — breadcrumb back-link must point to /work, not /work/portfolio
	it("breadcrumb back-link navigates to /work", () => {
		renderPage("routine-detail-1", MOCK_ROUTINE_DETAIL);
		const backLink = screen.getByTestId("routine-breadcrumb-back");
		fireEvent.click(backLink);
		// MemoryRouter has /work registered — navigation succeeds if work-overview-page renders
		expect(screen.getByTestId("work-overview-page")).toBeInTheDocument();
	});
});
