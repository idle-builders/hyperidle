/**
 * X3 — SettingsAgents component unit tests (updated for AV2)
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
 *  - Role field changed from <select> to RoleCombobox (custom combobox, not a native select)
 *  - Delete button has aria-label="Delete <agentName>" — match by label not by text content
 *
 * @lore X3: SettingsAgents follows the SettingsOrgChart pattern — fetch on
 * mount, list display, SplitView expand for editing. No useSettings hook —
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
		modelId: null,
		modelProvider: null,
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
		modelId: null,
		modelProvider: null,
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
// AC-9: SettingsAgents renders agent list
// ---------------------------------------------------------------------------

describe("X3 AC-9: SettingsAgents renders agent list", () => {
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

	it("renders seeded agent names in the list", async () => {
		render(<SettingsAgents />);

		await waitFor(() => {
			expect(screen.getByText("Acme PM")).toBeInTheDocument();
			expect(screen.getByText("Builder Bot")).toBeInTheDocument();
		});
	});

	it("renders role text for each agent", async () => {
		render(<SettingsAgents />);

		await waitFor(() => {
			// AV2: role appears as subtitle + Tag cell — getAllByText handles multiple matches
			expect(screen.getAllByText("product_manager").length).toBeGreaterThanOrEqual(1);
			expect(screen.getAllByText("builder").length).toBeGreaterThanOrEqual(1);
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

	it("renders a Delete button for each agent", async () => {
		render(<SettingsAgents />);

		await waitFor(() => {
			// AV2: Delete button has aria-label="Delete <agentName>"
			expect(screen.getByRole("button", { name: /delete acme pm/i })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: /delete builder bot/i })).toBeInTheDocument();
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
// AC-10: Removed — inline edit via Edit button is gone in AV2.
// AV2: clicking a Row opens the AgentEditor in the SplitView destination pane.
// Edit behavior now tested in AV2-SettingsAgents.test.tsx.
// ---------------------------------------------------------------------------

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

	/**
	 * Find the Confirm? action button (not the Row div which also has role="button"
	 * and includes "Confirm?" in its accessible name due to text content).
	 * The action button is a <button> element (not a div with role="button").
	 *
	 * @lore X3 AV2: Row uses div[role=button] for clickable rows with nested actions.
	 * The Row div's accessible name includes all its text content (including "Confirm?"),
	 * so getAllByRole("button", { name: /confirm\?/i }) returns both the Row div AND
	 * the actual Confirm button. We filter by tagName to get only the <button> element.
	 */
	function getConfirmButton(): HTMLElement {
		const candidates = screen.getAllByRole("button", { name: /confirm\?/i });
		const btn = candidates.find((el) => el.tagName.toLowerCase() === "button");
		if (!btn) throw new Error("Confirm? <button> element not found");
		return btn;
	}

	it("first click changes Delete button to 'Confirm?'", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		// AV2: Delete button has aria-label="Delete <agentName>" — use that for precise targeting
		const deleteButton = screen.getByRole("button", { name: /delete acme pm/i });
		await user.click(deleteButton);

		await waitFor(() => {
			expect(getConfirmButton()).toBeInTheDocument();
		});
	});

	it("second click within timeout sends DELETE request", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const deleteButton = screen.getByRole("button", { name: /delete acme pm/i });
		await user.click(deleteButton);

		// Click "Confirm?" immediately
		await waitFor(() => getConfirmButton());
		const confirmButton = getConfirmButton();
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

		const deleteButton = screen.getByRole("button", { name: /delete acme pm/i });
		await user.click(deleteButton);

		await waitFor(() => getConfirmButton());
		await user.click(getConfirmButton());

		await waitFor(() => {
			expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/agent deleted/i));
		});
	});

	it("button reverts to 'Delete' if no second click within 3 seconds", async () => {
		vi.useFakeTimers();
		const user = userEvent.setup({ delay: null });
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		const deleteButton = screen.getByRole("button", { name: /delete acme pm/i });
		await user.click(deleteButton);

		await waitFor(() => getConfirmButton());

		// Advance time past the 3-second timeout
		vi.advanceTimersByTime(3100);

		await waitFor(() => {
			// Should revert to "Delete" — "Confirm?" <button> should be gone
			const candidates = screen.queryAllByRole("button", { name: /confirm\?/i });
			const confirmBtn = candidates.find((el) => el.tagName.toLowerCase() === "button");
			expect(confirmBtn).toBeUndefined();
		});

		vi.useRealTimers();
	});
});
