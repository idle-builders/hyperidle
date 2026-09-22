/**
 * WorkTaskPage — the session viewer door (BC6).
 *
 * A `SessionRow` click fires the same `onOpenSession` OpenTarget path
 * Conversations.tsx uses, mounting `SessionView` in the page's own split
 * pane — no navigation away from the task.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTaskPage } from "../WorkTaskPage";

const mockApiFetch = vi.fn();
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("../../components/ArtifactSection.js", () => ({
	ArtifactSection: () => null,
}));

vi.mock("../../shell/HostThreadSection.js", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

vi.mock("../../shell/NavHistoryCluster.js", () => ({
	NavHistoryCluster: () => null,
}));

vi.mock("../../hooks/useViewportBreakpoint.js", () => ({
	useViewportBreakpoint: () => ({ sidebarMobile: false }),
}));

const TASK_ID = "task-with-session";

const TASK_TREE = {
	task: {
		id: TASK_ID,
		parentTaskId: null,
		teamId: "team-1",
		ownerAgentId: null,
		title: "A task with a session",
		description: null,
		doneCondition: null,
		state: "in_progress",
		position: 0,
		dependencies: null,
		threadId: null,
		notes: null,
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
		tokensActualJson: null,
		sourceDocumentId: null,
		createdAt: "2026-09-01T00:00:00.000Z",
		updatedAt: "2026-09-01T00:00:00.000Z",
		completedAt: null,
	},
	ancestors: [],
	children: [],
};

const SESSION_ROW = {
	id: "sess-open-me",
	agentId: "agent-1",
	taskId: TASK_ID,
	startedAt: "2026-09-01T00:01:00.000Z",
	endedAt: null,
	state: "active",
	outcome: null,
	effectivenessScore: null,
	routineId: null,
	notes: null,
	modelTier: "workhorse",
	sourceKind: null,
};

function setupFetch(): void {
	mockApiFetch.mockImplementation((url: string) => {
		if (typeof url === "string" && url.includes("/api/actions/open_task")) {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ ok: true, data: TASK_TREE }),
			});
		}
		if (typeof url === "string" && url.includes("/api/actions/search_sessions")) {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ ok: true, data: [SESSION_ROW] }),
			});
		}
		if (typeof url === "string" && url.includes("/api/actions/watch_session")) {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ ok: true, data: { session: SESSION_ROW, activity: [] } }),
			});
		}
		if (typeof url === "string" && url.includes("/api/auth/me")) {
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						id: "viewer-1",
						name: "Viewer",
						email: "v@example.com",
						avatarUrl: null,
					}),
			});
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
	});
}

function renderPage(): void {
	render(
		<MemoryRouter initialEntries={[`/work/task/${TASK_ID}`]}>
			<Routes>
				<Route path="/work/task/:taskId" element={<WorkTaskPage overrideTaskId={TASK_ID} />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkTaskPage session viewer door (BC6)", () => {
	beforeEach(() => {
		mockApiFetch.mockReset();
		setupFetch();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("clicking a session row opens the session view in the split pane", async () => {
		renderPage();

		const row = await screen.findByTestId("session-row");
		expect(screen.queryByTestId("close-session-view")).not.toBeInTheDocument();

		const user = userEvent.setup();
		await user.click(row);

		await waitFor(() => expect(screen.getByTestId("close-session-view")).toBeInTheDocument());
		expect(mockApiFetch).toHaveBeenCalledWith(
			expect.stringContaining("/api/actions/watch_session"),
			expect.anything(),
		);
	});

	it("closing the session view returns to the fold-back task pane", async () => {
		renderPage();

		const row = await screen.findByTestId("session-row");
		const user = userEvent.setup();
		await user.click(row);

		await waitFor(() => expect(screen.getByTestId("close-session-view")).toBeInTheDocument());
		await user.click(screen.getByTestId("close-session-view"));

		await waitFor(() => expect(screen.queryByTestId("close-session-view")).not.toBeInTheDocument());
	});
});
