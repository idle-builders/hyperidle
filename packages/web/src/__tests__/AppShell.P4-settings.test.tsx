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
 * Rail-related AC-22 and AC-23 tests are removed (Rail deleted in U6).
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
		global.fetch = vi.fn().mockImplementation((url: unknown) => {
			const urlStr = typeof url === "string" ? url : String(url);
			if (urlStr.includes("/api/org")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ edges: [], users: [] }),
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
							costAlerts: true,
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
			expect(screen.getByText("Settings")).toBeInTheDocument();
		});
	});

	// AC-12: Settings has 7 sections
	it("shows 7 settings section NavItems in Sidebar when settings is open", async () => {
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
			// These appear in sidebar NavItems even if not in SettingsPage:
			expect(screen.getByText("Org Chart")).toBeInTheDocument();
			expect(screen.getByText("Credentials")).toBeInTheDocument();
			expect(screen.getByText("Notifications")).toBeInTheDocument();
			// "Appearance" appears in both sidebar + SettingsPage section heading
			expect(screen.getAllByText("Appearance").length).toBeGreaterThanOrEqual(1);
			// @lore U1: "Products" renamed to "Teams" in settings menu
			expect(screen.getByText("Teams")).toBeInTheDocument();
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
			expect(screen.getByText("Settings")).toBeInTheDocument();
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
			expect(screen.getByText("Settings")).toBeInTheDocument();
		});

		await user.keyboard("{Escape}");

		await waitFor(() => {
			// "Settings" heading in Sidebar body should be gone
			expect(screen.queryByText("Settings")).not.toBeInTheDocument();
		});
	});

	// @lore U6: AC-23 (rail wrapper opacity-60) removed — Rail deleted in U6.
	// The Sidebar does not have a rail wrapper to dim.

	// AC-11: Main pane shows Profile form when settings opened
	it("shows Profile section content in main pane when settings opened", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /settings/i }));

		await waitFor(() => {
			// Profile section should be active by default
			expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
		});
	});
});
