/**
 * SettingsAgents component unit tests.
 *
 * Covers: the Agents section renders an agent list (ItemList/Row, not a
 * table); an inline edit via row click opens the shared SplitView editor
 * (Table layout removed in favor of ItemList + Row, no role="table", no
 * column headers; the Role field is a Combobox, not a native select; the
 * Delete button has aria-label="Delete <agentName>" — match by label not by
 * text content); the add form creates an agent with template pre-fill;
 * delete uses a two-click confirmation.
 *
 * @lore call("search_users"/"open_user"/"edit_user") replace the agent routes — delete is status:"retired"; an in-memory store keeps them consistent.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsAgents } from "../SettingsAgents.js";

// ---------------------------------------------------------------------------
// Mock data + in-memory door
// ---------------------------------------------------------------------------

interface MockAgent {
	id: string;
	name: string;
	role: string;
	ownerUserId: string | null;
	status: string;
	agentCategory: string | null;
	harnessType: string | null;
	modelId: string | null;
	modelProvider: string | null;
	maxConcurrentSessions: number;
	modelOptions: Record<string, unknown>;
}

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

function seedAgents(): MockAgent[] {
	return [
		{
			id: "agent-pm-1",
			name: "Acme PM",
			role: "product_manager",
			ownerUserId: null,
			status: "active",
			agentCategory: "team",
			harnessType: "claude-code",
			modelId: null,
			modelProvider: null,
			maxConcurrentSessions: 1,
			modelOptions: {},
		},
		{
			id: "agent-builder-1",
			name: "Builder Bot",
			role: "builder",
			ownerUserId: null,
			status: "active",
			agentCategory: "team",
			harnessType: null,
			modelId: null,
			modelProvider: null,
			maxConcurrentSessions: 2,
			modelOptions: {},
		},
	];
}

const HARNESSES = [
	{
		type: "claude-code",
		name: "Claude Code",
		kind: "local",
		modelProviders: ["anthropic"],
		models: [],
		authAction: { kind: "none", label: "" },
		discovery: { state: "ready" },
	},
	{
		type: "opencode",
		name: "OpenCode",
		kind: "local",
		modelProviders: ["anthropic", "openrouter"],
		models: [],
		authAction: { kind: "none", label: "" },
		discovery: { state: "ready" },
	},
];

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

const SPLITVIEW_AGENTS: MockAgent[] = [
	{
		id: "agent-nova",
		name: "Nova",
		role: "assistant",
		// The assistant is a person-owned agent — `ownerUserId` set, not a
		// structural id prefix.
		ownerUserId: "user1",
		status: "active",
		agentCategory: "individual",
		harnessType: "opencode",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		maxConcurrentSessions: 1,
		modelOptions: {},
	},
	{
		id: "agent-atlas",
		name: "Atlas",
		role: "builder",
		ownerUserId: null,
		status: "active",
		agentCategory: "team",
		harnessType: "opencode",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		maxConcurrentSessions: 1,
		modelOptions: {},
	},
];

/**
 * Variant of `setupCall` used by the SplitView describes below: routes
 * `open_user` with `documentIds` (agent_file slot) and discovered-models
 * `runsOn`, matching the shared editor's SplitView door contract.
 */
function setupSplitViewCall(agents: MockAgent[] = SPLITVIEW_AGENTS): void {
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

/** Routes `search_users`/`open_user`/`edit_user`/`search_sessions` against `store`. */
function setupCall(store: MockAgent[]): void {
	callMock.mockImplementation((name: string, input: Record<string, unknown>) => {
		if (name === "search_sessions") return Promise.resolve({ ok: true, data: [] });
		if (name === "search_users") {
			return Promise.resolve({
				ok: true,
				data: store.map((a) => ({
					id: a.id,
					kind: "ai",
					name: a.name,
					role: a.role,
					status: a.status,
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
						user: {
							id: "self",
							kind: "human",
							name: "Me",
							role: "founder",
							status: "active",
							team: { id: "team-1", name: "Acme" },
							edges: [],
						},
						runsOn: HARNESSES,
						runConfig: null,
						documentIds: [],
						folders: [],
						subscriptions: [],
						connections: null,
						inbox: null,
					},
				});
			}
			const agent = store.find((a) => a.id === id);
			if (!agent)
				return Promise.resolve({ ok: false, problems: [{ code: "not_found", message: id }] });
			return Promise.resolve({
				ok: true,
				data: {
					user: {
						id: agent.id,
						kind: "ai",
						name: agent.name,
						role: agent.role,
						status: agent.status,
					},
					runsOn: HARNESSES,
					runConfig: {
						harnessType: agent.harnessType,
						modelId: agent.modelId,
						modelProvider: agent.modelProvider,
						maxConcurrentSessions: agent.maxConcurrentSessions,
						modelOptions: agent.modelOptions,
					},
					documentIds: [],
					folders: [],
					subscriptions: [],
					connections: null,
					inbox: null,
				},
			});
		}
		if (name === "edit_user") {
			const id = input.id as string | undefined;
			if (id === undefined) {
				// Create
				const newAgent: MockAgent = {
					id: `new-agent-${store.length}`,
					name: (input.name as string) ?? "",
					role: (input.role as string) ?? "",
					ownerUserId: null,
					status: "active",
					agentCategory: "team",
					harnessType: null,
					modelId: null,
					modelProvider: null,
					maxConcurrentSessions: 1,
					modelOptions: {},
				};
				store.push(newAgent);
				return Promise.resolve({ ok: true, data: { user: { id: newAgent.id } } });
			}
			const agent = store.find((a) => a.id === id);
			if (!agent)
				return Promise.resolve({ ok: false, problems: [{ code: "not_found", message: id }] });
			if (input.status === "retired") {
				const index = store.findIndex((a) => a.id === id);
				store.splice(index, 1);
				return Promise.resolve({ ok: true, data: { user: { id, status: "retired" } } });
			}
			if (typeof input.name === "string") agent.name = input.name;
			if (typeof input.role === "string") agent.role = input.role;
			return Promise.resolve({ ok: true, data: { user: { id: agent.id } } });
		}
		return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
	});
}

// ---------------------------------------------------------------------------
// Mock useToast
// ---------------------------------------------------------------------------

const mockShowToast = vi.fn();
vi.mock("../../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: mockShowToast })),
	};
});

