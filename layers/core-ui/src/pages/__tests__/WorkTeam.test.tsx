/**
 * WorkTeam: team detail page — roster, active tasks, agent health rollup,
 * agent configuration, and the agent split-pane.
 *
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamPageData, TeamRosterMember } from "../../hooks/useTeam.js";
import { WorkTeam } from "../WorkTeam";

vi.mock("../../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../../shell/ToastRegion.js");
	return { ...actual, useToast: vi.fn(() => ({ showToast: vi.fn() })) };
});

const mockUseTeamAgents = vi.fn().mockReturnValue({ agents: new Map(), refetch: vi.fn() });
vi.mock("../../hooks/useTeamAgents", () => ({
	useTeamAgents: (...args: unknown[]) => mockUseTeamAgents(...args),
}));

const mockApiFetch = vi.fn();
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

const ROSTER_RUN_STATE = new Map<string, unknown>([
	[
		"agent-h",
		{
			operationalStatus: "active",
			healthLevel: "healthy",
			healthDetail: "Healthy",
			activeTaskTitle: null,
			activeTaskId: null,
		},
	],
	[
		"agent-w",
		{
			operationalStatus: "idle",
			healthLevel: "warning",
			healthDetail: "2 of 6 sessions failed",
			activeTaskTitle: null,
			activeTaskId: null,
		},
	],
	[
		"agent-idle",
		{
			operationalStatus: "idle",
			healthLevel: "healthy",
			healthDetail: "Healthy",
			activeTaskTitle: null,
			activeTaskId: null,
		},
	],
	[
		"agent-active",
		{
			operationalStatus: "active",
			healthLevel: "healthy",
			healthDetail: "Healthy",
			activeTaskTitle: "Implement file upload",
			activeTaskId: "task-123",
		},
	],
	[
		"agent-error",
		{
			operationalStatus: "error",
			healthLevel: "critical",
			healthDetail: "5 of 6 sessions failed",
			activeTaskTitle: null,
			activeTaskId: null,
		},
	],
	[
		"a1",
		{
			operationalStatus: "idle",
			healthLevel: "healthy",
			healthDetail: "Healthy",
			activeTaskTitle: null,
			activeTaskId: null,
		},
	],
]);

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

const AGENT_HEALTHY: TeamRosterMember = {
	agentId: "agent-h",
	name: "Healthy Agent",
	role: "builder",
	agentCategory: "team",
};

const AGENT_WARNING: TeamRosterMember = {
	agentId: "agent-w",
	name: "Warning Agent",
	role: "builder",
	agentCategory: "team",
};

const POPULATED_TEAM: TeamPageData = {
	team: { id: "team-1", name: "Team One", status: "healthy" },
	roster: [AGENT_HEALTHY, AGENT_WARNING],
	tasksInProgress: [
		{
			id: "bet-1",
			title: "Auth migration",
			state: "in_progress" as const,
			progressDone: 1,
			progressTotal: 2,
		},
	],
};

const EMPTY_TEAM: TeamPageData = {
	team: { id: "team-1-empty", name: "Empty Team", status: "healthy" },
	roster: [],
	tasksInProgress: [],
};

const TEAM_ALL_HEALTHY: TeamPageData = { ...POPULATED_TEAM, roster: [AGENT_HEALTHY] };
const TEAM_WITH_WARNING: TeamPageData = {
	...POPULATED_TEAM,
	roster: [AGENT_HEALTHY, AGENT_WARNING],
};

function renderTeam(
	data: TeamPageData | null = POPULATED_TEAM,
	opts: { loading?: boolean; path?: string } = {},
): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[opts.path ?? "/work/team/team-1"]}>
			<Routes>
				<Route
					path="/work/team/:teamId"
					element={<WorkTeam overrideData={data} overrideLoading={opts.loading ?? false} />}
				/>
				<Route
					path="/agents/:agentId"
					element={<div data-testid="agent-profile-page">Agent Profile</div>}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

function getAgentHealthTile(): HTMLElement | undefined {
	const section = screen.getByTestId("team-burn-vs-cap");
	const tiles = section.querySelectorAll("[data-testid='stat-tile']");
	return Array.from(tiles).find((tile) =>
		Array.from(tile.querySelectorAll("span")).some(
			(s) => s.textContent?.trim().toUpperCase() === "AGENT HEALTH",
		),
	) as HTMLElement | undefined;
}

// ---------------------------------------------------------------------------
// Page states: populated, empty, loading, not-found
// ---------------------------------------------------------------------------

describe("WorkTeam page states", () => {
	it("shows the team page for a populated team", () => {
		renderTeam(POPULATED_TEAM);
		expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
		expect(screen.getByTestId("team-burn-vs-cap")).toBeInTheDocument();
		expect(screen.getByTestId("team-active-tasks")).toBeInTheDocument();
		expect(screen.getByTestId("team-agents")).toBeInTheDocument();
		expect(screen.getByTestId("team-breadcrumb-back")).toBeInTheDocument();
	});

	it("shows the team page while loading", () => {
		renderTeam(POPULATED_TEAM, { loading: true });
		expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
	});

	it("shows a not-found state when the team does not exist", () => {
		renderTeam(null);
		expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
		expect(screen.getByTestId("team-not-found")).toBeInTheDocument();
	});

	it("shows the empty-active-tasks and empty-agents states for a team with no data", () => {
		renderTeam(EMPTY_TEAM);
		expect(screen.getByTestId("team-active-tasks-empty")).toBeInTheDocument();
		expect(screen.getByTestId("team-agents")).toBeInTheDocument();
		expect(screen.queryAllByTestId("agent-row").length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Burn section stat tiles: Active tasks + Agent Health rollup
// ---------------------------------------------------------------------------

describe("WorkTeam stat tiles", () => {
	it("shows an Active tasks tile and an Agent Health tile, always both", () => {
		renderTeam(POPULATED_TEAM);
		const section = screen.getByTestId("team-burn-vs-cap");
		expect(within(section).getByText(/active tasks/i)).toBeInTheDocument();
		expect(within(section).getByText(/agent health/i)).toBeInTheDocument();
	});

	it("shows both tiles even for an empty team (no 1-tile fallback)", () => {
		renderTeam(EMPTY_TEAM);
		expect(screen.getAllByTestId("stat-tile")).toHaveLength(2);
	});

	it("Agent Health reads '—' / 'No agents' for an empty roster, never 'On track'", () => {
		renderTeam(EMPTY_TEAM);
		const tile = getAgentHealthTile();
		expect(tile?.querySelectorAll("span")[1]?.textContent?.trim()).toBe("—");
		expect(tile?.textContent).toContain("No agents");
	});

	it("Agent Health reads 'On track' when every roster member is healthy", () => {
		renderTeam(TEAM_ALL_HEALTHY);
		const tile = getAgentHealthTile();
		expect(tile?.querySelectorAll("span")[1]?.textContent?.trim()).toBe("On track");
	});

	it("Agent Health reads 'Needs attention' and names the idle count when any agent has a warning", () => {
		renderTeam(TEAM_WITH_WARNING);
		const tile = getAgentHealthTile();
		expect(tile?.querySelectorAll("span")[1]?.textContent?.trim()).toBe("Needs attention");
		expect(tile?.textContent).toMatch(/idle agent/i);
	});
});

// ---------------------------------------------------------------------------
// Agent roster rows: identity, status, context, health, profile link
// ---------------------------------------------------------------------------

describe("WorkTeam agent roster rows", () => {
	const AGENT_IDLE: TeamRosterMember = {
		agentId: "agent-idle",
		name: "Idle Agent",
		role: "builder",
		agentCategory: null,
	};
	const AGENT_ACTIVE: TeamRosterMember = {
		agentId: "agent-active",
		name: "Active Agent",
		role: "builder",
		agentCategory: null,
	};
	const AGENT_ERROR: TeamRosterMember = {
		agentId: "agent-error",
		name: "Error Agent",
		role: "builder",
		agentCategory: null,
	};
	const TEAM_WITH_AGENTS: TeamPageData = {
		team: { id: "team-1", name: "Team One", status: "healthy" },
		roster: [AGENT_IDLE, AGENT_ACTIVE, AGENT_ERROR],
		tasksInProgress: [],
	};

	it("renders one row per roster member, with name and status label", () => {
		renderTeam(TEAM_WITH_AGENTS);
		expect(screen.getAllByTestId("agent-row")).toHaveLength(3);
		expect(screen.getByText("Idle Agent")).toBeInTheDocument();
		expect(screen.getByText("Active Agent")).toBeInTheDocument();
		expect(screen.getByText("Error Agent")).toBeInTheDocument();
		const statuses = screen.getAllByTestId("agent-status").map((el) => el.textContent?.trim());
		expect(statuses).toEqual(expect.arrayContaining(["Idle", "Active", "Error"]));
	});

	it("shows the active task title or error detail in the context column", () => {
		renderTeam(TEAM_WITH_AGENTS);
		expect(screen.getByText("Implement file upload")).toBeInTheDocument();
		expect(screen.getByText("5 of 6 sessions failed")).toBeInTheDocument();
	});

	it("each agent profile link points at /agents/:agentId", () => {
		renderTeam(POPULATED_TEAM);
		const profileLinks = screen.getAllByTestId("agent-profile-link");
		expect(profileLinks).toHaveLength(POPULATED_TEAM.roster.length);
		for (const member of POPULATED_TEAM.roster) {
			const link = profileLinks.find((el) =>
				el.getAttribute("href")?.includes(encodeURIComponent(member.agentId)),
			);
			expect(link?.getAttribute("href")).toBe(`/agents/${encodeURIComponent(member.agentId)}`);
		}
	});

	it("clicking an agent row navigates to its profile page", async () => {
		const user = userEvent.setup();
		renderTeam(TEAM_WITH_AGENTS);
		const rows = screen.getAllByTestId("agent-row");
		const idleRow = rows.find((r) => r.textContent?.includes("Idle Agent")) as HTMLElement;
		await user.click(within(idleRow).getByText("Idle Agent"));
		await waitFor(() => {
			expect(screen.getByTestId("agent-profile-page")).toBeInTheDocument();
		});
	});

	it("clicking the Customize button does not navigate to the profile page", async () => {
		const user = userEvent.setup();
		renderTeam(TEAM_WITH_AGENTS);
		await user.click(screen.getAllByTestId("agent-customize-btn")[0] as HTMLElement);
		await waitFor(() => {
			expect(screen.queryByTestId("agent-profile-page")).not.toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// Active tasks: flush row + "+ New task"
// ---------------------------------------------------------------------------

describe("WorkTeam active tasks", () => {
	function renderWithApiFetch(
		ui: ReactNode,
		path = "/work/team/f1-team-1",
	): ReturnType<typeof render> {
		return render(
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route path="/work/team/:teamId" element={ui} />
					<Route path="/work/task/new" element={<div data-testid="task-new-page">New Task</div>} />
					<Route path="*" element={ui} />
				</Routes>
			</MemoryRouter>,
		);
	}

	const TEAM_WITH_TASKS: TeamPageData = {
		team: { id: "f1-team-1", name: "Sample Team", status: "healthy" },
		roster: [],
		tasksInProgress: [
			{
				id: "bet-1",
				title: "Ship the MVP",
				state: "in_progress" as const,
				progressDone: 2,
				progressTotal: 5,
			},
		],
	};
	const TEAM_NO_TASKS: TeamPageData = { ...TEAM_WITH_TASKS, tasksInProgress: [] };

	beforeEach(() => {
		mockApiFetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
		global.fetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ dismissed: [] }), { status: 200 }));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		mockApiFetch.mockReset();
	});

	it("renders each active task's title", async () => {
		renderWithApiFetch(<WorkTeam overrideData={TEAM_WITH_TASKS} />);
		await waitFor(() => {
			expect(screen.getByText("Ship the MVP")).toBeInTheDocument();
		});
	});

	it("renders a '+ New task' button that navigates to /work/task/new", async () => {
		const user = userEvent.setup();
		renderWithApiFetch(<WorkTeam overrideData={TEAM_NO_TASKS} />);
		await waitFor(() => {
			expect(screen.getByTestId("new-task-btn")).toBeInTheDocument();
		});
		expect(screen.getByTestId("new-task-btn").textContent).toMatch(/\+ new task/i);
		await user.click(screen.getByTestId("new-task-btn"));
		await waitFor(() => {
			expect(screen.getByTestId("task-new-page")).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// Agent split-pane: ?agent=<id> opens AgentDetailPane, no modal dialog
// ---------------------------------------------------------------------------

describe("WorkTeam agent split-pane", () => {
	const ROSTER_MEMBER: TeamRosterMember = {
		agentId: "a1",
		name: "Atlas Builder",
		role: "builder",
		agentCategory: "team",
	};
	const TEAM_DATA: TeamPageData = {
		team: { id: "t1", name: "Sample Team", status: "healthy" },
		roster: [ROSTER_MEMBER],
		tasksInProgress: [],
	};

	beforeEach(() => {
		mockUseTeamAgents.mockReturnValue({
			agents: new Map([
				["a1", { id: "a1", name: "Atlas Builder", systemPrompt: "", role: "builder" }],
			]),
			refetch: vi.fn(),
		});
		callMock.mockReset();
		callMock.mockResolvedValue({
			ok: true,
			data: {
				user: { id: "a1", name: "Atlas Builder" },
				runsOn: [],
				runConfig: null,
				documentIds: [],
				folders: [],
				subscriptions: [],
				connections: null,
				inbox: null,
			},
		});
		mockApiFetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		mockApiFetch.mockReset();
		mockUseTeamAgents.mockReturnValue({ agents: new Map(), refetch: vi.fn() });
	});

	function renderAtPath(path: string): ReturnType<typeof render> {
		return render(
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route path="/work/team/:teamId" element={<WorkTeam overrideData={TEAM_DATA} />} />
				</Routes>
			</MemoryRouter>,
		);
	}

	it("does not open the pane when there is no ?agent param", () => {
		renderAtPath("/work/team/t1");
		expect(screen.queryByTestId("agent-detail-pane")).not.toBeInTheDocument();
	});

	it("opens AgentDetailPane, with no role='dialog' anywhere, when ?agent=<id> is in the URL", async () => {
		renderAtPath("/work/team/t1?agent=a1");
		await waitFor(() => {
			expect(screen.getByTestId("agent-detail-pane")).toBeInTheDocument();
		});
		expect(document.querySelectorAll('[role="dialog"]').length).toBe(0);
	});

	it("clicking 'Customize' opens the pane by setting the ?agent search param", async () => {
		const user = userEvent.setup();
		renderAtPath("/work/team/t1");
		const customizeBtn = await waitFor(() => screen.getByTestId("agent-customize-btn"));
		await user.click(customizeBtn);
		await waitFor(() => {
			expect(screen.getByTestId("agent-detail-pane")).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// Agent configuration: category tags, the detail pane, save, and add-agent
// ---------------------------------------------------------------------------

describe("WorkTeam agent configuration", () => {
	const TEAM_WITH_CATEGORIES: TeamPageData = {
		team: { id: "ab3-team-1", name: "Sample Team", status: "healthy" },
		roster: [
			{ agentId: "agent-builder-1", name: "Atlas Builder", role: "builder", agentCategory: "team" },
			{ agentId: "agent-scout-1", name: "Scout Agent", role: "scout", agentCategory: "individual" },
			{
				agentId: "agent-cos-1",
				name: "System Agent",
				role: "assistant",
				agentCategory: "individual",
			},
		],
		tasksInProgress: [],
	};

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
		"agent-cos-1": {
			harnessType: null,
			maxConcurrentSessions: 1,
			identityDocumentId: "ki_af_demo",
		},
	};

	function setupCall(): void {
		callMock.mockImplementation((name: string, input: Record<string, unknown>) => {
			if (name === "open_user") {
				const id = input.id as string | undefined;
				if (id === undefined) {
					return Promise.resolve({
						ok: true,
						data: {
							user: { id: "self", team: { id: "ab3-team-1", name: "Sample Team" } },
							runsOn: [],
							runConfig: null,
							documentIds: [],
							folders: [],
							subscriptions: [],
							connections: null,
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
						inbox: null,
					},
				});
			}
			if (name === "edit_user")
				return Promise.resolve({ ok: true, data: { user: { id: "agent-new" } } });
			if (name === "search_users") {
				return Promise.resolve({
					ok: true,
					data: Object.keys(MOCK_AGENT_CONFIGS).map((id) => ({
						id,
						kind: "ai",
						name: id,
						role: "builder",
						status: "active",
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

	function renderConfig(): ReturnType<typeof render> {
		return render(
			<MemoryRouter initialEntries={["/work/team/ab3-team-1"]}>
				<Routes>
					<Route
						path="/work/team/:teamId"
						element={<WorkTeam overrideData={TEAM_WITH_CATEGORIES} />}
					/>
					<Route path="*" element={<WorkTeam overrideData={TEAM_WITH_CATEGORIES} />} />
				</Routes>
			</MemoryRouter>,
		);
	}

	beforeEach(() => {
		callMock.mockReset();
		setupCall();
		mockUseTeamAgents.mockReturnValue({
			agents: new Map(
				Object.keys(MOCK_AGENT_CONFIGS).map((id) => [
					id,
					{ id, name: id, systemPrompt: "", role: "builder" },
				]),
			),
			refetch: vi.fn(),
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		mockUseTeamAgents.mockReturnValue({ agents: new Map(), refetch: vi.fn() });
	});

	it("shows an 'Individual' category tag for non-team agents, none for team agents", async () => {
		renderConfig();
		await waitFor(() => {
			expect(screen.getAllByTestId("agent-row")).toHaveLength(3);
		});
		const tags = screen.getAllByTestId("agent-card-category").map((t) => t.textContent ?? "");
		expect(tags.every((t) => t.includes("Individual"))).toBe(true);
		expect(tags).toHaveLength(2); // only the two individual-category agents
	});

	it("clicking Customize opens the pane linking to the agent's identity document, no dialog", async () => {
		const user = userEvent.setup();
		renderConfig();
		await waitFor(() => expect(screen.getAllByTestId("agent-row")).toHaveLength(3));

		const builderRow = screen
			.getAllByTestId("agent-row")
			.find((c) => c.textContent?.includes("Atlas Builder")) as HTMLElement;
		await user.click(
			builderRow.querySelector('[data-testid="agent-customize-btn"]') as HTMLElement,
		);

		await waitFor(() => {
			const link = screen.getByTestId("agent-detail-identity-link");
			expect(link.getAttribute("href")).toBe("/documents/ki_af_demo");
		});
		expect(document.querySelectorAll('[role="dialog"]').length).toBe(0);
	});

	it("Save in the expanded config section calls edit_user with the edited harness", async () => {
		const user = userEvent.setup();
		renderConfig();
		await waitFor(() => expect(screen.getAllByTestId("agent-row")).toHaveLength(3));

		const builderRow = screen
			.getAllByTestId("agent-row")
			.find((c) => c.textContent?.includes("Atlas Builder")) as HTMLElement;
		await user.click(
			builderRow.querySelector('[data-testid="agent-customize-btn"]') as HTMLElement,
		);
		await waitFor(() =>
			expect(screen.getByTestId("agent-detail-identity-link")).toBeInTheDocument(),
		);

		await user.click(screen.getByRole("button", { name: /show configuration/i }));
		await waitFor(() => expect(screen.getByLabelText(/harness/i)).toBeInTheDocument());
		await user.clear(screen.getByLabelText(/harness/i));
		await user.type(screen.getByLabelText(/harness/i), "codex");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

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

	it("'+ Add agent' opens a create dialog with a name input and role combobox", async () => {
		const user = userEvent.setup();
		renderConfig();
		await waitFor(() => expect(screen.getAllByTestId("agent-row")).toHaveLength(3));

		await user.click(screen.getByRole("button", { name: /\+ add agent/i }));

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
			expect(screen.getByRole("textbox", { name: /agent name/i })).toBeInTheDocument();
			expect(screen.getByRole("combobox", { name: /role/i })).toBeInTheDocument();
		});
	});

	it("clicking Create calls edit_user with the new agent's name and team", async () => {
		const user = userEvent.setup();
		renderConfig();
		await waitFor(() => expect(screen.getAllByTestId("agent-row")).toHaveLength(3));

		await user.click(screen.getByRole("button", { name: /\+ add agent/i }));
		await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

		await user.type(screen.getByRole("textbox", { name: /agent name/i }), "New Custom Agent");
		await user.click(screen.getByRole("button", { name: /^create$/i }));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith(
				"edit_user",
				expect.objectContaining({
					kind: "ai",
					name: "New Custom Agent",
					team: { name: "Sample Team" },
				}),
			);
		});
	});
});
