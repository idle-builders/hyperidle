import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";

// Minimal settings response (no appearance field — Contract 2).
const STUB_SETTINGS = {
	profile: { name: "Founder", email: "", avatarUrl: null },
	teams: [],
	users: [],
	notifications: {
		reviewAlerts: true,
		costAlerts: true,
		blockerAlerts: true,
		quietHoursStart: "22:00",
		quietHoursEnd: "08:00",
		mutedTeams: [],
	},
};

// L8: AppShell fetches /api/threads, /api/settings, /api/auth/me on mount.
// @lore U6: /api/rail is no longer fetched (Rail component deleted). Stub covers
// all routes that AppShell uses.
// @lore M3 review C2: stub must cover PATCH /api/settings so handleSettingsSave
// succeeds and the density-wiring tests can assert the dialog closes.
function stubApiFetch(): void {
	global.fetch = vi.fn(async (input: RequestInfo | URL) => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.href
					: (input as Request).url;
		// /api/settings (GET and PATCH) — return ok so SettingsPanel closes on save
		if (url.includes("/api/settings")) {
			return { ok: true, json: async () => STUB_SETTINGS } as unknown as Response;
		}
		// GET /api/auth/me
		if (url.includes("/api/auth/me")) {
			return {
				ok: true,
				json: async () => ({ id: "u-test", name: "Test", email: "", role: "founder" }),
			} as unknown as Response;
		}
		// Fallback: threads and anything else
		return {
			ok: true,
			json: async () => ({ threads: [], nextCursor: null }),
		} as unknown as Response;
	}) as unknown as typeof fetch;
}