// ---------------------------------------------------------------------------
// SettingsAgents renders agent list
// ---------------------------------------------------------------------------

describe("SettingsAgents renders agent list", () => {
	beforeEach(() => {
		callMock.mockReset();
		setupCall(seedAgents());
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders seeded agent names in the list", async () => {
		render(<SettingsAgents />);

		await waitFor(() => {
			expect(screen.getByText("Acme PM")).toBeInTheDocument();
			expect(screen.getByText("Builder Bot")).toBeInTheDocument();
		});
	});

	it("renders role display label for each agent (not raw slug)", async () => {
		render(<SettingsAgents />);

		await waitFor(() => {
			// role displayed as human label via roleLabel(), not raw slug.
			expect(screen.getAllByText(/Product Manager/).length).toBeGreaterThan(0);
			expect(screen.getAllByText(/Builder ·/).length).toBeGreaterThan(0);
			expect(screen.queryByText(/product_manager/)).not.toBeInTheDocument();
		});
	});

	it("shows 'Default' when harnessType is null", async () => {
		render(<SettingsAgents />);

		await waitFor(() => {
			const defaults = screen.getAllByText(/Default/);
			expect(defaults.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("renders a Delete button for each agent", async () => {
		render(<SettingsAgents />);

		await waitFor(() => {
			// @lore FR-10: Delete is now behind the "..." actions menu — verify trigger buttons exist.
			expect(screen.getByRole("button", { name: /actions for acme pm/i })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: /actions for builder bot/i })).toBeInTheDocument();
		});
	});

	it("shows loading skeletons before data arrives", () => {
		callMock.mockImplementation(() => new Promise(() => {}));
		render(<SettingsAgents />);

		const skeletons = document.querySelectorAll('[role="status"]');
		expect(skeletons.length).toBeGreaterThan(0);
	});

	it("shows error message when search_users fails", async () => {
		callMock.mockImplementation((name: string) => {
			if (name === "search_users") {
				return Promise.resolve({ ok: false, problems: [{ code: "boom", message: "boom" }] });
			}
			return Promise.resolve({ ok: true, data: { runsOn: [], folders: [] } });
		});

		render(<SettingsAgents />);

		await waitFor(() => {
			expect(screen.getByText(/failed to load agents/i)).toBeInTheDocument();
		});
	});

	it("shows empty state when no agents exist", async () => {
		callMock.mockReset();
		setupCall([]);

		render(<SettingsAgents />);

		await waitFor(() => {
			expect(screen.getByText(/no agents configured/i)).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// Settings add form creates agent
// ---------------------------------------------------------------------------

describe("Settings UI add form creates agent", () => {
	let store: MockAgent[];

	beforeEach(() => {
		callMock.mockReset();
		store = seedAgents();
		setupCall(store);
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("clicking '+ Add Agent' shows the add form", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const addButton = screen.getByRole("button", { name: /add agent/i });
		await user.click(addButton);

		await waitFor(() => {
			expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
		});
	});

	it("Save creates the agent via edit_user with kind: ai and identity always sent", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const addButton = screen.getByRole("button", { name: /add agent/i });
		await user.click(addButton);

		await waitFor(() => screen.getByLabelText(/name/i));
		await user.type(screen.getByLabelText(/name/i), "New PM Agent");

		const saveButton = screen.getByRole("button", { name: /save/i });
		await user.click(saveButton);

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith(
				"edit_user",
				expect.objectContaining({ kind: "ai", name: "New PM Agent", identity: "" }),
			);
		});
	});

	it("shows toast 'Agent created' on successful creation", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const addButton = screen.getByRole("button", { name: /add agent/i });
		await user.click(addButton);

		await waitFor(() => screen.getByLabelText(/name/i));
		await user.type(screen.getByLabelText(/name/i), "New Agent");

		const saveButton = screen.getByRole("button", { name: /save/i });
		await user.click(saveButton);

		await waitFor(() => {
			expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/agent created/i));
		});
	});
});

// ---------------------------------------------------------------------------
// AC-12: Settings UI delete with two-click confirmation
// ---------------------------------------------------------------------------

describe("Settings UI delete with two-click confirmation", () => {
	let store: MockAgent[];

	beforeEach(() => {
		callMock.mockReset();
		store = seedAgents();
		setupCall(store);
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function getConfirmButton(): HTMLElement {
		return screen.getByRole("button", { name: /confirm delete\?/i });
	}

	it("first click shows inline 'Confirm delete?' button on the row", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		await user.click(screen.getByRole("button", { name: /actions for acme pm/i }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^delete$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^delete$/i }));

		await waitFor(() => {
			expect(getConfirmButton()).toBeInTheDocument();
		});
	});

	it("second click within timeout calls edit_user with status: retired", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		await user.click(screen.getByRole("button", { name: /actions for acme pm/i }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^delete$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^delete$/i }));

		await waitFor(() => getConfirmButton());
		await user.click(getConfirmButton());

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", { id: "agent-pm-1", status: "retired" });
		});
	});

	it("shows toast 'Agent deleted' after successful deletion", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		await user.click(screen.getByRole("button", { name: /actions for acme pm/i }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^delete$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^delete$/i }));

		await waitFor(() => getConfirmButton());
		await user.click(getConfirmButton());

		await waitFor(() => {
			expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/agent deleted/i));
		});
	});

	it("confirm button reverts after 3 seconds with no second click", async () => {
		vi.useFakeTimers();
		const user = userEvent.setup({ delay: null });
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		await user.click(screen.getByRole("button", { name: /actions for acme pm/i }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^delete$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^delete$/i }));

		await waitFor(() => getConfirmButton());

		vi.advanceTimersByTime(3100);

		await waitFor(() => {
			expect(screen.queryByRole("button", { name: /confirm delete\?/i })).toBeNull();
			expect(screen.getByRole("button", { name: /actions for acme pm/i })).toBeInTheDocument();
		});

		vi.useRealTimers();
	});
});

