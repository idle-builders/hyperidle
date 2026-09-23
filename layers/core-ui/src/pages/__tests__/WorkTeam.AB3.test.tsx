/**
 * AB3 — WorkTeam: Agent Configuration & Customization tests.
 *
 * AC coverage:
 * AC-1: Agent cards show name, role description, and category tag for non-team agents.
 * AC-2: Clicking agent card opens edit dialog pre-filled with system prompt textarea.
 * AC-3: Edit dialog respects category — app-managed agents show note + disabled config.
 * AC-4: Config section save calls edit_user with updated values.
 * AC-5: "+ Add agent" button opens create dialog; Create calls edit_user (kind: ai).
 *
 * These tests FAIL until:
 * - WorkTeam roster section is replaced with agent cards (data-testid="agent-row")
 * - AgentEditDialog component is created
 * - AgentAddDialog component is created
 * - useTeamAgents hook is created
 * - RosterMember.agentCategory field is added
 *
 * @lore BC5 T9: the door swap — `call` mocked at the door. `useTeamAgents` is
 * mocked directly (empty map — its own coverage lives in useAgents' tests),
 * so the roster's category tags come straight off `TeamPageData.roster`; the
 * pane's harness/identity fields come off `open_user({ id })`, fired the
 * moment `AgentDetailPane` selects an agent (AgentDetailPane's own @lore).
 * AC-6 (the first-time hint banner) is dropped — it was never implemented in
 * this file to begin with (the docstring named it, no test did).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamPageData } from "../../hooks/useTeam.js";
import { WorkTeam } from "../WorkTeam";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock ArtifactSection to prevent it consuming fetch mocks
vi.mock("../../components/ArtifactSection.js", () => ({
	ArtifactSection: () => null,
}));

// Mock toast
vi.mock("../../shell/ToastRegion.js", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A TeamPageData with a mix of agent categories.
 * TeamRosterMember now requires agentCategory (AB3 extension).
 */
const TEAM_WITH_AGENTS: TeamPageData = {
	team: {
		id: "ab3-team-1",
		name: "AB3 Test Team",
		status: "healthy",
	},
	roster: [
		{
			agentId: "agent-builder-1",
			name: "Atlas Builder",
			role: "builder",
			agentCategory: "team",
		},
		{
			agentId: "agent-scout-1",
			name: "Scout Agent",
			role: "scout",
			// @lore BA9d: strategy category removed; scout is now individual
			agentCategory: "individual",
		},
		{
			agentId: "agent-cos-1",
			name: "System Agent",
			role: "assistant",
			agentCategory: "individual",
		},
	],
	tasksInProgress: [],
};

/** Mock per-agent `open_user` runConfig/documentIds, keyed by agent id. */
const MOCK_AGENT_CONFIGS: Record<
	string,
	{ harnessType: string | null; maxConcurrentSessions: number; identityDocumentId: string | null }
> = {
	"agent-builder-1": {
		harnessType: "claude-code",
		maxConcurrentSessions: 2,
		identityDocumentId: "ki_af_demo",
	},
	"agent-scout-1": {
		harnessType: null,
		maxConcurrentSessions: 1,
		identityDocumentId: "ki_af_demo",
	},
	"agent-cos-1": { harnessType: null, maxConcurrentSessions: 1, identityDocumentId: "ki_af_demo" },
};

