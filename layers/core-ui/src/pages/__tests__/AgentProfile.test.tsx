/**
 * AgentProfile: harness availability derived live from open_user's runsOn,
 * an honest "run state unavailable" surface (never a silently-healthy
 * default), deduplicated recent sessions, user-friendly fetch errors, the
 * health-warning banner, and the session-viewer split pane.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentProfileData } from "../../hooks/useAgentProfile.js";
import type { AgentRunState } from "../../hooks/useAgentRunState.js";
import { ToastRegion } from "../../shell/ToastRegion.js";
import { AgentProfile } from "../AgentProfile.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

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

const DEGRADED_RUN_STATE: AgentRunState = {
	status: "ready",
	activeSession: null,
	recentSessions: [],
	performance: { totalSessions: 3, successCount: 1, successRate: 0.33 },
	healthSignals: {
		failureRate7d: 0.8,
		lastSessionCrashed: true,
		harnessAvailable: false,
		idleDurationMs: null,
		degraded: true,
	},
};

function renderProfile(overrideRunState: AgentRunState, overrideData?: AgentProfileData): void {
	render(
		<ToastRegion>
			<MemoryRouter initialEntries={["/agents/agent-test"]}>
				<Routes>
					<Route
						path="/agents/:agentId"
						element={
							<AgentProfile
								overrideData={overrideData ?? BASE_PROFILE}
								overrideRunState={overrideRunState}
							/>
						}
					/>
				</Routes>
			</MemoryRouter>
		</ToastRegion>,
	);
}

beforeEach(() => {
	callMock.mockReset();
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Harness availability is derived live, not hardcoded
// ---------------------------------------------------------------------------

describe("AgentProfile — harness availability derived from open_user's runsOn", () => {
	function openUserOk(runsOn: ReadonlyArray<Record<string, unknown>>) {
		return {
			ok: true,
			data: {
				user: {
					id: "agent-harness",
					kind: "ai",
					name: "Harness Agent",
					role: "builder",
					status: "active",
					agentCategory: "team",
					createdAt: "2026-01-01T00:00:00.000Z",
					team: null,
				},
				runsOn,
				runConfig: {
					harnessType: "opencode",
					modelId: null,
					modelProvider: null,
					maxConcurrentSessions: 1,
					modelOptions: {},
				},
				documentIds: [],
				folders: [],
				subscriptions: [],
				connections: null,
				inbox: null,
				reviewTrackRecord: null,
			},
		};
	}

	function harnessDescriptor(disabled: boolean): Record<string, unknown> {
		return {
			type: "opencode",
			name: "OpenCode",
			kind: "local",
			authAction: { kind: "none", label: "None" },
			discovery: { state: "ready", disabled },
			models: [],
			modelProviders: [],
		};
	}

	function routeCall(runsOn: ReadonlyArray<Record<string, unknown>>): void {
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") return Promise.resolve(openUserOk(runsOn));
			if (name === "search_sessions") return Promise.resolve({ ok: true, data: [] });
			throw new Error(`unexpected call: ${name}`);
		});
	}

	function renderRealProfile(): void {
		render(
			<ToastRegion>
				<MemoryRouter initialEntries={["/agents/agent-harness"]}>
					<Routes>
						<Route path="/agents/:agentId" element={<AgentProfile />} />
					</Routes>
				</MemoryRouter>
			</ToastRegion>,
		);
	}

	beforeEach(() => {
		callMock.mockReset();
	});

	it("shows the health warning when the agent's harness is disabled, but not when enabled", async () => {
		routeCall([harnessDescriptor(true)]);
		renderRealProfile();
		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toContain("Required harness not available.");
		});

		routeCall([harnessDescriptor(false)]);
		renderRealProfile();
		await waitFor(() => {
			expect(screen.getAllByTestId("agent-profile-page").length).toBeGreaterThan(0);
		});
	});
});

// ---------------------------------------------------------------------------
// Run state could not be read — never silently render a healthy agent
// ---------------------------------------------------------------------------

describe("AgentProfile — run state could not be read", () => {
	function runState(status: AgentRunState["status"]): AgentRunState {
		return {
			status,
			activeSession: null,
			recentSessions: [],
			performance: { totalSessions: 0, successCount: 0, successRate: 0 },
			healthSignals: {
				failureRate7d: 0,
				lastSessionCrashed: false,
				harnessAvailable: true,
				idleDurationMs: null,
				degraded: false,
			},
		};
	}

	it("surfaces an alert and '—' instead of a confident zero, and clears once the run state loads", () => {
		const { rerender } = render(
			<ToastRegion>
				<MemoryRouter initialEntries={["/agents/agent-w6"]}>
					<Routes>
						<Route
							path="/agents/:agentId"
							element={
								<AgentProfile overrideData={BASE_PROFILE} overrideRunState={runState("error")} />
							}
						/>
					</Routes>
				</MemoryRouter>
			</ToastRegion>,
		);
		const alert = screen.getByTestId("run-state-unavailable");
		expect(alert).toHaveAttribute("role", "alert");
		expect(alert.textContent).toContain("Run state unavailable");
		const performance = screen.getByTestId("agent-performance-section");
		expect(performance.textContent).toContain("—");
		expect(performance.textContent).not.toContain("0%");

		rerender(
			<ToastRegion>
				<MemoryRouter initialEntries={["/agents/agent-w6"]}>
					<Routes>
						<Route
							path="/agents/:agentId"
							element={
								<AgentProfile overrideData={BASE_PROFILE} overrideRunState={runState("ready")} />
							}
						/>
					</Routes>
				</MemoryRouter>
			</ToastRegion>,
		);
		expect(screen.queryByTestId("run-state-unavailable")).toBeNull();
		expect(screen.getByTestId("agent-performance-section").textContent).toContain("0%");
	});

	it("does not assert zeros while the run read is still in flight (nothing is wrong yet)", () => {
		render(
			<ToastRegion>
				<MemoryRouter initialEntries={["/agents/agent-w6"]}>
					<Routes>
						<Route
							path="/agents/:agentId"
							element={
								<AgentProfile overrideData={BASE_PROFILE} overrideRunState={runState("loading")} />
							}
						/>
					</Routes>
				</MemoryRouter>
			</ToastRegion>,
		);
		const performance = screen.getByTestId("agent-performance-section");
		expect(performance.textContent).toContain("—");
		expect(performance.textContent).not.toContain("0%");
		expect(screen.getByTestId("agent-activity-section").textContent).not.toContain(
			"No sessions recorded",
		);
		expect(screen.queryByTestId("run-state-unavailable")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Deduplicate recent sessions by sessionId
// ---------------------------------------------------------------------------

describe("AgentProfile — deduplicate recent sessions", () => {
	it("renders one row per sessionId even when the same session appears twice", () => {
		renderProfile({
			status: "ready",
			activeSession: null,
			recentSessions: [
				{
					sessionId: "s1",
					taskId: "t1",
					taskTitle: "Task A",
					outcome: "completed",
					startedAt: "2026-08-01T10:00:00.000Z",
					endedAt: null,
				},
				{
					sessionId: "s1",
					taskId: "t1",
					taskTitle: "Task A",
					outcome: "completed",
					startedAt: "2026-08-01T10:00:00.000Z",
					endedAt: null,
				},
				{
					sessionId: "s2",
					taskId: "t2",
					taskTitle: "Task B",
					outcome: "crashed",
					startedAt: "2026-08-02T10:00:00.000Z",
					endedAt: null,
				},
			],
			performance: { totalSessions: 2, successCount: 1, successRate: 0.5 },
			healthSignals: {
				failureRate7d: 0,
				lastSessionCrashed: false,
				harnessAvailable: true,
				idleDurationMs: null,
				degraded: false,
			},
		});

		expect(screen.getAllByText("Task A")).toHaveLength(1);
		expect(screen.getByText("Task B")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// User-friendly fetch errors
// ---------------------------------------------------------------------------

describe("AgentProfile — user-friendly error messages", () => {
	function renderError(message: string): ReturnType<typeof render> {
		return render(
			<MemoryRouter initialEntries={["/agents/agent-test"]}>
				<Routes>
					<Route
						path="/agents/:agentId"
						element={<AgentProfile overrideData={null} overrideError={new Error(message)} />}
					/>
				</Routes>
			</MemoryRouter>,
		);
	}

	it("shows a user-friendly message for 429/503, and a generic retry message for unknown errors", () => {
		const { unmount: unmount429 } = renderError("Agent profile fetch failed: 429");
		expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
		expect(screen.queryByText(/429/)).not.toBeInTheDocument();
		unmount429();

		const { unmount: unmount503 } = renderError("Agent profile fetch failed: 503");
		expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
		expect(screen.queryByText(/503/)).not.toBeInTheDocument();
		unmount503();

		renderError("Network error");
		expect(screen.getByText(/failed to load agent profile/i)).toBeInTheDocument();
		expect(screen.getByText(/couldn't be loaded/i)).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Health-warning banner
// ---------------------------------------------------------------------------

describe("AgentProfile — health banner icon and action link", () => {
	it("renders a hidden warning icon, an 'Edit in Settings' link, and copy naming the degradation reason", () => {
		renderProfile(DEGRADED_RUN_STATE);

		const banner = screen.getByRole("alert");
		expect(banner.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
		expect(banner.textContent).toContain("Health warning");
		expect(banner.textContent).toContain("harness not available");

		// Two "Edit in Settings" links exist: the identity block and the banner.
		expect(
			screen.getAllByRole("link", { name: /edit in settings/i }).length,
		).toBeGreaterThanOrEqual(2);
	});
});

// ---------------------------------------------------------------------------
// Session viewer door
// ---------------------------------------------------------------------------

describe("AgentProfile session viewer door", () => {
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

	beforeEach(() => {
		callMock.mockReset();
		callMock.mockImplementation((name: string) => {
			if (name === "watch_session") {
				return Promise.resolve({
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
							routineId: null,
							notes: null,
							modelTier: "workhorse",
							sourceKind: null,
						},
						activity: [],
					},
				});
			}
			return Promise.resolve({ ok: true, data: [] });
		});
	});

	it("clicking a Recent Activity row opens the session view in the split pane", async () => {
		renderProfile(RUN_STATE);

		const row = await screen.findByTestId("agent-session-row");
		expect(screen.queryByTestId("close-session-view")).not.toBeInTheDocument();

		const user = userEvent.setup();
		await user.click(row);

		await waitFor(() => expect(screen.getByTestId("close-session-view")).toBeInTheDocument());
		expect(callMock).toHaveBeenCalledWith("watch_session", expect.anything());
	});
});