// ---------------------------------------------------------------------------
// Keyboard navigation: menu + two-step delete are fully keyboard-accessible
// ---------------------------------------------------------------------------

describe("Keyboard: actions menu is fully keyboard-navigable", () => {
	let store: MockAgent[];

	beforeEach(() => {
		callMock.mockReset();
		store = seedAgents();
		setupCall(store);
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("Enter on trigger opens menu, ArrowDown reaches Delete, Enter triggers, Confirm responds to Enter", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const triggerBtn = screen.getByRole("button", { name: /actions for acme pm/i });
		triggerBtn.focus();
		expect(document.activeElement).toBe(triggerBtn);

		await user.keyboard("{Enter}");
		await waitFor(() => {
			expect(screen.getByRole("menuitem", { name: /^edit$/i })).toBeInTheDocument();
			expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /^edit$/i }));
		});

		await user.keyboard("{ArrowDown}");
		await waitFor(() => {
			expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /^delete$/i }));
		});

		await user.keyboard("{Enter}");
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /confirm delete\?/i })).toBeInTheDocument();
		});

		const confirmBtn = screen.getByRole("button", { name: /confirm delete\?/i });
		confirmBtn.focus();
		await user.keyboard("{Enter}");

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", { id: "agent-pm-1", status: "retired" });
		});
		await waitFor(() => {
			expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/agent deleted/i));
		});
	});
});

// ---------------------------------------------------------------------------
// Assistant is a row in the agents list (no role filter, shared editor)
// ---------------------------------------------------------------------------

describe("Assistant is a row in the agents list", () => {
	beforeEach(() => {
		callMock.mockReset();
		setupSplitViewCall();
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
		// @lore: Edit is now behind the "..." actions menu — open menu then click Edit.
		await user.click(screen.getByRole("button", { name: "Actions for Nova" }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^edit$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^edit$/i }));

		await waitFor(() => {
			expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
		});
	});

	// @lore editing an agent links to its identity document, not a prefill box — the door carries documentIds up front, so no template fetch is needed.
	it("editing an existing agent links to its identity document — no editable box", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<SettingsAgents />
			</MemoryRouter>,
		);

		await waitFor(() => screen.getByText("Atlas"));
		// @lore: Edit is now behind the "..." actions menu — open menu then click Edit.
		await user.click(screen.getByRole("button", { name: "Actions for Atlas" }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^edit$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^edit$/i }));

		await waitFor(() => {
			expect(screen.getByTestId("edit-identity-link-agent-atlas")).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// Agent editor model dropdown uses discovered descriptor.models
// ---------------------------------------------------------------------------

describe("Agent editor model dropdown uses discovered descriptor.models", () => {
	beforeEach(() => {
		callMock.mockReset();
		setupSplitViewCall();
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
		// @lore: Edit is now behind the "..." actions menu — open menu then click Edit.
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
