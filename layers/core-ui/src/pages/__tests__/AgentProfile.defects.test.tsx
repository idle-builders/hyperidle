/**
 * AgentProfile — UI defect fixes.
 *
 * UI-072: duplicate sessionId rows in recentSessions must be deduplicated
 *         before rendering.
 * UI-014: non-404 fetch errors must show a user-friendly message (not raw
 *         HTTP status codes) with a retry mechanism.
 * UI-105: health warning banner must contain a warning icon and a settings
 *         action link.
 */

import type { AgentProfileResponse } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AgentRunState } from "../../hooks/useAgentRunState.js";
import { AgentProfile } from "../AgentProfile.js";

const BASE_PROFILE: AgentProfileResponse = {
	id: "agent-test",
	name: "Test Agent",
	role: "builder",
	agentCategory: "team",
	teamName: null,
	teamId: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	systemPrompt: "",
	harnessType: "builtin",
	modelTierPreference: "fast",
	maxConcurrentSessions: 1,
	mcpSetup: null,
	harnessAvailable: true,
	harnessCapabilities: {
		toolUse: true,
		mcpSupport: false,
		fileEditing: true,
		subAgents: false,
	},
	reviewTrackRecord: { approvalRate: 0, totalVerdicts: 0, recentVerdicts: [], windowDays: 30 },
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

function renderProfile(overrideRunState: AgentRunState, overrideData?: AgentProfileResponse): void {
	render(
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
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// UI-072 — deduplication of recentSessions by sessionId
// ---------------------------------------------------------------------------

describe("AgentProfile UI-072 — deduplicate recent sessions", () => {
	it("renders a deduplicated table when the same sessionId appears twice", () => {
		const dupedState: AgentRunState = {
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
		};

		renderProfile(dupedState);

		// Only one row for Task A (the duplicate is filtered out)
		const taskACells = screen.getAllByText("Task A");
		expect(taskACells).toHaveLength(1);

		// Task B still renders
		expect(screen.getByText("Task B")).toBeInTheDocument();
	});

	it("renders all rows when every sessionId is unique", () => {
		const uniqueState: AgentRunState = {
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
		};

		renderProfile(uniqueState);

		expect(screen.getByText("Task A")).toBeInTheDocument();
		expect(screen.getByText("Task B")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// UI-014 — user-friendly error messages
// ---------------------------------------------------------------------------

describe("AgentProfile UI-014 — user-friendly error messages", () => {
	// Pass overrideData={null} alongside overrideError so loading is false.
	// overrideData=null means "resolved: no data" — it skips the fetch and lets
	// the error branch fire immediately.

	it("shows a user-friendly 429 message instead of raw status code", () => {
		render(
			<MemoryRouter initialEntries={["/agents/agent-test"]}>
				<Routes>
					<Route
						path="/agents/:agentId"
						element={
							<AgentProfile
								overrideData={null}
								overrideError={new Error("Agent profile fetch failed: 429")}
							/>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
		expect(screen.queryByText(/429/)).not.toBeInTheDocument();
	});

	it("shows a user-friendly 500 message instead of raw status code", () => {
		render(
			<MemoryRouter initialEntries={["/agents/agent-test"]}>
				<Routes>
					<Route
						path="/agents/:agentId"
						element={
							<AgentProfile
								overrideData={null}
								overrideError={new Error("Agent profile fetch failed: 503")}
							/>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
		expect(screen.queryByText(/503/)).not.toBeInTheDocument();
	});

	it("shows a generic retry message for unknown errors", () => {
		render(
			<MemoryRouter initialEntries={["/agents/agent-test"]}>
				<Routes>
					<Route
						path="/agents/:agentId"
						element={
							<AgentProfile overrideData={null} overrideError={new Error("Network error")} />
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		// ErrorState renders title + description
		expect(screen.getByText(/failed to load agent profile/i)).toBeInTheDocument();
		expect(screen.getByText(/couldn't be loaded/i)).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// UI-105 — health banner has warning icon + settings action link
// ---------------------------------------------------------------------------

describe("AgentProfile UI-105 — health banner icon and action link", () => {
	it("renders an SVG warning icon inside the health banner", () => {
		renderProfile(DEGRADED_RUN_STATE);

		const banner = screen.getByRole("alert");
		// The banner should have an SVG icon for the warning
		const svg = banner.querySelector("svg");
		expect(svg).not.toBeNull();
		expect(svg).toHaveAttribute("aria-hidden", "true");
	});

	it("renders 'Edit in Settings' link inside the health banner", () => {
		renderProfile(DEGRADED_RUN_STATE);

		// There are two "Edit in Settings" links: the identity block and the banner.
		// The banner should have one.
		const links = screen.getAllByRole("link", { name: /edit in settings/i });
		expect(links.length).toBeGreaterThanOrEqual(2);
	});

	it("health banner copy explains the degradation reason", () => {
		renderProfile(DEGRADED_RUN_STATE);

		// Only the health banner alert is rendered when run-state is ready (no
		// run-state-unavailable alert). getByRole("alert") finds it without
		// needing an accessible name the element doesn't have.
		const banner = screen.getByRole("alert");
		expect(banner.textContent).toContain("Health warning");
		expect(banner.textContent).toContain("harness not available");
	});
});
