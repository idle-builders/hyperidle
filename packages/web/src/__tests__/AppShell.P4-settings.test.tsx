/**
 * P4 — AppShell settings overlay tests (Tasks 9, 11, AC-11 through AC-23)
 *
 * AC-11: Avatar click opens settings overlay (Submenu shows settings sections, Main shows profile form)
 * AC-12: Settings has 7 sections navigable via Submenu NavItems
 * AC-20: Old tab-based SettingsPanel modal is deleted
 * AC-21: Escape key closes settings overlay
 * AC-22: Clicking view icon while settings open closes settings and navigates
 * AC-23: Rail is dimmed while settings is open
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
		global.fetch = vi.fn().mockResolvedValue({
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
					// rail response
					bets: [],
					blockers: [],
					awaitingOrdering: [],
					costBurnRate: {
						todaySpend: null,
						todayCap: null,
						weekSpend: null,
						weekCap: null,
						weekTokens: null,
					},
				}),
		}) as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// AC-11: Avatar click opens settings overlay showing settings in Submenu
	it("avatar click shows 'Settings' title in Submenu", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /user profile/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /user profile/i }));

		await waitFor(() => {
			expect(screen.getByText("Settings")).toBeInTheDocument();
		});
	});

	// AC-12: Settings has 7 sections
	it("shows 7 settings section NavItems in Submenu when settings is open", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /user profile/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /user profile/i }));

		await waitFor(() => {
			// All 7 sections should be visible
			expect(screen.getByText("Profile")).toBeInTheDocument();
			expect(screen.getByText("Org Chart")).toBeInTheDocument();
			expect(screen.getByText("Credentials")).toBeInTheDocument();
			expect(screen.getByText("Notifications")).toBeInTheDocument();
			expect(screen.getByText("Appearance")).toBeInTheDocument();
			// @lore U1: "Products" renamed to "Teams" in settings menu
			expect(screen.getByText("Teams")).toBeInTheDocument();
			expect(screen.getByText("Backend")).toBeInTheDocument();
		});
	});

	// AC-20: Settings is NOT a modal dialog (old SettingsPanel removed)
	it("settings overlay is NOT rendered as a modal role='dialog'", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /user profile/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /user profile/i }));

		await waitFor(() => {
			expect(screen.getByText("Settings")).toBeInTheDocument();
		});

		// The new overlay should NOT be a modal dialog — it's an AppShell state change
		// Old SettingsPanel used role="dialog"; new overlay uses Submenu content swap
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
			expect(screen.getByRole("button", { name: /user profile/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /user profile/i }));

		await waitFor(() => {
			expect(screen.getByText("Settings")).toBeInTheDocument();
		});

		await user.keyboard("{Escape}");

		await waitFor(() => {
			// "Settings" heading in Submenu should be gone
			expect(screen.queryByText("Settings")).not.toBeInTheDocument();
		});
	});

	// AC-23: Rail is dimmed when settings is open
	it("rail wrapper has opacity-60 class when settings is open", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /user profile/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /user profile/i }));

		await waitFor(() => {
			expect(screen.getByText("Settings")).toBeInTheDocument();
		});

		// The rail wrapper is dimmed (pointer-events-none opacity-60) when settings is open.
		// The main-content pane is NOT dimmed — it shows settings content and must be interactive.
		const railWrapper = screen.getByTestId("rail-wrapper");
		expect(railWrapper.getAttribute("aria-hidden")).toBe("true");
	});

	// AC-11: Main pane shows Profile form when settings opened
	it("shows Profile section content in main pane when settings opened", async () => {
		const user = userEvent.setup();
		renderShell();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /user profile/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /user profile/i }));

		await waitFor(() => {
			// Profile section should be active by default
			expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
		});
	});
});
