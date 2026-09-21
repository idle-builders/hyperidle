import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// AD9: mock useTeams so WorkOverview renders the 2-team list (not a 1-team redirect)
vi.mock("../hooks/useTeams", () => ({
	useTeams: () => ({
		data: {
			teams: [
				{
					id: "t1",
					name: "Alpha",
					status: "healthy",
					tasksInProgress: 2,
					phase: "build",
					leadAgentId: null,
					tasksDone: 0,
					shipRate: "—",
					progress: { done: 0, total: 0 },
					routineCount: 0,
					agentCount: 0,
				},
				{
					id: "t2",
					name: "Beta",
					status: "behind",
					tasksInProgress: 0,
					phase: "build",
					leadAgentId: null,
					tasksDone: 0,
					shipRate: "—",
					progress: { done: 0, total: 0 },
					routineCount: 0,
					agentCount: 0,
				},
			],
		},
		loading: false,
		error: null,
	}),
}));

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
import { DocumentDetail } from "../pages/DocumentDetail";
import { DocumentList } from "../pages/DocumentList";
import { NotFound } from "../pages/NotFound";
// AD9: WorkPortfolio retired; WorkOverview is the new /work route
import { WorkOverview } from "../pages/WorkOverview";
import { WorkTaskPage } from "../pages/WorkTaskPage";

afterEach(() => {
	vi.restoreAllMocks();
});

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
					// AD9: /work is the new overview; /work/portfolio → redirect to /work
					{ path: "work", element: <WorkOverview /> },
					{
						path: "work/portfolio",
						element: <Navigate to="/work" replace />,
					},
					{ path: "work/task/:taskId", element: <WorkTaskPage /> },
					{ path: "documents", element: <DocumentList /> },
					{ path: "documents/:documentId", element: <DocumentDetail /> },
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

	// AD9: /work renders WorkOverview
	it("renders WorkOverview page at /work", async () => {
		renderRoute("/work");
		await waitFor(() => {
			expect(screen.getByTestId("work-overview-page")).toBeInTheDocument();
		});
	});

	// AD9: /work/portfolio redirects to /work
	it("AD9: /work/portfolio redirects to /work (WorkOverview)", async () => {
		renderRoute("/work/portfolio");
		await waitFor(() => {
			expect(screen.getByTestId("work-overview-page")).toBeInTheDocument();
		});
	});

	// @lore BB1: /work/bet/:betId replaced by /work/task/:taskId
	it("renders WorkTaskPage at /work/task/:taskId", async () => {
		renderRoute("/work/task/t1");
		await waitFor(() => {
			// WorkTaskPage shows loading or task-page-not-found (no live API) — both are valid
			const el =
				document.querySelector("[data-testid='task-detail-page']") ??
				document.querySelector("[data-testid='task-page-loading']") ??
				document.querySelector("[data-testid='task-page-error']") ??
				document.querySelector("[data-testid='task-page-not-found']");
			expect(el).not.toBeNull();
		});
	});

	it("renders DocumentList page at /documents", async () => {
		renderRoute("/documents");
		await waitFor(() => {
			expect(screen.getByTestId("knowledge-list-page")).toBeInTheDocument();
		});
	});

	it("renders DocumentDetail page at /documents/:documentId", async () => {
		// The stubbed fetch (thread-shaped, not an ActionResult) resolves this
		// to the error state rather than "not found" — either is a valid render
		// of the real route, unlike WorkTaskPage's own multi-state check above.
		renderRoute("/documents/k1");
		await waitFor(() => {
			const el =
				document.querySelector("[data-testid='document-detail-page']") ??
				document.querySelector("[data-testid='document-page-error']");
			expect(el).not.toBeNull();
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
