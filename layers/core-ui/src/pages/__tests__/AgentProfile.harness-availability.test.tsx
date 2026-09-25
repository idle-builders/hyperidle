/**
 * AgentProfile — harness availability is derived live, not hardcoded.
 *
 * The profile page used to pass a literal `true` into `useAgentRunState`
 * regardless of the agent's actual harness state, so the "Required harness
 * not available" banner could never render. These tests render the page
 * through its real doors — `open_user` for the profile, `search_sessions`
 * for the run state — with neither `overrideData` nor `overrideRunState`,
 * so they fail if the wiring reverts to a hardcoded value at either end:
 * the derivation in `useAgentProfile` or the wiring in `AgentProfile`.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

import { ToastRegion } from "../../shell/ToastRegion.js";
import { AgentProfile } from "../AgentProfile.js";

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

function renderProfile(): void {
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

describe("AgentProfile — harness availability derived from open_user's runsOn", () => {
	beforeEach(() => {
		callMock.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("shows the health warning when the agent's harness is disabled", async () => {
		routeCall([harnessDescriptor(true)]);
		renderProfile();

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toContain("Required harness not available.");
		});
	});

	it("does not show the health warning when the agent's harness is present and enabled", async () => {
		routeCall([harnessDescriptor(false)]);
		renderProfile();

		await waitFor(() => {
			expect(screen.getByTestId("agent-profile-page")).toBeInTheDocument();
		});
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
