/**
 * AB3 — WorkTeam: Agent Configuration & Customization tests.
 *
 * AC coverage:
 * AC-1: Agent cards show name, role description, and category tag for non-team agents.
 * AC-2: Clicking agent card opens edit dialog pre-filled with soul textarea.
 * AC-3: Edit dialog respects category — strategy agents show note + disabled config.
 * AC-4: Config section save calls PATCH /api/agents/:id with updated values.
 * AC-5: "+ Add agent" button opens create dialog; Create calls POST /api/agents.
 * AC-6: First-time hint banner with data-testid="hint-review-agents" is visible.
 *
 * These tests FAIL until:
 * - WorkTeam roster section is replaced with agent cards (data-testid="agent-card")
 * - AgentEditDialog component is created
 * - AgentAddDialog component is created
 * - useTeamAgents hook is created
 * - "review-agents" hint is added to HintId union and HINT_CATALOG
 * - RosterMember.agentCategory field is added
 */

import type { TeamDetail } from "@hyperidle/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HintProvider } from "../../hooks/useHints";
import { WorkTeam } from "../WorkTeam";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock ArtifactSection to prevent it consuming fetch mocks
vi.mock("../../components/ArtifactSection.js", () => ({
	ArtifactSection: () => null,
	useArtifactOpen: () => vi.fn(),
}));

// Mock apiFetch for dialog save/create calls
const mockApiFetch = vi.fn();
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// Mock toast
vi.mock("../../shell/ToastRegion.js", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A TeamDetail with a mix of agent categories.
 * RosterMember now requires agentCategory (AB3 extension).
 */
const TEAM_WITH_AGENTS: TeamDetail = {
	team: {
		id: "ab3-team-1",
		name: "AB3 Test Team",
		phase: "build",
		status: "healthy",
		leadAgentId: "agent-builder-1",
	},
	teamMembers: {
		id: "tm-ab3",
		formedAt: "2026-01-01T00:00:00.000Z",
		dissolvedAt: null,
	},
	roster: [
		{
			agentId: "agent-builder-1",
			name: "Atlas Builder",
			role: "builder",
			isLead: true,
			agentCategory: "team",
		},
		{
			agentId: "agent-scout-1",
			name: "Scout Agent",
			role: "scout",
			isLead: false,
			agentCategory: "strategy",
		},
		{
			agentId: "agent-cos-1",
			name: "Chief of Staff",
			role: "chief_of_staff",
			isLead: false,
			agentCategory: "personal",
		},
	],
	burn: {
		costActual: null,
		costCap: null,
		capacity: 5,
		activeBets: 0,
	},
	activeBets: [],
};

/** Mock agent configs returned by GET /api/agents */
const MOCK_AGENT_CONFIGS = [
	{
		id: "agent-builder-1",
		name: "Atlas Builder",
		role: "builder",
		soulPrompt: "You are a meticulous builder who values clean code.",
		harnessType: "claude-code",
		modelTierPreference: "workhorse",
		maxConcurrentSessions: 2,
		status: "active",
		activeSessions: 0,
		agentCategory: "team",
	},
	{
		id: "agent-scout-1",
		name: "Scout Agent",
		role: "scout",
		soulPrompt: null,
		harnessType: null,
		modelTierPreference: null,
		maxConcurrentSessions: 1,
		status: "active",
		activeSessions: 0,
		agentCategory: "strategy",
	},
	{
		id: "agent-cos-1",
		name: "Chief of Staff",
		role: "chief_of_staff",
		soulPrompt: "Personal assistant persona.",
		harnessType: null,
		modelTierPreference: null,
		maxConcurrentSessions: 1,
		status: "active",
		activeSessions: 0,
		agentCategory: "personal",
	},
];

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderWithHints(
	ui: ReactNode,
	path = "/work/team/ab3-team-1",
): ReturnType<typeof render> {
	return render(
		<HintProvider>
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route path="/work/team/:teamId" element={ui} />
					<Route path="*" element={ui} />
				</Routes>
			</MemoryRouter>
		</HintProvider>,
	);
}

function makeHintResponse(dismissed: string[] = []): Response {
	return new Response(
		JSON.stringify({ dismissed: dismissed.map((hintId) => ({ hintId, seenAt: "2026-01-01T00:00:00.000Z" })) }),
		{ status: 200 },
	);
}

function makeAgentsResponse(agents = MOCK_AGENT_CONFIGS): Response {
	return new Response(JSON.stringify(agents), { status: 200 });
}

// ---------------------------------------------------------------------------
// AC-1: Agent cards show name, description, and category tags
// ---------------------------------------------------------------------------

describe("AB3 AC-1 — Agent cards with name, description, and category tags", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
		fetchSpy.mockResolvedValue(makeHintResponse());
		mockApiFetch.mockResolvedValue(makeAgentsResponse());
	});

	afterEach(() => {
		vi.restoreAllMocks();
		mockApiFetch.mockReset();
	});

	it("renders agent cards with data-testid='agent-card' for each roster member", async () => {
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			const cards = screen.getAllByTestId("agent-card");
			expect(cards.length).toBe(3);
		});
	});

	it("each agent card shows the agent name", async () => {
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getByText("Atlas Builder")).toBeInTheDocument();
			expect(screen.getByText("Scout Agent")).toBeInTheDocument();
			expect(screen.getByText("Chief of Staff")).toBeInTheDocument();
		});
	});

	it("each agent card shows the role description from catalog", async () => {
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		// "builder" role description from AGENT_ROLE_CATALOG
		await waitFor(() => {
			expect(
				screen.getByText(/Engineer\. Implements features/i),
			).toBeInTheDocument();
		});
	});

	it("strategy agent card shows a 'Strategy' category tag", async () => {
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			const tags = screen.getAllByTestId("agent-card-category");
			const tagTexts = tags.map((t) => t.textContent ?? "");
			expect(tagTexts.some((t) => t.includes("Strategy"))).toBe(true);
		});
	});

	it("personal agent card shows a 'Personal' category tag", async () => {
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			const tags = screen.getAllByTestId("agent-card-category");
			const tagTexts = tags.map((t) => t.textContent ?? "");
			expect(tagTexts.some((t) => t.includes("Personal"))).toBe(true);
		});
	});

	it("team agent card does NOT show a category tag", async () => {
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			const cards = screen.getAllByTestId("agent-card");
			expect(cards.length).toBe(3);
		});

		// The team agent (Atlas Builder) card should not contain a category testid
		// We check the tags count — only 2 (strategy + personal), not 3
		const tags = screen.queryAllByTestId("agent-card-category");
		expect(tags.length).toBe(2); // strategy + personal only
	});
});

