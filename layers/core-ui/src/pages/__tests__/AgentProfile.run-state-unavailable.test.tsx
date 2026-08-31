/**
 * AU26 review W6 — the agent profile never claims health it could not read.
 *
 * The J4 move made the page fetch run state from `agent-orchestration` and
 * swallow any failure into an empty state. `computeHealthSignals([])` reports
 * "not degraded", so a crashed agent whose runs failed to load rendered as
 * healthy and idle, with 0 sessions and a 0% success rate, and no error surface
 * anywhere — no banner, no chip, no console. These tests hold the fixed
 * behaviour: an explicit alert, and "—" wherever a number would otherwise be
 * asserted as fact.
 */

import type { AgentProfileResponse } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AgentRunState } from "../../hooks/useAgentRunState.js";
import { AgentProfile } from "../AgentProfile.js";

const PROFILE: AgentProfileResponse = {
	id: "agent-w6",
	name: "W6 Agent",
	role: "builder",
	agentCategory: "team",
	teamName: null,
	teamId: null,
	createdAt: "2026-08-01T00:00:00.000Z",
	systemPrompt: "",
	harnessType: "opencode",
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

function renderProfile(state: AgentRunState): void {
	render(
		<MemoryRouter initialEntries={["/agents/agent-w6"]}>
			<Routes>
				<Route
					path="/agents/:agentId"
					element={<AgentProfile overrideData={PROFILE} overrideRunState={state} />}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

describe("AgentProfile — run state could not be read", () => {
	it("keeps top-level profile sections in the major-section spacing range", () => {
		renderProfile(runState("ready"));

		const section = screen.getByTestId("agent-config-section");
		const gap = /\bgap-\[(\d+)px\]/.exec(section.parentElement?.className ?? "");
		expect(Number(gap?.[1])).toBeGreaterThanOrEqual(24);
		expect(Number(gap?.[1])).toBeLessThanOrEqual(36);
	});

	it("surfaces an alert instead of silently rendering a healthy agent", () => {
		renderProfile(runState("error"));

		const alert = screen.getByTestId("run-state-unavailable");
		expect(alert).toHaveAttribute("role", "alert");
		expect(alert.textContent).toContain("Run state unavailable");
	});

	it("shows '—' for sessions and success rate rather than a confident zero", () => {
		renderProfile(runState("error"));

		const performance = screen.getByTestId("agent-performance-section");
		expect(performance.textContent).toContain("—");
		expect(performance.textContent).not.toContain("0%");
	});

	it("does not assert zeros while the run read is still in flight (W5)", () => {
		renderProfile(runState("loading"));

		const performance = screen.getByTestId("agent-performance-section");
		expect(performance.textContent).toContain("—");
		expect(performance.textContent).not.toContain("0%");
		expect(screen.getByTestId("agent-activity-section").textContent).not.toContain(
			"No sessions recorded",
		);
		// Nothing is wrong yet, so nothing is alarming yet.
		expect(screen.queryByTestId("run-state-unavailable")).toBeNull();
	});

	it("does not show the unavailability alert when the run state loaded", () => {
		renderProfile(runState("ready"));

		expect(screen.queryByTestId("run-state-unavailable")).toBeNull();
		expect(screen.getByTestId("agent-performance-section").textContent).toContain("0%");
	});
});
