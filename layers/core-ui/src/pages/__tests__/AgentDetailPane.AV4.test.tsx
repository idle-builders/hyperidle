/**
 * AV4 — AgentDetailPane: RED tests.
 *
 * AC-3: AgentDetailPane body renders without role="dialog"; Save calls PATCH.
 *
 * These tests FAIL until AgentDetailPane is implemented.
 */

import type { RosterMember } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "../../settings/settings-types";
import { AgentDetailPane } from "../work/AgentDetailPane";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockApiFetch = vi.fn();
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

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
	identityKnowledgeId: "ki_af_demo",
	harnessType: "claude-code",
	modelId: null,
	modelProvider: null,
	maxConcurrentSessions: 2,
	status: "active",
	agentCategory: "team",
};

const ROSTER_MEMBER: RosterMember = {
	agentId: "a1",
	name: "Atlas Builder",
	role: "builder",
	isLead: false,
	agentCategory: "team",
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderAgentPane(
	agent: AgentConfig = AGENT_CONFIG,
	rosterMember: RosterMember = ROSTER_MEMBER,
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

afterEach(() => {
	vi.clearAllMocks();
	mockApiFetch.mockReset();
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
	// identity is a knowledge document now, so the pane links to it — one editor
	// for it, not a third copy.
	it("links to the agent's identity document instead of editing it inline", async () => {
		renderAgentPane();

		await waitFor(() => {
			const link = screen.getByTestId("agent-detail-identity-link");
			expect(link.getAttribute("href")).toBe("/documents/ki_af_demo");
		});
		expect(screen.queryByRole("textbox", { name: /system prompt/i })).toBeNull();
	});

	it("[RED] Save button calls PATCH /api/agents/a1", async () => {
		const user = userEvent.setup();
		mockApiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

		renderAgentPane();

		const saveBtn = screen.getByRole("button", { name: /^save$/i });
		await user.click(saveBtn);

		await waitFor(() => {
			const patchCall = mockApiFetch.mock.calls.find(
				(call) => (call[1] as RequestInit)?.method === "PATCH",
			);
			expect(patchCall).toBeDefined();
			expect(patchCall?.[0] as string).toContain("/api/agents/a1");
		});
	});
});
