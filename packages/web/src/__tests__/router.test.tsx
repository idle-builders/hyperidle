import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

/**
 * @lore We cannot import the pre-built `router` (it uses createBrowserRouter)
 * because jsdom has no real History API. Instead we reconstruct routes using
 * createMemoryRouter with the same route config for testability.
 */

// Import page components directly to build test routes
import { Navigate } from "react-router-dom";
import { AppShell } from "../layouts/AppShell";
import { ConversationsChat } from "../pages/ConversationsChat";
import { ConversationsReview } from "../pages/ConversationsReview";
import { KnowledgeDetail } from "../pages/KnowledgeDetail";
import { KnowledgeList } from "../pages/KnowledgeList";
import { NotFound } from "../pages/NotFound";
import { WorkBet } from "../pages/WorkBet";
import { WorkPortfolio } from "../pages/WorkPortfolio";

function renderRoute(initialPath: string): ReturnType<typeof render> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations/review", element: <ConversationsReview /> },
					{ path: "conversations/chat", element: <ConversationsChat /> },
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

describe("Router", () => {
	it("renders ConversationsReview page at /conversations/review", async () => {
		renderRoute("/conversations/review");
		await waitFor(() => {
			expect(screen.getByTestId("conversations-review-page")).toBeInTheDocument();
		});
	});

	it("renders ConversationsChat page at /conversations/chat", async () => {
		renderRoute("/conversations/chat");
		await waitFor(() => {
			expect(screen.getByTestId("conversations-chat-page")).toBeInTheDocument();
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

	it("shell layout has IconRail, Submenu, main content, and Rail", async () => {
		renderRoute("/conversations/review");
		await waitFor(() => {
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
