/**
 * X3 — SettingsAgents component unit tests (RED phase)
 *
 * AC-9: Settings UI Agents section renders agent table
 * AC-10: Settings UI edit form opens inline and saves
 * AC-11: Settings UI add form creates agent with template pre-fill
 * AC-12: Settings UI delete with two-click confirmation
 *
 * These tests FAIL until:
 *  - packages/web/src/settings/SettingsAgents.tsx is created
 *  - The component fetches from GET /api/agents
 *  - The component handles loading, error, empty, and populated states
 *  - Inline edit/add/delete behaviors are implemented
 *
 * @lore X3: SettingsAgents follows the SettingsOrgChart pattern — fetch on
 * mount, table display, inline expand for editing. No useSettings hook —
 * uses its own GET /api/agents fetch.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsAgents } from "../SettingsAgents.js";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_AGENTS = [
	{
		id: "agent-pm-1",
		name: "Acme PM",
		role: "product_manager",
		systemPrompt: "# PM\n\nYou are the product manager.",
		harnessType: "claude-code",
		modelTierPreference: "workhorse",
		maxConcurrentSessions: 1,
		status: "active",
		activeSessions: 0,
	},
	{
		id: "agent-builder-1",
		name: "Builder Bot",
		role: "builder",
		systemPrompt: null,
		harnessType: null,
		modelTierPreference: null,
		maxConcurrentSessions: 2,
		status: "active",
		activeSessions: 1,
	},
];

const PM_TEMPLATE = {
	role: "product_manager",
	content: "# You are the Product Manager\n\nHelp the team focus on {{product}}.",
};

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
// AC-9: SettingsAgents renders agent table
// ---------------------------------------------------------------------------

describe("X3 AC-9: SettingsAgents renders agent table", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				// AH2: mock /api/harnesses so SettingsAgents doesn't show "Harness unavailable" badges
				if (url.includes("/api/harnesses")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => [
							{ type: "claude-code", name: "Claude Code", modelProviders: ["anthropic"] },
							{
								type: "builtin",
								name: "Built-in Harness",
								modelProviders: ["anthropic", "openrouter"],
							},
						],
					});
				}
				if (url.includes("/api/agents") && !url.includes("/templates")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => MOCK_AGENTS,
					});
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders the agents section container with data-testid", async () => {
		render(<SettingsAgents />);
		// The section or the component root should be locatable
		await waitFor(() => {
			expect(screen.getByRole("table")).toBeInTheDocument();
		});
	});

	it("renders table headers: Name, Role, Harness, Model, Sessions, Actions", async () => {
		// AH2: column renamed from 'Model Tier' to 'Model' (per-agent model replaces tier select)
		render(<SettingsAgents />);

		await waitFor(() => {
			// Use queryAllByText for headers that may appear in both <th> and badge text
			expect(screen.getAllByText(/name/i).length).toBeGreaterThanOrEqual(1);
			expect(screen.getAllByText(/role/i).length).toBeGreaterThanOrEqual(1);
			expect(screen.getAllByText(/harness/i).length).toBeGreaterThanOrEqual(1);
			expect(screen.getAllByText(/^model$/i).length).toBeGreaterThanOrEqual(1);
			expect(screen.getAllByText(/sessions/i).length).toBeGreaterThanOrEqual(1);
			expect(screen.getAllByText(/actions/i).length).toBeGreaterThanOrEqual(1);
		});
	});

	it("renders seeded agent names in the table", async () => {
		render(<SettingsAgents />);

		await waitFor(() => {
			expect(screen.getByText("Acme PM")).toBeInTheDocument();
			expect(screen.getByText("Builder Bot")).toBeInTheDocument();
		});
	});

	it("renders role badges for each agent", async () => {
		render(<SettingsAgents />);

		await waitFor(() => {
			expect(screen.getByText("product_manager")).toBeInTheDocument();
			expect(screen.getByText("builder")).toBeInTheDocument();
		});
	});

	it("shows 'Default' when harnessType is null", async () => {
		// AH2: null harnessType now renders "Default" (previously "Any")
		render(<SettingsAgents />);

		await waitFor(() => {
			// Builder Bot has no harness type → shows "Default"
			const defaults = screen.getAllByText("Default");
			expect(defaults.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("shows 'Default' when modelId is null", async () => {
		// AH2: Model column replaced Model Tier column; null modelId shows "Default"
		render(<SettingsAgents />);

		await waitFor(() => {
			const defaults = screen.getAllByText("Default");
			expect(defaults.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("renders Edit and Delete buttons for each agent", async () => {
		render(<SettingsAgents />);

		await waitFor(() => {
			const editButtons = screen.getAllByRole("button", { name: /edit/i });
			expect(editButtons.length).toBeGreaterThanOrEqual(MOCK_AGENTS.length);
			const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
			expect(deleteButtons.length).toBeGreaterThanOrEqual(MOCK_AGENTS.length);
		});
	});

	it("shows loading skeletons before data arrives", () => {
		// Make fetch hang indefinitely
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() => new Promise(() => {})),
		);
		render(<SettingsAgents />);

		// Should show loading skeletons (SkeletonList renders role="status")
		const skeletons = document.querySelectorAll('[role="status"]');
		expect(skeletons.length).toBeGreaterThan(0);
	});

	it("shows error message when fetch fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockImplementation(() =>
					Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
				),
		);

		render(<SettingsAgents />);

		await waitFor(() => {
			expect(screen.getByText(/failed to load agents/i)).toBeInTheDocument();
		});
	});

	it("shows empty state when no agents exist", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockImplementation(() => Promise.resolve({ ok: true, status: 200, json: async () => [] })),
		);

		render(<SettingsAgents />);

		await waitFor(() => {
			expect(screen.getByText(/no agents configured/i)).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// AC-10: Settings UI edit form opens inline and saves
// ---------------------------------------------------------------------------

describe("X3 AC-10: Settings UI edit form opens inline and saves", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
				// AH2: mock /api/harnesses
				if (url.includes("/api/harnesses")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => [
							{ type: "claude-code", name: "Claude Code", modelProviders: ["anthropic"] },
						],
					});
				}
				if (url.includes("/api/agents") && !url.includes("/templates")) {
					if (!opts?.method || opts.method === "GET") {
						return Promise.resolve({
							ok: true,
							status: 200,
							json: async () => MOCK_AGENTS,
						});
					}
					if (opts?.method === "PATCH") {
						const body = JSON.parse(opts.body as string) as Record<string, unknown>;
						return Promise.resolve({
							ok: true,
							status: 200,
							json: async () => ({
								...MOCK_AGENTS[0],
								...body,
							}),
						});
					}
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("clicking Edit opens inline edit form below the row", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		// Edit form should appear with form fields
		await waitFor(() => {
			expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
		});
	});

	it("edit form is pre-filled with agent's current values", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => {
			const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
			expect(nameInput.value).toBe("Acme PM");
		});
	});

	it("Save button calls PATCH /api/agents/:id with updated values", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => screen.getByLabelText(/name/i));
		const nameInput = screen.getByLabelText(/name/i);
		await user.clear(nameInput);
		await user.type(nameInput, "Updated PM Name");

		const saveButton = screen.getByRole("button", { name: /save/i });
		await user.click(saveButton);

		await waitFor(() => {
			const fetchMock = vi.mocked(fetch);
			const patchCall = fetchMock.mock.calls.find(
				([url, opts]) =>
					typeof url === "string" &&
					url.includes("/api/agents/agent-pm-1") &&
					(opts as RequestInit)?.method === "PATCH",
			);
			expect(patchCall).toBeDefined();
		});
	});

	it("shows toast 'Agent saved' on successful save", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => screen.getByLabelText(/name/i));
		const saveButton = screen.getByRole("button", { name: /save/i });
		await user.click(saveButton);

		await waitFor(() => {
			expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/agent saved/i));
		});
	});

	it("Cancel button closes the edit form without saving", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => screen.getByRole("button", { name: /cancel/i }));
		const cancelButton = screen.getByRole("button", { name: /cancel/i });
		await user.click(cancelButton);

		// Edit form should be gone
		await waitFor(() => {
			expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// AC-11: Settings UI add form creates agent with template pre-fill
// ---------------------------------------------------------------------------

describe("X3 AC-11: Settings UI add form creates agent with template pre-fill", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
				// AH2: mock /api/harnesses
				if (url.includes("/api/harnesses")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => [
							{ type: "builtin", name: "Built-in Harness", modelProviders: ["anthropic"] },
						],
					});
				}
				if (url.includes("/api/agents/templates/product_manager")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => PM_TEMPLATE,
					});
				}
				if (url.includes("/api/agents/templates/builder")) {
					return Promise.resolve({
						ok: false,
						status: 404,
						json: async () => ({ code: "NOT_FOUND" }),
					});
				}
				if (url.includes("/api/agents") && !url.includes("/templates")) {
					if (!opts?.method || opts.method === "GET") {
						return Promise.resolve({
							ok: true,
							status: 200,
							json: async () => MOCK_AGENTS,
						});
					}
					if (opts?.method === "POST") {
						const body = JSON.parse(opts.body as string) as Record<string, unknown>;
						return Promise.resolve({
							ok: true,
							status: 201,
							json: async () => ({
								id: `new-agent-${Date.now()}`,
								...body,
								kind: "ai",
								status: "active",
								activeSessions: 0,
							}),
						});
					}
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);
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

	it("add form has a role select defaulting to 'builder'", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const addButton = screen.getByRole("button", { name: /add agent/i });
		await user.click(addButton);

		await waitFor(() => {
			const roleSelect = screen.getByRole("combobox", { name: /role/i }) as HTMLSelectElement;
			expect(roleSelect.value).toBe("builder");
		});
	});

	it("changing role to product_manager pre-fills system prompt textarea with template", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const addButton = screen.getByRole("button", { name: /add agent/i });
		await user.click(addButton);

		await waitFor(() => screen.getByRole("combobox", { name: /role/i }));
		const roleSelect = screen.getByRole("combobox", { name: /role/i });
		await user.selectOptions(roleSelect, "product_manager");

		// Should fetch the template and pre-fill the textarea
		await waitFor(() => {
			const textarea = screen.getByRole("textbox", {
				name: /system prompt/i,
			}) as HTMLTextAreaElement;
			expect(textarea.value).toContain("Product Manager");
		});
	});

	it("Save creates agent via POST /api/agents", async () => {
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
			const fetchMock = vi.mocked(fetch);
			const postCall = fetchMock.mock.calls.find(
				([url, opts]) =>
					typeof url === "string" &&
					url.includes("/api/agents") &&
					!url.includes("/templates") &&
					(opts as RequestInit)?.method === "POST",
			);
			expect(postCall).toBeDefined();
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
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
				// AH2: mock /api/harnesses
				if (url.includes("/api/harnesses")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => [
							{ type: "builtin", name: "Built-in Harness", modelProviders: ["anthropic"] },
						],
					});
				}
				if (url.includes("/api/agents") && !url.includes("/templates")) {
					if (!opts?.method || opts.method === "GET") {
						return Promise.resolve({
							ok: true,
							status: 200,
							json: async () => MOCK_AGENTS,
						});
					}
					if (opts?.method === "DELETE") {
						return Promise.resolve({
							ok: true,
							status: 200,
							json: async () => ({ id: "agent-pm-1", status: "retired" }),
						});
					}
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("first click changes Delete button text to 'Confirm?'", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
		await user.click(deleteButtons[0] as HTMLElement);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /confirm\?/i })).toBeInTheDocument();
		});
	});

	it("second click within timeout sends DELETE request", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
		await user.click(deleteButtons[0] as HTMLElement);

		// Click "Confirm?" immediately
		await waitFor(() => screen.getByRole("button", { name: /confirm\?/i }));
		const confirmButton = screen.getByRole("button", { name: /confirm\?/i });
		await user.click(confirmButton);

		await waitFor(() => {
			const fetchMock = vi.mocked(fetch);
			const deleteCall = fetchMock.mock.calls.find(
				([url, opts]) =>
					typeof url === "string" &&
					url.includes("/api/agents/agent-pm-1") &&
					(opts as RequestInit)?.method === "DELETE",
			);
			expect(deleteCall).toBeDefined();
		});
	});

	it("shows toast 'Agent deleted' after successful deletion", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
		await user.click(deleteButtons[0] as HTMLElement);

		await waitFor(() => screen.getByRole("button", { name: /confirm\?/i }));
		await user.click(screen.getByRole("button", { name: /confirm\?/i }));

		await waitFor(() => {
			expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/agent deleted/i));
		});
	});

	it("button reverts to 'Delete' if no second click within 3 seconds", async () => {
		vi.useFakeTimers();
		const user = userEvent.setup({ delay: null });
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
		await user.click(deleteButtons[0] as HTMLElement);

		await waitFor(() => screen.getByRole("button", { name: /confirm\?/i }));

		// Advance time past the 3-second timeout
		vi.advanceTimersByTime(3100);

		await waitFor(() => {
			// Should revert to "Delete" — "Confirm?" should be gone
			expect(screen.queryByRole("button", { name: /confirm\?/i })).not.toBeInTheDocument();
		});

		vi.useRealTimers();
	});
});
