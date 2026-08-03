/**
 * P4 — AppShell settings overlay tests (Tasks 9, 11, AC-11 through AC-23)
 *
 * AC-11: Settings button opens settings overlay (Sidebar shows settings sections, Main shows profile form)
 * AC-12: Settings has 7 sections navigable via Sidebar NavItems
 * AC-20: Old tab-based SettingsPanel modal is deleted
 * AC-21: Escape key closes settings overlay
 *
 * @lore U6: Settings is opened via the Settings button (aria-label="Settings") in the
 * Sidebar bottom strip. The old "user profile" / "avatar" button was in the deleted IconRail.
 * @lore AD8a: historical — Rail-related AC-22 and AC-23 tests are removed (Rail deleted in U6).
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";

function renderShell(initialPath = "/conversations"): ReturnType<typeof render> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations", element: <div>Conversations Page</div> },
					{ path: "conversations/:threadId", element: <div>Conversations Page</div> },
					{ path: "work/portfolio", element: <div>Portfolio Page</div> },
					{ path: "knowledge", element: <div>Knowledge Page</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	return render(<RouterProvider router={router} />);
}

describe("AppShell — P4 Settings overlay", () => {
	beforeEach(() => {
		// W3: URL-aware mock so SettingsOrgChart (/api/org) doesn't crash.
		// X3: Also mock /api/agents so SettingsAgents doesn't break the page.
		// AH2: Also mock /api/harnesses so SettingsAgents harness fetch doesn't error.
		global.fetch = vi.fn().mockImplementation((url: unknown) => {
			const urlStr = typeof url === "string" ? url : String(url);
			if (urlStr.includes("/api/org")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ edges: [], users: [] }),
				});
			}
			if (urlStr.includes("/api/harnesses")) {
				return Promise.resolve({
					ok: true,
					json: () =>
						// AM4: SettingsHarnesses now renders in the Settings page and requires
						// a full HarnessCapabilityDescriptor shape to avoid rendering errors.
						Promise.resolve([
							{
								type: "builtin",
								name: "Built-in",
								kind: "local",
								accessMode: "api-gateway",
								authAction: { kind: "enter_api_key", label: "Enter API key" },
								discovery: { state: "ready" },
								models: [],
								runtime: {
									preCompactionTrigger: false,
									subAgents: false,
									mcpSupport: false,
									modelProviders: ["anthropic"],
									fileEditing: false,
									toolUse: false,
								},
								modelProviders: ["anthropic"],
							},
						]),
				});
			}
			if (urlStr.includes("/api/agents")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve([]),
				});
			}
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						conversations: [],
						work: [],
						knowledge: [],
						threads: [],
						nextCursor: null,
						// auth/me response
						id: "u-founder",
						name: "Test Founder",
						email: "test@example.com",
						avatarUrl: null,
						// settings response
						profile: { name: "Test Founder", email: "test@example.com", avatarUrl: null },
						teams: [],
						users: [],
						notifications: {
							reviewAlerts: true,
							blockerAlerts: true,
							quietHoursStart: "22:00",
							quietHoursEnd: "08:00",
							// @lore U1: mutedProducts renamed to mutedTeams
							mutedTeams: [],
						},
					}),
			});
		}) as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// AC-11: Settings button opens settings overlay showing settings nav in Sidebar
	it("settings button shows 'Settings' title in Sidebar body", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /settings/i }));

		await waitFor(() => {
			// Settings appears in both the sidebar label and the page header when open
			expect(screen.getAllByText("Settings").length).toBeGreaterThanOrEqual(1);
		});
	});

	// AC-12: Settings sections in Sidebar
	// AF15: Updated — "teams" removed (no SettingsTeams component),
	// "agents" and "worker" added. Count is now 9 sections.
	it("shows settings section NavItems in Sidebar when settings is open", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /settings/i }));

		await waitFor(() => {
			// W3: SettingsPage renders all sections simultaneously. Some labels
			// appear in both the Sidebar NavItems AND the SettingsPage headings.
			// Use getAllByText(...).length >= 1 to handle duplicates gracefully.
			expect(screen.getAllByText("Profile").length).toBeGreaterThanOrEqual(1);
			// "Org chart" may appear in both sidebar NavItem AND SettingsPage section heading
			expect(screen.getAllByText("Org chart").length).toBeGreaterThanOrEqual(1);
			// "Credentials" may appear in both sidebar NavItem AND SettingsPage section heading
			expect(screen.getAllByText("Credentials").length).toBeGreaterThanOrEqual(1);
			// "Notifications" now appears in both sidebar NavItem AND SettingsPage section heading
			expect(screen.getAllByText("Notifications").length).toBeGreaterThanOrEqual(1);
			// "Appearance" appears in both sidebar + SettingsPage section heading
			expect(screen.getAllByText("Appearance").length).toBeGreaterThanOrEqual(1);
			// AF15 AC-1: "Agents" section added (SettingsAgents now mounted)
			expect(screen.getAllByText("Agents").length).toBeGreaterThanOrEqual(1);
			// "Backend" appears in both sidebar + SettingsPage section heading
			expect(screen.getAllByText("Backend").length).toBeGreaterThanOrEqual(1);
		});
	});

	// AC-20: Settings is NOT a modal dialog (old SettingsPanel removed)
	it("settings overlay is NOT rendered as a modal role='dialog'", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /settings/i }));

		await waitFor(() => {
			// Settings appears in both the sidebar label and the page header when open
			expect(screen.getAllByText("Settings").length).toBeGreaterThanOrEqual(1);
		});

		// The new overlay should NOT be a modal dialog — it's an AppShell state change
		// Old SettingsPanel used role="dialog"; new overlay uses Sidebar content swap
		const dialogs = screen.queryAllByRole("dialog", { name: /settings/i });
		// Should either have no settings dialog, or the dialog is the shell-level one
		// The key is: no standalone modal with tabs (old SettingsPanel)
		const tabBasedSettingsDialog = dialogs.find(
			(d) => d.querySelector('[role="tablist"]') !== null,
		);
		expect(tabBasedSettingsDialog).toBeUndefined();
	});

	// AC-21: Escape closes settings overlay
	it("Escape key closes settings overlay", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /settings/i }));

		await waitFor(() => {
			// Settings appears in both the sidebar label and the page header when open
			expect(screen.getAllByText("Settings").length).toBeGreaterThanOrEqual(1);
		});

		await user.keyboard("{Escape}");

		await waitFor(() => {
			// "Settings" heading in Sidebar body should be gone
			expect(screen.queryByText("Settings")).not.toBeInTheDocument();
		});
	});

	// @lore U6: AC-23 (rail wrapper opacity-60) removed — Rail deleted in U6.
	// @lore AD8a: historical — The Sidebar does not have a rail wrapper to dim.

	// AC-11: Main pane shows Profile form when settings opened
	it("shows Profile section content in main pane when settings opened", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /settings/i }));

		await waitFor(() => {
			// Profile section: "Display name" label per settings.html mockup
			expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
		});
	});
});