// ---------------------------------------------------------------------------
// AC-2: Edit dialog opens with soul textarea pre-filled
// ---------------------------------------------------------------------------

describe("AB3 AC-2 — Edit dialog soul textarea pre-filled", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
		fetchSpy.mockResolvedValue(makeHintResponse());
		mockApiFetch.mockResolvedValue(makeAgentsResponse());
	});

	afterEach(() => {
		vi.restoreAllMocks();
		mockApiFetch.mockReset();
	});

	it("clicking an agent card opens the edit dialog", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
		});

		const cards = screen.getAllByTestId("agent-card");
		await user.click(cards[0]!);

		// Dialog should be open — look for the dialog element
		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});
	});

	it("edit dialog contains guidance text about soul", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
		});

		await user.click(screen.getAllByTestId("agent-card")[0]!);

		await waitFor(() => {
			expect(
				screen.getByText(/Personality, style, and values/i),
			).toBeInTheDocument();
		});
	});

	it("edit dialog soul textarea is pre-filled with agent's soulPrompt", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
		});

		// Click the builder card (has soulPrompt set)
		await user.click(screen.getAllByTestId("agent-card")[0]!);

		await waitFor(() => {
			const textarea = screen.getByRole("textbox", { name: /soul/i });
			expect(textarea).toBeInTheDocument();
			expect((textarea as HTMLTextAreaElement).value).toContain(
				"You are a meticulous builder",
			);
		});
	});

	it("edit dialog header shows agent name", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
		});

		await user.click(screen.getAllByTestId("agent-card")[0]!);

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
			// Name appears in dialog header
			expect(screen.getAllByText("Atlas Builder").length).toBeGreaterThanOrEqual(1);
		});
	});
});

// ---------------------------------------------------------------------------
// AC-3: Edit dialog respects agent categories
// ---------------------------------------------------------------------------