/** Routes `open_user`/`edit_user` against MOCK_AGENT_CONFIGS. */
function setupCall(): void {
	callMock.mockImplementation((name: string, input: Record<string, unknown>) => {
		if (name === "open_user") {
			const id = input.id as string | undefined;
			if (id === undefined) {
				return Promise.resolve({
					ok: true,
					data: {
						user: { id: "self", team: { id: "ab3-team-1", name: "AB3 Test Team" } },
						runsOn: [],
						runConfig: null,
						documentIds: [],
						folders: [],
						subscriptions: [],
						connections: null,
						behaviour: null,
						inbox: null,
					},
				});
			}
			const config = MOCK_AGENT_CONFIGS[id];
			return Promise.resolve({
				ok: true,
				data: {
					user: { id, name: id },
					runsOn: [],
					runConfig: config
						? {
								harnessType: config.harnessType,
								modelId: null,
								modelProvider: null,
								maxConcurrentSessions: config.maxConcurrentSessions,
								modelOptions: {},
							}
						: null,
					documentIds: config?.identityDocumentId
						? [{ slot: "agent_file", id: config.identityDocumentId }]
						: [],
					folders: [],
					subscriptions: [],
					connections: null,
					behaviour: null,
					inbox: null,
				},
			});
		}
		if (name === "edit_user")
			return Promise.resolve({ ok: true, data: { user: { id: "agent-new" } } });
		if (name === "search_users") {
			// `useTeamAgents` filters `useAgents`' `search_users(kind: ai)` fetch —
			// the roster rows so `paneAgent` resolves to something non-null.
			return Promise.resolve({
				ok: true,
				data: Object.keys(MOCK_AGENT_CONFIGS).map((id) => ({
					id,
					kind: "ai",
					name: id,
					role: "builder",
					status: "active",
					email: null,
					avatarUrl: null,
					createdAt: "2026-01-01T00:00:00.000Z",
					agentCategory: "team",
					ownerUserId: null,
					health: null,
					team: null,
					edges: [],
				})),
			});
		}
		return Promise.resolve({ ok: true, data: [] });
	});
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderWithHints(ui: ReactNode, path = "/work/team/ab3-team-1"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route path="/work/team/:teamId" element={ui} />
				<Route path="*" element={ui} />
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// AC-1: Agent cards show name, description, and category tags
// ---------------------------------------------------------------------------

describe("AB3 AC-1 — Agent cards with name, description, and category tags", () => {
	beforeEach(() => {
		callMock.mockReset();
		setupCall();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders agent cards with data-testid='agent-card' for each roster member", async () => {
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			const cards = screen.getAllByTestId("agent-row");
			expect(cards.length).toBe(3);
		});
	});

	it("each agent card shows the agent name", async () => {
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getByText("Atlas Builder")).toBeInTheDocument();
			expect(screen.getByText("Scout Agent")).toBeInTheDocument();
			// @lore AD8a: display name changed from "Chief of Staff" to "System Agent".
			expect(screen.getByText("System Agent")).toBeInTheDocument();
		});
	});

	// @lore BA9g: the card showed a one-line description the role catalog carried
	// — "Engineer. Implements features…". The catalog is gone: a role is a string
	// on an agent, and what an agent is for is its identity document, not a
	// sentence the product wrote about its role. The card shows the role.
	it("each agent card shows its role", async () => {
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getByText("Builder")).toBeInTheDocument();
		});
	});

	// @lore BA9d: App-managed category (strategy) deleted — no App-managed test.
	// @lore AD8a: "personal" category renamed to "individual"; display label updated to "Individual".
	it("individual agent card shows an 'Individual' category tag", async () => {
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			const tags = screen.getAllByTestId("agent-card-category");
			const tagTexts = tags.map((t) => t.textContent ?? "");
			expect(tagTexts.some((t) => t.includes("Individual"))).toBe(true);
		});
	});

	it("team agent card does NOT show a category tag", async () => {
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			const cards = screen.getAllByTestId("agent-row");
			expect(cards.length).toBe(3);
		});

		// The team agent (Atlas Builder) card should not contain a category testid
		// We check the tags count — only 2 (both individual), not 3
		// @lore BA9d: strategy category removed; scout and System Agent are both "individual"
		const tags = screen.queryAllByTestId("agent-card-category");
		expect(tags.length).toBe(2); // two individual-category agents (scout + System Agent)
	});
});

// ---------------------------------------------------------------------------
// AC-2: Edit dialog opens with system prompt textarea pre-filled
// ---------------------------------------------------------------------------

