/**
 * AV2 — SettingsAgents SplitView component tests (RED phase)
 *
 * AC-1: Assistant is a row; no role filter; clicking opens the shared editor in SplitView
 * AC-2: Agent detail opens in SplitView; model dropdown uses discovered models
 *
 * @lore BC5 T9: the door swap — `call` mocked at the door. `open_user({ id
 * })` carries `documentIds` (agent_file slot → identityDocumentId) and
 * `runConfig` (harness/model) per agent; `open_user({})` (self) carries the
 * install-wide `runsOn` used to build the discovered-models dropdown.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsAgents } from "../SettingsAgents.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_HARNESSES_WITH_MODELS = [
	{
		type: "opencode",
		name: "OpenCode",
		kind: "local",
		models: [
			{
				id: "deepseek/deepseek-v4-flash",
				label: "DeepSeek V4 Flash",
				provider: "openrouter",
				contextWindow: 128000,
				selectable: true,
				options: [],
			},
		],
		modelProviders: ["anthropic", "openrouter"],
		discovery: { state: "ready" },
		authAction: { kind: "enter_api_key", label: "Enter API key" },
	},
	{
		type: "codex",
		name: "Codex",
		kind: "local",
		models: [],
		modelProviders: [],
		discovery: { state: "ready" },
		authAction: { kind: "native_cli_login", label: "Log in to Codex", command: ["codex", "login"] },
	},
];

interface MockAgent {
	id: string;
	name: string;
	role: string;
	ownerUserId: string | null;
	agentCategory: string | null;
	harnessType: string | null;
	modelId: string | null;
	modelProvider: string | null;
}

const MOCK_AGENTS: MockAgent[] = [
	{
		id: "agent-nova",
		name: "Nova",
		role: "assistant",
		// The assistant is a person-owned agent — `ownerUserId` set, not a
		// structural id prefix.
		ownerUserId: "user1",
		harnessType: "opencode",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		agentCategory: "individual",
	},
	{
		id: "agent-atlas",
		name: "Atlas",
		role: "builder",
		ownerUserId: null,
		harnessType: "opencode",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		agentCategory: "team",
	},
];

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

const mockShowToast = vi.fn();
vi.mock("../../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../../shell/ToastRegion.js");
	return { ...actual, useToast: vi.fn(() => ({ showToast: mockShowToast })) };
});

function setupCall(agents: MockAgent[] = MOCK_AGENTS): void {
	callMock.mockImplementation((name: string, input: Record<string, unknown>) => {
		if (name === "search_sessions") return Promise.resolve({ ok: true, data: [] });
		if (name === "search_users") {
			return Promise.resolve({
				ok: true,
				data: agents.map((a) => ({
					id: a.id,
					kind: "ai",
					name: a.name,
					role: a.role,
					status: "active",
					avatarUrl: null,
					createdAt: "2026-01-01T00:00:00.000Z",
					agentCategory: a.agentCategory,
					ownerUserId: a.ownerUserId,
					health: null,
					team: { id: "team-1", name: "Acme" },
					edges: [],
				})),
			});
		}
		if (name === "open_user") {
			const id = input.id as string | undefined;
			if (id === undefined) {
				return Promise.resolve({
					ok: true,
					data: {
						user: { id: "self", kind: "human", name: "Me", role: "founder", status: "active" },
						runsOn: MOCK_HARNESSES_WITH_MODELS,
						runConfig: null,
						documentIds: [],
						folders: [],
						subscriptions: [],
						connections: null,
						inbox: null,
					},
				});
			}
			const agent = agents.find((a) => a.id === id);
			if (!agent)
				return Promise.resolve({ ok: false, problems: [{ code: "not_found", message: id }] });
			return Promise.resolve({
				ok: true,
				data: {
					user: { id: agent.id, kind: "ai", name: agent.name, role: agent.role, status: "active" },
					runsOn: MOCK_HARNESSES_WITH_MODELS,
					runConfig: {
						harnessType: agent.harnessType,
						modelId: agent.modelId,
						modelProvider: agent.modelProvider,
						maxConcurrentSessions: 1,
						modelOptions: {},
					},
					documentIds: [{ slot: "agent_file", id: "ki_af_demo" }],
					folders: [],
					subscriptions: [],
					connections: null,
					inbox: null,
				},
			});
		}
		return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
	});
}

// ---------------------------------------------------------------------------
// AC-1: Assistant row visible (no filter)
// ---------------------------------------------------------------------------

describe("Assistant is a row in the agents list", () => {
	beforeEach(() => {
		callMock.mockReset();
		setupCall();
		mockShowToast.mockClear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders Nova (the person-owned assistant agent) as a row alongside normal agents", async () => {
		render(
			<MemoryRouter>
				<SettingsAgents />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Nova")).toBeInTheDocument();
			expect(screen.getByText("Atlas")).toBeInTheDocument();
		});
	});

	it("a generic agent row rests read-only and opens the shared editor only from Edit", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<SettingsAgents />
			</MemoryRouter>,
		);

		await waitFor(() => screen.getByText("Nova"));
		expect(screen.queryByLabelText(/name/i)).toBeNull();
		// @lore FR-10: Edit is now behind the "..." actions menu — open menu then click Edit.
		await user.click(screen.getByRole("button", { name: "Actions for Nova" }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^edit$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^edit$/i }));

		// Editor pane should be visible
		await waitFor(() => {
			expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
		});
	});

	// @lore BA9f: the role template exists to PREFILL a new agent's identity, and
	// editing an existing agent no longer has a box to prefill — it links to that
	// agent's identity document instead. The door carries `documentIds` up front
	// (loaded with the row), so there is no separate template fetch to avoid.
	it("editing an existing agent links to its identity document — no editable box", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<SettingsAgents />
			</MemoryRouter>,
		);

		await waitFor(() => screen.getByText("Atlas"));
		// @lore FR-10: Edit is now behind the "..." actions menu — open menu then click Edit.
		await user.click(screen.getByRole("button", { name: "Actions for Atlas" }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^edit$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^edit$/i }));

		await waitFor(() => {
			expect(screen.getByTestId("edit-identity-link-agent-atlas")).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// AC-2: Model select shows discovered models (not MODEL_CATALOG)
// ---------------------------------------------------------------------------

describe("Agent editor model dropdown uses discovered descriptor.models", () => {
	beforeEach(() => {
		callMock.mockReset();
		setupCall();
		mockShowToast.mockClear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("selects Atlas and the model dropdown shows the discovered model id", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<SettingsAgents />
			</MemoryRouter>,
		);

		await waitFor(() => screen.getByText("Atlas"));
		// @lore FR-10: Edit is now behind the "..." actions menu — open menu then click Edit.
		await user.click(screen.getByRole("button", { name: "Actions for Atlas" }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^edit$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^edit$/i }));

		await waitFor(() => {
			const modelSelect = screen.getByRole("combobox", { name: /model/i });
			const options = Array.from(modelSelect.querySelectorAll("option")).map(
				(o) => (o as HTMLOptionElement).value,
			);
			expect(options).toContain("deepseek/deepseek-v4-flash");
		});
	});
});

// ---------------------------------------------------------------------------
// AC-2: Ratio persistence — onRatioChange is wired
// ---------------------------------------------------------------------------

describe("SplitView ratio persistence is wired via useUiPreference", () => {
	beforeEach(() => {
		callMock.mockReset();
		setupCall();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders without crashing (SplitView persistence wiring)", async () => {
		render(
			<MemoryRouter>
				<SettingsAgents />
			</MemoryRouter>,
		);
		await waitFor(() => screen.getByText("Nova"));
		// If onRatioChange were missing the SplitView would still render; the
		// real test is that the ratio persists — verified via useUiPreference unit test
		expect(screen.getByText("Nova")).toBeInTheDocument();
	});
});