describe("AB3 AC-3 — Edit dialog category-aware behavior", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
		fetchSpy.mockResolvedValue(makeHintResponse());
		mockApiFetch.mockResolvedValue(makeAgentsResponse());
	});

	afterEach(() => {
		vi.restoreAllMocks();
		mockApiFetch.mockReset();
	});

	it("strategy agent dialog shows strategy management note", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
		});

		// Click the strategy agent (Scout Agent — index 1)
		const cards = screen.getAllByTestId("agent-card");
		// Find scout agent card
		const scoutCard = cards.find((c) => c.textContent?.includes("Scout Agent"));
		expect(scoutCard).toBeDefined();
		await user.click(scoutCard!);

		await waitFor(() => {
			expect(
				screen.getByText(/managed by your strategy/i),
			).toBeInTheDocument();
		});
	});

	it("team agent dialog does NOT show strategy management note", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
		});

		// Click team agent (Atlas Builder)
		const builderCard = screen.getAllByTestId("agent-card").find(
			(c) => c.textContent?.includes("Atlas Builder"),
		);
		await user.click(builderCard!);

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});

		expect(screen.queryByText(/managed by your strategy/i)).not.toBeInTheDocument();
	});

	it("strategy agent config fields are disabled when config section is expanded", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
		});

		const scoutCard = screen.getAllByTestId("agent-card").find(
			(c) => c.textContent?.includes("Scout Agent"),
		);
		await user.click(scoutCard!);

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});

		// Toggle config open
		const configToggle = screen.getByRole("button", { name: /show configuration/i });
		await user.click(configToggle);

		// All config inputs should be disabled for strategy agents
		await waitFor(() => {
			const harnessInput = screen.getByLabelText(/harness/i);
			expect(harnessInput).toBeDisabled();
		});
	});

	it("team agent config fields are enabled when config section is expanded", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
		});

		const builderCard = screen.getAllByTestId("agent-card").find(
			(c) => c.textContent?.includes("Atlas Builder"),
		);
		await user.click(builderCard!);

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
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
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
		fetchSpy.mockResolvedValue(makeHintResponse());
		mockApiFetch.mockResolvedValue(makeAgentsResponse());
	});

	afterEach(() => {
		vi.restoreAllMocks();
		mockApiFetch.mockReset();
	});

	it("clicking Save calls PATCH /api/agents/:id with updated soul", async () => {
		const user = userEvent.setup();

		// Mock PATCH to return success
		const patchResponse = new Response(
			JSON.stringify({ ...MOCK_AGENT_CONFIGS[0], soulPrompt: "Updated soul text." }),
			{ status: 200 },
		);
		mockApiFetch
			.mockResolvedValueOnce(makeAgentsResponse()) // initial GET /api/agents
			.mockResolvedValueOnce(patchResponse); // PATCH /api/agents/:id

		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
		});

		const builderCard = screen.getAllByTestId("agent-card").find(
			(c) => c.textContent?.includes("Atlas Builder"),
		);
		await user.click(builderCard!);

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});

		// Update soul textarea
		const textarea = screen.getByRole("textbox", { name: /soul/i });
		await user.clear(textarea);
		await user.type(textarea, "Updated soul text.");

		// Click Save
		const saveBtn = screen.getByRole("button", { name: /^save$/i });
		await user.click(saveBtn);

		await waitFor(() => {
			const patchCall = mockApiFetch.mock.calls.find(
				(call) => (call[1] as RequestInit)?.method === "PATCH",
			);
			expect(patchCall).toBeDefined();
			expect(patchCall![0] as string).toContain("/api/agents/agent-builder-1");
			const body = JSON.parse((patchCall![1] as RequestInit).body as string) as Record<string, unknown>;
			expect(body.soulPrompt).toBe("Updated soul text.");
		});
	});

	it("Save button calls PATCH with modelTierPreference when config is changed", async () => {
		const user = userEvent.setup();

		const patchResponse = new Response(
			JSON.stringify({ ...MOCK_AGENT_CONFIGS[0], modelTierPreference: "reasoning" }),
			{ status: 200 },
		);
		mockApiFetch
			.mockResolvedValueOnce(makeAgentsResponse())
			.mockResolvedValueOnce(patchResponse);

		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
		});

		const builderCard = screen.getAllByTestId("agent-card").find(
			(c) => c.textContent?.includes("Atlas Builder"),
		);
		await user.click(builderCard!);

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});

		// Expand config
		const configToggle = screen.getByRole("button", { name: /show configuration/i });
		await user.click(configToggle);

		// Change model tier
		await waitFor(() => {
			expect(screen.getByLabelText(/model tier/i)).toBeInTheDocument();
		});
		await user.selectOptions(screen.getByLabelText(/model tier/i), "reasoning");

		// Click Save
		const saveBtn = screen.getByRole("button", { name: /^save$/i });
		await user.click(saveBtn);

		await waitFor(() => {
			const patchCall = mockApiFetch.mock.calls.find(
				(call) => (call[1] as RequestInit)?.method === "PATCH",
			);
			expect(patchCall).toBeDefined();
			const body = JSON.parse((patchCall![1] as RequestInit).body as string) as Record<string, unknown>;
			expect(body.modelTierPreference).toBe("reasoning");
		});
	});
});

