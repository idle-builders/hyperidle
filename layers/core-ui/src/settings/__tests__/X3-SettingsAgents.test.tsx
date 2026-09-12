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
 *  - Role field changed from <select> to Combobox (custom combobox, not a native select)
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
								type: "opencode",
								name: "OpenCode",
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

	it("renders role display label for each agent (not raw slug)", async () => {
		render(<SettingsAgents />);

		await waitFor(() => {
			// UI-042: role displayed as human label via roleLabel(), not raw slug.
			// The subtitle pattern is "Role · Harness · N active".
			// getAllByText to handle multiple subtitle spans (one per row).
			expect(screen.getAllByText(/Product Manager/).length).toBeGreaterThan(0);
			// "Builder ·" uniquely identifies the subtitle (not the agent name "Builder Bot")
			expect(screen.getAllByText(/Builder ·/).length).toBeGreaterThan(0);
			// Raw slugs must NOT appear anywhere
			expect(screen.queryByText(/product_manager/)).not.toBeInTheDocument();
		});
	});

	it("shows 'Default' when harnessType is null", async () => {
		// AH2: null harnessType now renders "Default" (previously "Any")
		render(<SettingsAgents />);

		await waitFor(() => {
			// Builder Bot has no harness type → shows "Default" in the compact subtitle.
			const defaults = screen.getAllByText(/Default/);
			expect(defaults.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("shows 'Default' when modelId is null", async () => {
		// AH2: Model column replaced Model Tier column; null modelId shows "Default"
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
			// (Delete item is inside the menu, only visible when the menu is open.)
			expect(screen.getByRole("button", { name: /actions for acme pm/i })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: /actions for builder bot/i })).toBeInTheDocument();
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
							{ type: "opencode", name: "OpenCode", modelProviders: ["anthropic"] },
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
							{ type: "opencode", name: "OpenCode", modelProviders: ["anthropic"] },
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
	 * @lore FR-10: Delete is now behind the "..." actions Menu (role=menuitem).
	 * @lore FR-10b: DS Menu always closes after onSelect (Menu.tsx:183), so two-step
	 * confirm cannot stay in the same open menu. After the first "Delete" click the menu
	 * closes and the row switches to inline confirm/cancel buttons (role="button").
	 * Flow: click "Actions for <name>" → menu opens → click "Delete" menuitem →
	 * menu closes → inline "Confirm delete?" button appears on the row → click to confirm.
	 */
	function getConfirmButton(): HTMLElement {
		return screen.getByRole("button", { name: /confirm delete\?/i });
	}

	it("first click shows inline 'Confirm delete?' button on the row", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		// FR-10: open the "..." actions menu, then click Delete
		await user.click(screen.getByRole("button", { name: /actions for acme pm/i }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^delete$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^delete$/i }));

		// Menu closes, inline confirm button appears on the row
		await waitFor(() => {
			expect(getConfirmButton()).toBeInTheDocument();
		});
	});

	it("second click within timeout sends DELETE request", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		// FR-10: open menu → click Delete → click inline Confirm delete? button
		await user.click(screen.getByRole("button", { name: /actions for acme pm/i }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^delete$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^delete$/i }));

		await waitFor(() => getConfirmButton());
		await user.click(getConfirmButton());

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

		// FR-10: open menu → click Delete → click inline Confirm delete? button
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

		// FR-10: open menu → click Delete (first click sets confirmingDeleteId)
		await user.click(screen.getByRole("button", { name: /actions for acme pm/i }));
		await waitFor(() => screen.getByRole("menuitem", { name: /^delete$/i }));
		await user.click(screen.getByRole("menuitem", { name: /^delete$/i }));

		// Inline confirm button appears
		await waitFor(() => getConfirmButton());

		// Advance time past the 3-second timeout
		vi.advanceTimersByTime(3100);

		await waitFor(() => {
			// Inline confirm button gone, "..." actions button restored
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
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
				if (url.includes("/api/harnesses")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => [
							{ type: "opencode", name: "OpenCode", modelProviders: ["anthropic"] },
						],
					});
				}
				if (url.includes("/api/agents") && !url.includes("/templates")) {
					if (!opts?.method || opts.method === "GET") {
						return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_AGENTS });
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
	 * Proves keyboard-only delete flow:
	 * focus trigger → Enter opens menu → focus auto-moves to Edit menuitem
	 * → ArrowDown moves to Delete → Enter triggers delete + menu closes
	 * → Confirm button appears → focus Confirm → Enter → DELETE request sent.
	 *
	 * Evidence that the coordinator's "open the menu with the keyboard, move to
	 * Delete, trigger it, and confirm the flow completes" path is reachable
	 * without a mouse.
	 */
	it("Enter on trigger opens menu, ArrowDown reaches Delete, Enter triggers, Confirm responds to Enter", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Acme PM")).toBeInTheDocument());

		// Step 1: Focus the trigger button (keyboard-equivalent of Tab navigation)
		const triggerBtn = screen.getByRole("button", { name: /actions for acme pm/i });
		triggerBtn.focus();
		expect(document.activeElement).toBe(triggerBtn);

		// Step 2: Enter opens the menu; Menu auto-focuses the first enabled menuitem (Menu.tsx:70-73)
		await user.keyboard("{Enter}");
		await waitFor(() => {
			expect(screen.getByRole("menuitem", { name: /^edit$/i })).toBeInTheDocument();
			expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /^edit$/i }));
		});

		// Step 3: ArrowDown moves focus from Edit to Delete (Menu.tsx:123-127)
		await user.keyboard("{ArrowDown}");
		await waitFor(() => {
			expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /^delete$/i }));
		});

		// Step 4: Enter selects Delete → onSelect fires (sets confirmingDeleteId) → menu closes
		// Inline Confirm + Cancel buttons replace the "..." trigger on the row.
		await user.keyboard("{Enter}");
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /confirm delete\?/i })).toBeInTheDocument();
		});

		// Step 5: Focus and activate the Confirm button via Enter (button is keyboard-accessible)
		const confirmBtn = screen.getByRole("button", { name: /confirm delete\?/i });
		confirmBtn.focus();
		await user.keyboard("{Enter}");

		// Step 6: DELETE request sent
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
		await waitFor(() => {
			expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/agent deleted/i));
		});
	});
});
