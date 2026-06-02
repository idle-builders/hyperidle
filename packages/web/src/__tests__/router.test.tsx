import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

/**
 * @lore We cannot import the pre-built `router` (it uses createBrowserRouter)
 * because jsdom has no real History API. Instead we reconstruct routes using
 * createMemoryRouter with the same route config for testability.
 *
 * @lore L9: ConversationsReview and ConversationsChat are replaced by the
 * single Conversations page. The route table now has /conversations and
 * /conversations/:threadId.
 */

// Import page components directly to build test routes
import { Navigate } from "react-router-dom";
import { AppShell } from "../layouts/AppShell";
import { Conversations } from "../pages/Conversations";
import { KnowledgeDetail } from "../pages/KnowledgeDetail";
import { KnowledgeList } from "../pages/KnowledgeList";
import { NotFound } from "../pages/NotFound";
import { WorkBet } from "../pages/WorkBet";
import { WorkPortfolio } from "../pages/WorkPortfolio";

function renderRoute(initialPath: string): ReturnType<typeof render> {
	// Stub fetch so AppShell and Conversations can mount without network.
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({
			ok: true,
			json: async () => ({ threads: [], nextCursor: null }),
			status: 200,
		})),
	);

	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					// L9: canonical conversation routes.
					{ path: "conversations", element: <Conversations /> },
					{ path: "conversations/:threadId", element: <Conversations /> },
					{ path: "work/portfolio", element: <WorkPortfolio /> },
					// L13: WorkTeam deleted; /work/team now redirects to /work/portfolio
					{
						path: "work/team",
						element: <Navigate to="/work/portfolio" replace />,
					},
					{ path: "work/bet/:betId", element: <WorkBet /> },
					{ path: "knowledge", element: <KnowledgeList /> },
					{ path: "knowledge/:knowledgeId", element: <KnowledgeDetail /> },
					{ path: "*", element: <NotFound /> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);

	return render(<RouterProvider router={router} />);
}

describe("Router (L9)", () => {
	it("renders Conversations page at /conversations (queue — no thread selected)", async () => {
		// @lore U6: State A is now the thread list with header + ThreadSections.
		// @lore W3: The FilterPillBar was replaced by a header + toggle chips in ThreadSections.
		renderRoute("/conversations");
		await waitFor(() => {
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});
		// The conversations page renders inside main-content — look for the page wrapper
		await waitFor(() => {
			expect(screen.getByTestId("conversations-page")).toBeInTheDocument();
		});
	});

	it("renders Conversations page at /conversations/:threadId (detail state — fetch loading)", async () => {
		// The fetch is stubbed to return threads list (no detail), so the page
		// renders the loading state briefly, then the not-found state (since
		// the thread-detail endpoint returns empty thread list body).
		renderRoute("/conversations/t-test-router");
		await waitFor(() => {
			// conversations-page appears multiple times (outer Conversations wrapper +
			// ConversationsDetail inner wrapper) — use getAllByTestId to avoid the
			// "multiple elements" error that getByTestId throws.
			const pages = screen.getAllByTestId("conversations-page");
			expect(pages.length).toBeGreaterThan(0);
		});
	});

	it("renders WorkPortfolio page at /work/portfolio", async () => {
		renderRoute("/work/portfolio");
		await waitFor(() => {
			expect(screen.getByTestId("work-portfolio-page")).toBeInTheDocument();
		});
	});

	it("L13: /work/team redirects to /work/portfolio", async () => {
		renderRoute("/work/team");
		await waitFor(() => {
			// WorkTeam is deleted in L13; the route redirects to portfolio
			expect(screen.getByTestId("work-portfolio-page")).toBeInTheDocument();
		});
	});

	it("renders WorkBet page at /work/bet/:betId", async () => {
		renderRoute("/work/bet/b1");
		await waitFor(() => {
			expect(screen.getByTestId("work-bet-page")).toBeInTheDocument();
		});
	});

	it("renders KnowledgeList page at /knowledge", async () => {
		renderRoute("/knowledge");
		await waitFor(() => {
			expect(screen.getByTestId("knowledge-list-page")).toBeInTheDocument();
		});
	});

	it("renders KnowledgeDetail page at /knowledge/:knowledgeId", async () => {
		renderRoute("/knowledge/k1");
		await waitFor(() => {
			expect(screen.getByTestId("knowledge-detail-page")).toBeInTheDocument();
		});
	});

	it("shell layout has Sidebar and main content area", async () => {
		// @lore U6: IconRail | Submenu | Rail replaced by a single Sidebar.
		// The layout is now Sidebar (200px) | Main (flex-1).
		renderRoute("/conversations");
		await waitFor(() => {
			// Sidebar renders as aside[data-ds-shell="Sidebar"] with role navigation
			expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
			expect(screen.getByTestId("main-content")).toBeInTheDocument();
		});
	});

	it("renders NotFound for unknown URL (/no-such-route)", async () => {
		// I4 E2: catch-all `*` route must render NotFound — not a blank page.
		renderRoute("/no-such-route");
		await waitFor(() => {
			expect(screen.getByText(/page not found/i)).toBeInTheDocument();
		});
	});

	it("NotFound page provides a Go home affordance", async () => {
		renderRoute("/another-bogus-path");
		await waitFor(() => {
			// Either a link or button labelled with some return-home variant.
			const byLink = screen.queryByRole("link", { name: /home|back|dashboard/i });
			const byButton = screen.queryByRole("button", { name: /home|back|dashboard/i });
			expect(byLink ?? byButton).not.toBeNull();
		});
	});
});
