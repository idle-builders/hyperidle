/**
 * X3 — SettingsAgents component unit tests (updated for AV2, then BC5 T9)
 *
 * AC-9: Settings UI Agents section renders agent list (ItemList/Row, not a table)
 * AC-10: REMOVED — inline edit via Edit button replaced by SplitView row-click.
 *         Edit behavior now tested in AV2-SettingsAgents.test.tsx.
 * AC-11: Settings UI add form creates agent with template pre-fill
 * AC-12: Settings UI delete with two-click confirmation
 *
 * AV2 changes vs original X3:
 *  - Table layout removed → ItemList + Row (no role="table", no column headers)
 *  - Edit button removed → clicking a row opens SplitView destination (AgentEditor)
 *  - Role field changed from <select> to Combobox (custom combobox, not a native select)
 *  - Delete button has aria-label="Delete <agentName>" — match by label not by text content
 *
 * @lore BC5 T9: the door swap — `call("search_users", { kind: "ai" })` +
 * one `call("open_user", { id })` per row replace `GET /api/agents`;
 * `call("edit_user", ...)` replaces the agent PATCH/POST/DELETE routes
 * (delete is `status: "retired"`, never a hard delete). `call` is mocked at
 * the door; a small in-memory store keeps `search_users`/`open_user`/
 * `edit_user` consistent with each other across the create/delete refetch.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
					email: null,
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
						behaviour: null,
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
					behaviour: null,
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
// AC-9: SettingsAgents renders agent list
// ---------------------------------------------------------------------------

describe("X3 AC-9: SettingsAgents renders agent list", () => {
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
			// UI-042: role displayed as human label via roleLabel(), not raw slug.
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
// AC-11: Settings add form creates agent
// ---------------------------------------------------------------------------

describe("X3 AC-11: Settings UI add form creates agent", () => {
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

describe("X3 AC-12: Settings UI delete with two-click confirmation", () => {
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

describe("X3 keyboard: actions menu is fully keyboard-navigable", () => {
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
