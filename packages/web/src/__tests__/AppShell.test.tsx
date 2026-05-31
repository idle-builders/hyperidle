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

// L8: AppShell fetches /api/threads, /api/settings, /api/rail, /api/auth/me
// on mount. Route-aware stub so all API paths resolve rather than triggering
// unhandled rejections. Applied unconditionally (jsdom 20+ provides native
// fetch which would cause real network errors in test; we always override).
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
		// GET /api/rail
		if (url.includes("/api/rail")) {
			return {
				ok: true,
				json: async () => ({ bets: [], blockers: [], cost: null }),
			} as unknown as Response;
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
	it("renders the shell layout with four regions", async () => {
		renderShell();
		await waitFor(() => {
			// IconRail
			expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
			// Main content area
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
			// Outlet content
			expect(screen.getByText("Test Page Content")).toBeInTheDocument();
		});
	});

	it("shows the Conversations submenu title", async () => {
		// L8: the legacy static "Review Queue" + "Chat" NavItems are removed.
		// The submenu now renders a live thread list (covered by
		// AppShell.threads.test.tsx); here we only assert the title bar.
		renderShell("/conversations");
		await waitFor(() => {
			expect(screen.getByText("Conversations")).toBeInTheDocument();
		});
	});

	it("switches views when clicking IconRail buttons", async () => {
		const user = userEvent.setup();
		renderShell("/conversations");

		await waitFor(() => {
			expect(screen.getByText("Test Page Content")).toBeInTheDocument();
		});

		// Click Work view button
		const workButton = screen.getByRole("button", { name: /work/i });
		await user.click(workButton);

		await waitFor(() => {
			expect(screen.getByText("Portfolio Page")).toBeInTheDocument();
		});
	});

	it("opens settings panel when avatar is clicked", async () => {
		const user = userEvent.setup();
		renderShell("/conversations");

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /user profile/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /user profile/i }));

		// P4: SettingsPanel modal removed. Settings overlay is now a shell-state
		// content swap — Submenu shows "Settings" heading + 7 section nav items.
		await waitFor(() => {
			expect(screen.getByText("Settings")).toBeInTheDocument();
		});
	});

	it("shows the Rail with active bets and blockers", async () => {
		renderShell();
		await waitFor(() => {
			expect(screen.getByText("Active Bets")).toBeInTheDocument();
			expect(screen.getByText("Blockers")).toBeInTheDocument();
			expect(screen.getByText("Cost")).toBeInTheDocument();
		});
	});

	describe("responsive live updates (Arch M4)", () => {
		// Helper to drive window.innerWidth + dispatch resize.
		function setViewport(width: number): void {
			Object.defineProperty(window, "innerWidth", {
				configurable: true,
				writable: true,
				value: width,
			});
			window.dispatchEvent(new Event("resize"));
		}

		it("re-collapses Submenu live when the viewport shrinks below 1024px", async () => {
			// L8: the legacy "Review Queue" NavItem is gone. Use the filter
			// chips tablist (rendered only when Submenu is expanded — see
			// Submenu.tsx) as the visibility probe.
			setViewport(1920);
			renderShell();
			await waitFor(() => {
				expect(screen.getByRole("tablist", { name: /Filter Conversations/i })).toBeInTheDocument();
			});
			setViewport(800);
			await waitFor(() => {
				expect(
					screen.queryByRole("tablist", { name: /Filter Conversations/i }),
				).not.toBeInTheDocument();
			});
			setViewport(1920);
		});
	});

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

		it('changing density to "compact" via SettingsAppearance updates data-density on the shell root', async () => {
			const user = userEvent.setup();
			const { container } = renderShell("/conversations");

			// Open settings via avatar button.
			await waitFor(() => {
				expect(screen.getByRole("button", { name: /user profile/i })).toBeInTheDocument();
			});
			await user.click(screen.getByRole("button", { name: /user profile/i }));

			// P4: navigate to Appearance section in new settings overlay.
			await waitFor(() => {
				expect(screen.getByText("Appearance")).toBeInTheDocument();
			});
			// Click the Appearance NavItem in the settings Submenu
			await user.click(screen.getByText("Appearance"));

			// Pick Compact density in the SettingsAppearance select
			await waitFor(() => {
				expect(screen.getByLabelText("Density")).toBeInTheDocument();
			});
			const densitySelect = screen.getByLabelText("Density");
			await user.selectOptions(densitySelect, "compact");

			// After selecting, the shell root's data-density should reflect the new value.
			await waitFor(() => {
				const root = getDensityRoot(container);
				expect(root?.getAttribute("data-density")).toBe("compact");
			});
		});

		it('changing density to "comfortable" via SettingsAppearance updates data-density to comfortable', async () => {
			const user = userEvent.setup();
			const { container } = renderShell("/conversations");

			await waitFor(() => {
				expect(screen.getByRole("button", { name: /user profile/i })).toBeInTheDocument();
			});
			await user.click(screen.getByRole("button", { name: /user profile/i }));

			// P4: navigate to Appearance section in new settings overlay.
			await waitFor(() => {
				expect(screen.getByText("Appearance")).toBeInTheDocument();
			});
			await user.click(screen.getByText("Appearance"));

			await waitFor(() => {
				expect(screen.getByLabelText("Density")).toBeInTheDocument();
			});
			const densitySelect = screen.getByLabelText("Density");
			await user.selectOptions(densitySelect, "comfortable");

			await waitFor(() => {
				const root = getDensityRoot(container);
				expect(root?.getAttribute("data-density")).toBe("comfortable");
			});
		});
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