function renderShell(
	initialPath = "/conversations",
	childContent = "Test Page Content",
): ReturnType<typeof render> {
	stubApiFetch();
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					// L9: canonical conversation routes replace legacy /review and /chat.
					{ path: "conversations", element: <div>{childContent}</div> },
					{ path: "conversations/:threadId", element: <div>{childContent}</div> },
					{ path: "work/portfolio", element: <div>Portfolio Page</div> },
					{ path: "work/team", element: <div>Team Page</div> },
					{ path: "knowledge", element: <div>Knowledge Page</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	return render(<RouterProvider router={router} />);
}

describe("AppShell", () => {
	// @lore U6: AppShell now uses Sidebar (data-ds-shell="Sidebar") instead of
	// IconRail + Submenu + Rail. The test asserts the new layout structure.
	it("renders the shell layout with Sidebar + main regions", async () => {
		const { container } = renderShell();
		await waitFor(() => {
			// Sidebar present
			expect(container.querySelector("[data-ds-shell='Sidebar']")).toBeInTheDocument();
			// Main content area
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
			// Outlet content
			expect(screen.getByText("Test Page Content")).toBeInTheDocument();
		});
	});

	it("renders the Conversations section in the sidebar", async () => {
		// @lore U6: The sidebar section header for Conversations uses only aria-label
		// (no visible text) to avoid collision with the empty-state "No recent conversations".
		// Use getByRole with name to find the section button.
		renderShell("/conversations");
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /conversations/i })).toBeInTheDocument();
		});
	});

	it("switches views when clicking sidebar section buttons", async () => {
		const user = userEvent.setup();
		renderShell("/conversations");

		await waitFor(() => {
			expect(screen.getByText("Test Page Content")).toBeInTheDocument();
		});

		// Click Work view button in sidebar
		const workButton = screen.getByRole("button", { name: /work/i });
		await user.click(workButton);

		await waitFor(() => {
			expect(screen.getByText("Portfolio Page")).toBeInTheDocument();
		});
	});

	// @lore U6: Settings is accessed via the Settings button (gear icon) in the Sidebar bottom strip.
	// The old "user profile" button was part of the deleted IconRail.
	it("opens settings panel when settings button is clicked", async () => {
		const user = userEvent.setup();
		renderShell("/conversations");

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /settings/i }));

		// P4: SettingsPanel modal removed. Settings overlay is now a shell-state
		// content swap — Sidebar shows settings nav items, Main shows the active section.
		await waitFor(() => {
			expect(screen.getByText("Settings")).toBeInTheDocument();
		});
	});

	// @lore U6: The Rail is deleted. Tests for "Active Bets", "Blockers", "Cost"
	// in the Rail are removed. Those values are now part of the WorkTeam page context.

	// @lore U6: The Submenu collapse/expand behavior is removed (Submenu deleted).
	// The Sidebar is always visible. Responsive tests for Submenu collapse are removed.

	describe("density wiring (J1)", () => {
		// @lore AppShell applies data-density on its root so [data-density="..."] CSS vars cascade.
		function getDensityRoot(container: HTMLElement): HTMLElement | null {
			return container.querySelector<HTMLElement>("[data-density]");
		}

		it("renders a root element carrying data-density", async () => {
			const { container } = renderShell();
			await waitFor(() => {
				expect(screen.getByTestId("main-content")).toBeInTheDocument();
			});
			const root = getDensityRoot(container);
			expect(root).not.toBeNull();
		});

		it('default data-density is "default" (matches DEFAULT_SETTINGS baseline)', async () => {
			const { container } = renderShell();
			await waitFor(() => {
				expect(screen.getByTestId("main-content")).toBeInTheDocument();
			});
			const root = getDensityRoot(container);
			expect(root?.getAttribute("data-density")).toBe("default");
		});

		// @lore R9: The density selector was removed from SettingsAppearance per the R9 action
		// prominence audit. The auto-density system (AQ-016) still functions at narrow viewports.
		// Tests that exercised the density UI control are removed; the data-density attribute
		// remains on the shell root for the auto-density CSS cascade.
	});

	describe("global search navigation by type", () => {
		// I4 N1: `handleSearchNavigate` must route by result type.
		// Fixture routes added so we can observe where navigation lands.
		function renderShellWithProbes(initialPath = "/conversations"): {
			user: ReturnType<typeof userEvent.setup>;
			router: ReturnType<typeof createMemoryRouter>;
		} {
			const user = userEvent.setup();
			const router = createMemoryRouter(
				[
					{
						path: "/",
						element: <AppShell />,
						children: [
							// L9: canonical conversation routes.
							{ path: "conversations", element: <div>Conversations Queue Page</div> },
							{
								path: "conversations/:threadId",
								element: <div data-testid="conversations-target">Conversations Detail Page</div>,
							},
							{ path: "work/portfolio", element: <div>Portfolio Page</div> },
							{ path: "work/team", element: <div>Team Page</div> },
							{
								path: "work/bet/:betId",
								element: <div data-testid="work-bet-target">Work Bet Target</div>,
							},
							{ path: "knowledge", element: <div>Knowledge Page</div> },
							{
								path: "knowledge/:knowledgeId",
								element: <div data-testid="knowledge-target">Knowledge Target</div>,
							},
						],
					},
				],
				{ initialEntries: [initialPath] },
			);
			render(<RouterProvider router={router} />);
			return { user, router };
		}

		beforeEach(() => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						conversations: [],
						work: [
							{
								id: "b42",
								title: "Bet Fortytwo",
								team: "HyperIdle",
								// @lore U1: "committed" merged into "active"
								status: "active",
								appetite: "2 weeks",
							},
						],
						knowledge: [
							{
								id: "k7",
								title: "Arch doc",
								layer: "L2",
								kind: "pattern",
								status: "validated",
								timestamp: "now",
							},
						],
					}),
			}) as typeof fetch;
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("navigates work result to /work/bet/{id}", async () => {
			// I4 N1: work result id must produce /work/bet/<id>.
			const { user, router } = renderShellWithProbes();
			await user.keyboard("{Meta>}k{/Meta}");
			const input = await screen.findByRole("textbox");
			await user.type(input, "Bet");
			await waitFor(() => expect(screen.getByText("Bet Fortytwo")).toBeInTheDocument());
			await user.click(screen.getByText("Bet Fortytwo"));
			await waitFor(() => {
				expect(router.state.location.pathname).toBe("/work/bet/b42");
			});
		});

		it("navigates knowledge result to /knowledge/{id}", async () => {
			const { user, router } = renderShellWithProbes();
			await user.keyboard("{Meta>}k{/Meta}");
			const input = await screen.findByRole("textbox");
			await user.type(input, "Arch");
			await waitFor(() => expect(screen.getByText("Arch doc")).toBeInTheDocument());
			await user.click(screen.getByText("Arch doc"));
			await waitFor(() => {
				expect(router.state.location.pathname).toBe("/knowledge/k7");
			});
		});

		it("navigates conversation result to /conversations/:id (L9: id from search result)", async () => {
			// L9: handleSearchNavigate now routes to /conversations/:id when the
			// search result carries an id (arch-critique SUGGESTION #4 resolved).
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						conversations: [
							{
								id: "c9",
								title: "Review session",
								snippet: "...",
								timestamp: "1m ago",
								kind: "review",
							},
						],
						work: [],
						knowledge: [],
					}),
			});
			const { user, router } = renderShellWithProbes("/knowledge");
			await user.keyboard("{Meta>}k{/Meta}");
			const input = await screen.findByRole("textbox");
			await user.type(input, "Review");
			await waitFor(() => expect(screen.getByText("Review session")).toBeInTheDocument());
			await user.click(screen.getByText("Review session"));
			await waitFor(() => {
				expect(router.state.location.pathname).toBe("/conversations/c9");
			});
		});
	});
});
