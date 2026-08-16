/**
 * AA2 — WorkRoutine detail page tests (delete, new fields, last run summary).
 *
 * AC-2: Delete button shows confirmation, confirm calls DELETE API, cancel restores.
 * AC-6: New KV fields render (createdAt, lastRunSummary section).
 */

import type { RoutineDetail } from "@hyperidle/domain-model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkRoutine } from "../pages/WorkRoutine";
import * as apiFetchModule from "../services/api-fetch.js";

// Mock apiFetch for delete tests
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

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

const MOCK_DETAIL_AA2: RoutineDetail = {
	routine: {
		id: "routine-aa2",
		name: "AA2 Routine",
		description: "Tests delete and new fields",
		state: "active",
		triggerType: "calendar",
		triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
		scheduleLabel: "Every day at 9:00 AM",
		ownerAgentId: "agent-aa2",
		agentName: "AA2 Agent",
		agentInitials: "AA",
		teamId: "team-aa2",
		teamName: "AA2 Team",
		autonomyLevel: 2,
		humanReview: false,
		delegationAllowed: false,
		lastRunAt: "2026-01-01T09:00:00.000Z",
		lastRunOutcome: "success",
		nextRunAt: "2026-01-02T09:00:00.000Z",
		createdAt: "2026-01-01T00:00:00.000Z",
		lastRunSummary: "Sent 10 notifications successfully.",
		silent: false,
	},
	runs: [
		{
			id: "run-aa2-1",
			startedAt: "2026-01-01T09:00:00.000Z",
			endedAt: "2026-01-01T09:01:00.000Z",
			durationSeconds: 60,
			outcome: "success",
			errorMessage: null,
			summary: "Sent 10 notifications successfully.",
		},
	],
};

const MOCK_DETAIL_NO_SUMMARY: RoutineDetail = {
	...MOCK_DETAIL_AA2,
	routine: {
		...MOCK_DETAIL_AA2.routine,
		lastRunSummary: null,
	},
	// No runs: "No previous runs" is the expected text when there are no runs AND no summary.
	// A routine with runs but no summary would show "No summary available" instead.
	runs: [],
};

function renderPage(
	overrideData?: RoutineDetail | null,
	loading = false,
	error: Error | null = null,
): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/work/routine/routine-aa2"]}>
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

describe("WorkRoutine — AA2 Delete & New Fields", () => {
	const mockApiFetch = vi.mocked(apiFetchModule.apiFetch);

	afterEach(() => {
		vi.clearAllMocks();
		mockApiFetch.mockReset();
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-2: Delete button with inline confirmation
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-2: Delete button and confirmation", () => {
		it("renders a Delete button in the action bar", () => {
			renderPage(MOCK_DETAIL_AA2);
			expect(screen.getByTestId("routine-delete-btn")).toBeInTheDocument();
		});

		it("clicking Delete shows inline confirmation prompt", () => {
			renderPage(MOCK_DETAIL_AA2);
			fireEvent.click(screen.getByTestId("routine-delete-btn"));
			expect(screen.getByTestId("routine-delete-confirm")).toBeInTheDocument();
		});

		it("clicking Cancel in confirmation restores normal action bar", () => {
			renderPage(MOCK_DETAIL_AA2);
			fireEvent.click(screen.getByTestId("routine-delete-btn"));
			expect(screen.getByTestId("routine-delete-confirm")).toBeInTheDocument();

			fireEvent.click(screen.getByTestId("routine-delete-cancel"));
			expect(screen.queryByTestId("routine-delete-confirm")).not.toBeInTheDocument();
			expect(screen.getByTestId("routine-delete-btn")).toBeInTheDocument();
		});

		it("clicking Confirm calls DELETE /api/routines/:id", async () => {
			mockApiFetch.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({ deleted: true, deletedAt: new Date().toISOString() }),
			} as unknown as Response);

			renderPage(MOCK_DETAIL_AA2);
			fireEvent.click(screen.getByTestId("routine-delete-btn"));
			fireEvent.click(screen.getByTestId("routine-delete-confirm"));

			await waitFor(() => {
				expect(mockApiFetch).toHaveBeenCalledWith(
					"/api/routines/routine-aa2",
					expect.objectContaining({ method: "DELETE" }),
				);
			});
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-6: New KV fields render
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-6: New KV fields display", () => {
		// @lore AU21 Increment 14a: "renders Cost cap per run field when set" is
		// HARD-DELETED — the cost-cap feature no longer exists, no replacement.

		it("renders Created field when createdAt is set", () => {
			renderPage(MOCK_DETAIL_AA2);
			expect(screen.getByText("Created")).toBeInTheDocument();
		});

		it("renders Last run summary section with summary text", () => {
			renderPage(MOCK_DETAIL_AA2);
			expect(screen.getByTestId("routine-last-run-summary")).toBeInTheDocument();
			expect(screen.getByText("Sent 10 notifications successfully.")).toBeInTheDocument();
		});

		it("shows 'No previous runs' when lastRunSummary is null", () => {
			renderPage(MOCK_DETAIL_NO_SUMMARY);
			expect(screen.getByTestId("routine-last-run-summary")).toBeInTheDocument();
			expect(screen.getByText(/no previous runs/i)).toBeInTheDocument();
		});

		it("renders run history with summary column when present", () => {
			renderPage(MOCK_DETAIL_AA2);
			const rows = screen.getAllByTestId("routine-run-row");
			expect(rows).toHaveLength(1);
		});
	});
});