describe("AB3 AC-2 — Edit dialog system prompt textarea pre-filled", () => {
	beforeEach(() => {
		callMock.mockReset();
		setupCall();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// @lore AV4: Customize now opens AgentDetailPane in split pane (no modal).
	it("clicking an agent card opens the agent detail pane (no dialog)", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-row").length).toBe(3);
		});

		const rows = screen.getAllByTestId("agent-row");
		const firstBtn = rows[0]?.querySelector('[data-testid="agent-customize-btn"]');
		expect(firstBtn).toBeDefined();
		await user.click((firstBtn as HTMLElement) ?? document.body);

		// AV4: pane opens — no role="dialog"; BA9f: the identity link is the marker
		await waitFor(() => {
			expect(screen.getByTestId("agent-detail-identity-link")).toBeInTheDocument();
		});
		expect(document.querySelectorAll('[role="dialog"]').length).toBe(0);
	});

	it("edit dialog contains guidance text about system prompt", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-row").length).toBe(3);
		});

		const rowForGuidance = screen.getAllByTestId("agent-row")[0];
		const btnForGuidance = rowForGuidance?.querySelector('[data-testid="agent-customize-btn"]');
		expect(btnForGuidance).toBeDefined();
		await user.click((btnForGuidance as HTMLElement) ?? document.body);

		await waitFor(() => {
			expect(screen.getByText(/Personality, style, and values/i)).toBeInTheDocument();
		});
	});

	// @lore BA9f: the pane links to the agent's identity document instead of
	// carrying a textarea for it. Same claim — the pane reaches this agent's
	// identity — read off the link the pane now renders.
	it("the pane links to this agent's identity document", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-row").length).toBe(3);
		});

		// Click the builder row's Customize button (has systemPrompt set)
		const rowForSystemPrompt = screen.getAllByTestId("agent-row")[0];
		const btnForSystemPrompt = rowForSystemPrompt?.querySelector(
			'[data-testid="agent-customize-btn"]',
		);
		expect(btnForSystemPrompt).toBeDefined();
		await user.click((btnForSystemPrompt as HTMLElement) ?? document.body);

		await waitFor(() => {
			const link = screen.getByTestId("agent-detail-identity-link");
			expect(link.getAttribute("href")).toBe("/documents/ki_af_demo");
		});
	});

	// @lore AV4: Agent pane (not dialog) shows agent name.
	it("agent pane header shows agent name", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-row").length).toBe(3);
		});

		const rowForHeader = screen.getAllByTestId("agent-row")[0];
		const btnForHeader = rowForHeader?.querySelector('[data-testid="agent-customize-btn"]');
		expect(btnForHeader).toBeDefined();
		await user.click((btnForHeader as HTMLElement) ?? document.body);

		await waitFor(() => {
			// Name appears in pane (no dialog)
			expect(screen.getAllByText("Atlas Builder").length).toBeGreaterThanOrEqual(1);
		});
	});
});

// ---------------------------------------------------------------------------
// AC-3: Edit dialog respects agent categories
// ---------------------------------------------------------------------------

describe("AB3 AC-3 — Edit dialog category-aware behavior", () => {
	beforeEach(() => {
		callMock.mockReset();
		setupCall();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// @lore BA9d D5: app-managed dialog tests deleted — strategy category and the
	// "managed by app defaults" UI lock are removed. Plugins now configure agents.

	// @lore AV4: team agent pane (no dialog) does NOT show app-managed note.
	it("team agent pane does NOT show app defaults management note", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-row").length).toBe(3);
		});

		const builderRow1 = screen
			.getAllByTestId("agent-row")
			.find((c) => c.textContent?.includes("Atlas Builder"));
		const builderBtn1 = builderRow1?.querySelector('[data-testid="agent-customize-btn"]');
		expect(builderBtn1).toBeDefined();
		await user.click((builderBtn1 as HTMLElement) ?? document.body);

		// AV4: wait for pane to open (system prompt textarea present)
		await waitFor(() => {
			expect(screen.getByTestId("agent-detail-identity-link")).toBeInTheDocument();
		});

		expect(screen.queryByText(/managed by app defaults/i)).not.toBeInTheDocument();
	});

	// @lore BA9d D5: app-managed config-disabled test deleted — strategy category and
	// the disabled-config-for-app-managed-agents UI are removed. Plugins configure agents.

	// @lore AV4: team agent config fields in pane (no dialog).
	it("team agent config fields are enabled when config section is expanded", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-row").length).toBe(3);
		});

		const builderRow2 = screen
			.getAllByTestId("agent-row")
			.find((c) => c.textContent?.includes("Atlas Builder"));
		const builderBtn2 = builderRow2?.querySelector('[data-testid="agent-customize-btn"]');
		expect(builderBtn2).toBeDefined();
		await user.click((builderBtn2 as HTMLElement) ?? document.body);

		// AV4: wait for pane (no dialog check)
		await waitFor(() => {
			expect(screen.getByTestId("agent-detail-identity-link")).toBeInTheDocument();
		});

		const configToggle = screen.getByRole("button", { name: /show configuration/i });
		await user.click(configToggle);

		await waitFor(() => {
			const harnessInput = screen.getByLabelText(/harness/i);
			expect(harnessInput).not.toBeDisabled();
		});
	});
});