// ---------------------------------------------------------------------------
// AC-5: Add custom agent flow
// ---------------------------------------------------------------------------

describe("AB3 AC-5 — Add custom agent dialog", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
		fetchSpy.mockResolvedValue(makeHintResponse());
		mockApiFetch.mockResolvedValue(makeAgentsResponse());
	});

	afterEach(() => {
		vi.restoreAllMocks();
		mockApiFetch.mockReset();
	});

	it("renders a '+ Add agent' button below the roster", async () => {
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
		});

		expect(
			screen.getByRole("button", { name: /\+ add agent/i }),
		).toBeInTheDocument();
	});

	it("clicking '+ Add agent' opens the create dialog", async () => {
		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
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
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
		});

		await user.click(screen.getByRole("button", { name: /\+ add agent/i }));

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
			expect(screen.getByRole("textbox", { name: /agent name/i })).toBeInTheDocument();
			expect(screen.getByRole("combobox", { name: /role/i })).toBeInTheDocument();
		});
	});

	it("clicking Create calls POST /api/agents with teamMembersId", async () => {
		const user = userEvent.setup();

		const createResponse = new Response(
			JSON.stringify({
				id: "new-agent-1",
				name: "New Custom Agent",
				role: "builder",
				soulPrompt: null,
				harnessType: null,
				modelTierPreference: null,
				maxConcurrentSessions: 1,
				status: "active",
				activeSessions: 0,
				agentCategory: "team",
			}),
			{ status: 201 },
		);

		mockApiFetch
			.mockResolvedValueOnce(makeAgentsResponse()) // initial GET /api/agents
			.mockResolvedValueOnce(createResponse); // POST /api/agents

		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getAllByTestId("agent-card").length).toBe(3);
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
			const postCall = mockApiFetch.mock.calls.find(
				(call) => (call[1] as RequestInit)?.method === "POST"
					&& (call[0] as string).includes("/api/agents"),
			);
			expect(postCall).toBeDefined();
			const body = JSON.parse((postCall![1] as RequestInit).body as string) as Record<string, unknown>;
			expect(body.name).toBe("New Custom Agent");
			// teamId must be the teamMembers.id (not team.id)
			expect(body.teamId).toBe("tm-ab3");
		});
	});
});

// ---------------------------------------------------------------------------
// AC-6: First-time hint banner
// ---------------------------------------------------------------------------

describe("AB3 AC-6 — First-time hint banner (review-agents)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
		mockApiFetch.mockResolvedValue(makeAgentsResponse());
	});

	afterEach(() => {
		vi.restoreAllMocks();
		mockApiFetch.mockReset();
	});

	it("hint-review-agents banner is visible when hint is not dismissed", async () => {
		// Return empty dismissed list — all hints are visible
		fetchSpy.mockResolvedValueOnce(makeHintResponse([]));

		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getByTestId("hint-review-agents")).toBeInTheDocument();
		});
	});

	it("hint-review-agents is NOT visible when already dismissed", async () => {
		// Return "review-agents" as dismissed
		fetchSpy.mockResolvedValueOnce(makeHintResponse(["review-agents"]));

		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		// Wait for hints to load
		await waitFor(() => {
			expect(screen.queryAllByTestId("agent-card").length).toBe(3);
		});

		// Give hints time to resolve
		await new Promise((r) => setTimeout(r, 50));

		expect(screen.queryByTestId("hint-review-agents")).not.toBeInTheDocument();
	});

	it("clicking 'Got it' on the hint fires the dismiss POST", async () => {
		fetchSpy.mockResolvedValueOnce(makeHintResponse([]));
		// Mock dismiss POST
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ ok: true }), { status: 200 }),
		);

		const user = userEvent.setup();
		renderWithHints(<WorkTeam overrideData={TEAM_WITH_AGENTS} skipArtifacts />);

		await waitFor(() => {
			expect(screen.getByTestId("hint-review-agents")).toBeInTheDocument();
		});

		const gotItBtn = screen.getByRole("button", { name: /got it/i });
		await user.click(gotItBtn);

		// Optimistic: banner disappears immediately
		expect(screen.queryByTestId("hint-review-agents")).not.toBeInTheDocument();

		// Verify dismiss POST was fired
		await waitFor(() => {
			const dismissCall = fetchSpy.mock.calls.find(
				(call) =>
					typeof call[0] === "string" &&
					(call[0] as string).includes("review-agents/dismiss"),
			);
			expect(dismissCall).toBeDefined();
		});
	});
});
