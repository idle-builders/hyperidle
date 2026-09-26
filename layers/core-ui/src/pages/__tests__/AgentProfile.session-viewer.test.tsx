/**
 * AgentProfile — the session viewer door.
 *
 * A Recent Activity row click fires the same `onOpenSession` OpenTarget path
 * WorkTaskPage.tsx and Conversations.tsx use, mounting `SessionView` in the
 * page's own split pane.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentProfileData } from "../../hooks/useAgentProfile.js";
import type { AgentRunState } from "../../hooks/useAgentRunState.js";
import { ToastRegion } from "../../shell/ToastRegion.js";
import { AgentProfile } from "../AgentProfile.js";

const mockApiFetch = vi.fn();
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const BASE_PROFILE: AgentProfileData = {
	id: "agent-test",
	name: "Test Agent",
	role: "builder",
	agentCategory: "team",
	teamName: null,
	teamId: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	identityDocumentId: "ki_af_demo",
	harnessType: "opencode",
	maxConcurrentSessions: 1,
	subscriptions: [],
	harnessCapabilities: null,
	harnessAvailable: true,
	reviewTrackRecord: null,
};

const RUN_STATE: AgentRunState = {
	status: "ready",
	activeSession: null,
	recentSessions: [
		{
			sessionId: "sess-open-me",
			taskId: "task-1",
			taskTitle: "Task A",
			outcome: "completed",
			startedAt: "2026-08-01T10:00:00.000Z",
			endedAt: "2026-08-01T10:05:00.000Z",
		},
	],
	performance: { totalSessions: 1, successCount: 1, successRate: 1 },
	healthSignals: {
		failureRate7d: 0,
		lastSessionCrashed: false,
		harnessAvailable: true,
		idleDurationMs: null,
		degraded: false,
	},
};

function renderProfile(): void {
	render(
		<ToastRegion>
			<MemoryRouter initialEntries={["/agents/agent-test"]}>
				<Routes>
					<Route
						path="/agents/:agentId"
						element={<AgentProfile overrideData={BASE_PROFILE} overrideRunState={RUN_STATE} />}
					/>
				</Routes>
			</MemoryRouter>
		</ToastRegion>,
	);
}

describe("AgentProfile session viewer door", () => {
	beforeEach(() => {
		mockApiFetch.mockReset();
		mockApiFetch.mockImplementation((url: string) => {
			if (typeof url === "string" && url.includes("/api/actions/watch_session")) {
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							ok: true,
							data: {
								session: {
									id: "sess-open-me",
									agentId: "agent-test",
									taskId: "task-1",
									startedAt: "2026-08-01T10:00:00.000Z",
									endedAt: "2026-08-01T10:05:00.000Z",
									state: "done",
									outcome: "completed",
									effectivenessScore: null,
									routineId: null,
									notes: null,
									modelTier: "workhorse",
									sourceKind: null,
								},
								activity: [],
							},
						}),
				});
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("clicking a Recent Activity row opens the session view in the split pane", async () => {
		renderProfile();

		const row = await screen.findByTestId("agent-session-row");
		expect(screen.queryByTestId("close-session-view")).not.toBeInTheDocument();

		const user = userEvent.setup();
		await user.click(row);

		await waitFor(() => expect(screen.getByTestId("close-session-view")).toBeInTheDocument());
		expect(mockApiFetch).toHaveBeenCalledWith(
			expect.stringContaining("/api/actions/watch_session"),
			expect.anything(),
		);
	});
});