// ---------------------------------------------------------------------------
// AC-4: Config save calls PATCH /api/agents/:id
// ---------------------------------------------------------------------------

describe("AB3 AC-4 — Config save via PATCH /api/agents/:id", () => {
	beforeEach(() => {
		callMock.mockReset();
		setupCall();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// @lore BA9f: "Save writes the edited system prompt" lived here. The persona
	// is a document now — this pane links to it and never PATCHes it —
	// so the claim belongs to the document edit endpoint. That this pane's Save
	// reaches `PATCH /api/agents/:id` at all is proven by the next test.

	// @lore This test used to change the Model tier select and assert the PATCH
	// body carried `modelTierPreference`. That dial is gone: it named a
	// model-gateway entry, selected nothing once the gateway went, and was
	// unreachable anyway on the path every real session takes — the durable drain
	// always supplies its own tier. People choose a model per agent instead, which
	// is what reaches the harness. The claim itself — this pane's Save reaches
	// `PATCH /api/agents/:id` with what the user edited — is unchanged, so the
	// test makes it over the config field that survived.
	it("Save button calls edit_user with the edited harness", async () => {
		const user = userEvent.setup();

		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-row").length).toBe(3);
		});

		const builderRow4 = screen
			.getAllByTestId("agent-row")
			.find((c) => c.textContent?.includes("Atlas Builder"));
		const builderBtn4 = builderRow4?.querySelector('[data-testid="agent-customize-btn"]');
		expect(builderBtn4).toBeDefined();
		await user.click((builderBtn4 as HTMLElement) ?? document.body);

		// AV4: pane opens (no dialog)
		await waitFor(() => {
			expect(screen.getByTestId("agent-detail-identity-link")).toBeInTheDocument();
		});

		// Expand config
		const configToggle = screen.getByRole("button", { name: /show configuration/i });
		await user.click(configToggle);

		// Change the harness
		await waitFor(() => {
			expect(screen.getByLabelText(/harness/i)).toBeInTheDocument();
		});
		await user.clear(screen.getByLabelText(/harness/i));
		await user.type(screen.getByLabelText(/harness/i), "codex");

		// Click Save
		const saveBtn = screen.getByRole("button", { name: /^save$/i });
		await user.click(saveBtn);

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith(
				"edit_user",
				expect.objectContaining({
					id: "agent-builder-1",
					runConfig: expect.objectContaining({ harnessType: "codex" }),
				}),
			);
		});
	});
});

// ---------------------------------------------------------------------------
// AC-5: Add custom agent flow
// ---------------------------------------------------------------------------

describe("AB3 AC-5 — Add custom agent dialog", () => {
	beforeEach(() => {
		callMock.mockReset();
		setupCall();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders a '+ Add agent' button below the roster", async () => {
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-row").length).toBe(3);
		});

		expect(screen.getByRole("button", { name: /\+ add agent/i })).toBeInTheDocument();
	});

	it("clicking '+ Add agent' opens the create dialog", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-row").length).toBe(3);
		});

		await user.click(screen.getByRole("button", { name: /\+ add agent/i }));

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});
	});

	it("create dialog has a name input and role select", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-row").length).toBe(3);
		});

		await user.click(screen.getByRole("button", { name: /\+ add agent/i }));

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
			expect(screen.getByRole("textbox", { name: /agent name/i })).toBeInTheDocument();
			// The role field is the shared Combobox — named "Role" for assistive tech.
			expect(screen.getByRole("combobox", { name: /role/i })).toBeInTheDocument();
		});
	});

	it("clicking Create calls edit_user with the team name", async () => {
		const user = userEvent.setup();

		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-row").length).toBe(3);
		});

		await user.click(screen.getByRole("button", { name: /\+ add agent/i }));

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});

		// Fill in agent name
		const nameInput = screen.getByRole("textbox", { name: /agent name/i });
		await user.type(nameInput, "New Custom Agent");

		// Click Create button
		const createBtn = screen.getByRole("button", { name: /^create$/i });
		await user.click(createBtn);

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith(
				"edit_user",
				expect.objectContaining({
					kind: "ai",
					name: "New Custom Agent",
					team: { name: "AB3 Test Team" },
				}),
			);
		});
	});
});
