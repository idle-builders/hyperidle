/**
 * AV4 — AgentDetailPane: RED tests.
 *
 * AC-3: AgentDetailPane body renders without role="dialog"; Save calls edit_user.
 *
 * These tests FAIL until AgentDetailPane is implemented.
 *
 * @lore BC5 T9: the door swap — `call` mocked at the door. The pane fetches
 * its own `open_user({ id: agent.id })` the moment an agent is selected (see
 * AgentDetailPane.tsx's own header comment) — the roster's `AgentConfig`
 * carries no harness/identity data, so the mock's `open_user` branch is what
 * actually supplies them here, not the `agent` prop.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamRosterMember } from "../../hooks/useTeam.js";
import type { AgentConfig } from "../../settings/settings-types";
import { AgentDetailPane } from "../work/AgentDetailPane";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

vi.mock("../../shell/ToastRegion.js", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

// @lore AU26 J4: the roster's run state is fetched from `agent-orchestration`
// (`useRosterRunState`), not stamped onto `RosterMember` by core-api. Stub the
// hook with the values the wire fixtures used to carry — the row's rendering
// contract is what these tests cover and it is unchanged.
const ROSTER_RUN_STATE = new Map<string, unknown>([["a1", {}]]);

vi.mock("../../hooks/useAgentRunState", async () => {
	const actual = await vi.importActual<typeof import("../../hooks/useAgentRunState.js")>(
		"../../hooks/useAgentRunState.js",
	);
	return {
		...actual,
		useRosterRunState: () => ({ byAgent: ROSTER_RUN_STATE, status: "ready" as const }),
	};
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AGENT_CONFIG: AgentConfig = {
	id: "a1",
	name: "Atlas Builder",
	role: "builder",
	identityDocumentId: null,
	harnessType: null,
	modelId: null,
	modelProvider: null,
	maxConcurrentSessions: 1,
	status: "active",
	agentCategory: "team",
};

const ROSTER_MEMBER: TeamRosterMember = {
	agentId: "a1",
	name: "Atlas Builder",
	role: "builder",
	agentCategory: "team",
};

function setupCall(): void {
	callMock.mockImplementation((name: string) => {
		if (name === "open_user") {
			return Promise.resolve({
				ok: true,
				data: {
					user: { id: "a1", name: "Atlas Builder" },
					runsOn: [],
					runConfig: {
						harnessType: "claude-code",
						modelId: null,
						modelProvider: null,
						maxConcurrentSessions: 2,
						modelOptions: {},
					},
					documentIds: [{ slot: "agent_file", id: "ki_af_demo" }],
					folders: [],
					subscriptions: [],
					connections: null,
					behaviour: null,
					inbox: null,
				},
			});
		}
		if (name === "edit_user") return Promise.resolve({ ok: true, data: { user: { id: "a1" } } });
		return Promise.resolve({ ok: true, data: [] });
	});
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderAgentPane(
	agent: AgentConfig = AGENT_CONFIG,
	rosterMember: TeamRosterMember = ROSTER_MEMBER,
): ReturnType<typeof render> {
	const onClose = vi.fn();
	const onSaved = vi.fn();
	return render(
		<MemoryRouter>
			<AgentDetailPane
				agent={agent}
				rosterMember={rosterMember}
				onClose={onClose}
				onSaved={onSaved}
			/>
		</MemoryRouter>,
	);
}

beforeEach(() => {
	callMock.mockReset();
	setupCall();
});

afterEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// AC-3: AgentDetailPane has no role="dialog" + links to the identity document
// ---------------------------------------------------------------------------

describe("AgentDetailPane renders as a detail pane without dialog chrome", () => {
	it("[RED] renders without any role='dialog' element (Dialog shell stripped)", async () => {
		const { container } = renderAgentPane();

		await waitFor(() => {
			expect(screen.getByTestId("agent-detail-identity-link")).toBeInTheDocument();
		});

		const dialogs = container.querySelectorAll('[role="dialog"]');
		expect(dialogs.length).toBe(0);
	});

	it("[RED] shows the agent name in the pane", async () => {
		renderAgentPane();

		await waitFor(() => {
			const matches = screen.getAllByText("Atlas Builder");
			expect(matches.length).toBeGreaterThanOrEqual(1);
		});
	});

	// @lore BA9f: the pane used to hold a system-prompt textarea. An agent's
	// identity is a document now, so the pane links to it — one editor
	// for it, not a third copy.
	it("links to the agent's identity document instead of editing it inline", async () => {
		renderAgentPane();

		await waitFor(() => {
			const link = screen.getByTestId("agent-detail-identity-link");
			expect(link.getAttribute("href")).toBe("/documents/ki_af_demo");
		});
		expect(screen.queryByRole("textbox", { name: /system prompt/i })).toBeNull();
	});

	it("[RED] Save button calls edit_user with id: a1", async () => {
		const user = userEvent.setup();

		renderAgentPane();

		await waitFor(() => {
			expect(screen.getByTestId("agent-detail-identity-link")).toBeInTheDocument();
		});

		const saveBtn = screen.getByRole("button", { name: /^save$/i });
		await user.click(saveBtn);

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", expect.objectContaining({ id: "a1" }));
		});
	});
});
