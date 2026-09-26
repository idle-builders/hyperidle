/**
 * AJ3 — isolation harness proving test (the AC2 proof).
 *
 * Discharges AC2 directly: a page-level / data-fed surface mounts via thin
 * mock providers, with NO server, database, or real data. It mounts the REAL
 * `WorkTaskPage` — fed by a mocked window.fetch returning `open_task`'s
 * `ActionResult<TaskView>` — wrapped in `MockProviders`, and asserts the page
 * renders its real heading.
 *
 * @lore BB1: WorkBet + MOCK_BETS are deleted — WorkTaskPage replaces both.
 * The overrideBet prop is gone; this test mocks window.fetch to return an
 * `open_task` result so the page short-circuits to the populated state.
 *
 * This is not a synthetic test-local surface: it imports application code
 * (`WorkTaskPage`, `MockProviders`) and asserts the rendered DOM of a
 * real page. It would fail if `MockProviders` failed to supply the router or
 * the AssistantContext the page consumes (`useNavigate`/`useParams`/`useContext`).
 */

import { render, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTaskPage } from "../pages/WorkTaskPage";
import { MockProviders } from "./index";

// Minimal task fixture — the page reads task.title for the h1 heading
const TASK = {
	id: "task-aj3",
	parentTaskId: null,
	teamId: "team-1",
	ownerAgentId: "agent-1",
	title: "Modernise the auth layer",
	description: "Refactor the auth layer to use the new primitives.",
	doneCondition: null,
	state: "in_progress",
	dependencies: null,
	threadId: null,
	notes: null,
	outcomeVerdict: null,
	outcomeSummary: null,
	outcomeRecordedAt: null,
	outcomeRecordedBy: null,
	tokensActualJson: null,
	sourceDocumentId: null,
	createdAt: "2026-08-30T10:00:00.000Z",
	updatedAt: "2026-08-30T10:00:00.000Z",
	completedAt: null,
	position: 0,
	needsReview: false,
};

describe("MockProviders mounts a real data-fed page in isolation, no backend", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({
					ok: true,
					data: {
						task: TASK,
						ancestors: [],
						children: [],
						tokensActualRollup: null,
						threadId: null,
						attachments: [],
					},
				}),
			})),
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders WorkTaskPage's real heading from mocked fetch through the mock providers", async () => {
		render(
			<MockProviders route={`/work/task/${TASK.id}`}>
				<Routes>
					<Route path="/work/task/:taskId" element={<WorkTaskPage overrideTaskId={TASK.id} />} />
				</Routes>
			</MockProviders>,
		);

		// Asserts against the REAL surface: the page rendered its real heading
		// from mocked task data — no server, no db, no network.
		await waitFor(() => {
			expect(screen.getByRole("heading", { name: TASK.title })).toBeInTheDocument();
		});
	});
});
