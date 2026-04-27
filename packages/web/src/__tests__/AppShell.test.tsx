import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";

function renderShell(
	initialPath = "/conversations/review",
	childContent = "Test Page Content",
): ReturnType<typeof render> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations/review", element: <div>{childContent}</div> },
					{ path: "conversations/chat", element: <div>Chat Page</div> },
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

	it("shows the L3 Conversations submenu when on conversations route", async () => {
		renderShell("/conversations/review");
		await waitFor(() => {
			// L3 replaced the J2 NavItems ("Review Queue" / "Chat") with the
			// section-grouped queue. The submenu now renders a single
			// `conversations-submenu` testid wrapping section headers.
			expect(screen.getByTestId("conversations-submenu")).toBeInTheDocument();
			// Canonical section headers are present even when empty.
			const headers = screen.getAllByTestId("section-header").map((h) => h.textContent ?? "");
			expect(headers[0]).toMatch(/^Pinned/i);
			expect(headers[1]).toMatch(/^Blocking/i);
			expect(headers[2]).toMatch(/^Reviews/i);
		});
	});

	it("navigates via the IconRail when switching between top-level views", async () => {
		const user = userEvent.setup();
		renderShell("/conversations/review");

		await waitFor(() => {
			expect(screen.getByText("Test Page Content")).toBeInTheDocument();
		});

		// L3: thread navigation now happens via the section-grouped list
		// (clicking a row or pressing Enter). The IconRail still routes
		// between top-level views; this asserts that path stays intact.
		const workButton = screen.getByRole("button", { name: /work/i });
		await user.click(workButton);

		await waitFor(() => {
			expect(screen.getByText("Portfolio Page")).toBeInTheDocument();
		});
	});

	it("switches views when clicking IconRail buttons", async () => {
		const user = userEvent.setup();
		renderShell("/conversations/review");

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
		renderShell("/conversations/review");

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /user profile/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /user profile/i }));

		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: /settings/i })).toBeInTheDocument();
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
			// Start at 1920 (wide — submenu expanded; section headers visible).
			setViewport(1920);
			renderShell();
			await waitFor(() => {
				expect(screen.getByTestId("conversations-submenu")).toBeInTheDocument();
			});
			// Shrink to 800px — Submenu collapses, its children stop rendering.
			setViewport(800);
			await waitFor(() => {
				expect(screen.queryByTestId("conversations-submenu")).not.toBeInTheDocument();
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

		it('changing density to "compact" via SettingsPanel updates data-density on the shell root', async () => {
			const user = userEvent.setup();
			const { container } = renderShell("/conversations/review");

			// Open settings via avatar button.
			await waitFor(() => {
				expect(screen.getByRole("button", { name: /user profile/i })).toBeInTheDocument();
			});
			await user.click(screen.getByRole("button", { name: /user profile/i }));

			// Switch to Appearance tab and pick Compact, then save.
			await waitFor(() => {
				expect(screen.getByRole("dialog", { name: /settings/i })).toBeInTheDocument();
			});
			await user.click(screen.getByRole("tab", { name: "Appearance" }));
			const densitySelect = screen.getByLabelText("Density");
			await user.selectOptions(densitySelect, "compact");
			await user.click(screen.getByRole("button", { name: /save/i }));

			// After save, the shell root's data-density should reflect the new
			// value. Save closes the panel; we wait for that side-effect.
			await waitFor(() => {
				expect(screen.queryByRole("dialog", { name: /settings/i })).not.toBeInTheDocument();
			});
			await waitFor(() => {
				const root = getDensityRoot(container);
				expect(root?.getAttribute("data-density")).toBe("compact");
			});
		});

		it('changing density to "comfortable" via SettingsPanel updates data-density to comfortable', async () => {
			const user = userEvent.setup();
			const { container } = renderShell("/conversations/review");

			await waitFor(() => {
				expect(screen.getByRole("button", { name: /user profile/i })).toBeInTheDocument();
			});
			await user.click(screen.getByRole("button", { name: /user profile/i }));
			await user.click(screen.getByRole("tab", { name: "Appearance" }));

			const densitySelect = screen.getByLabelText("Density");
			await user.selectOptions(densitySelect, "comfortable");
			await user.click(screen.getByRole("button", { name: /save/i }));

			await waitFor(() => {
				expect(screen.queryByRole("dialog", { name: /settings/i })).not.toBeInTheDocument();
			});
			await waitFor(() => {
				const root = getDensityRoot(container);
				expect(root?.getAttribute("data-density")).toBe("comfortable");
			});
		});
	});

	describe("global search navigation by type", () => {
		// I4 N1: `handleSearchNavigate` must route by result type.
		// Fixture routes added so we can observe where navigation lands.
		function renderShellWithProbes(initialPath = "/conversations/review"): {
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
							{ path: "conversations/review", element: <div>Review Queue Page</div> },
							{ path: "conversations/chat", element: <div>Chat Page</div> },
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
								product: "HyperIdle",
								status: "committed",
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

		it("navigates conversation result to /conversations/review", async () => {
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
				expect(router.state.location.pathname).toBe("/conversations/review");
			});
		});
	});
});
