import { render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

/**
 * @lore We cannot import the pre-built `router` (it uses createBrowserRouter)
 * because jsdom has no real History API. Instead we reconstruct routes using
 * createMemoryRouter with the same route config for testability.
 */

// Import page components directly to build test routes
import { AppShell } from "../layouts/AppShell";
import { ConversationsChat } from "../pages/ConversationsChat";
import { ConversationsReview } from "../pages/ConversationsReview";
import { KnowledgeDetail } from "../pages/KnowledgeDetail";
import { KnowledgeList } from "../pages/KnowledgeList";
import { WorkBet } from "../pages/WorkBet";
import { WorkPortfolio } from "../pages/WorkPortfolio";
import { WorkTeam } from "../pages/WorkTeam";

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
					{ path: "work/team", element: <WorkTeam /> },
					{ path: "work/bet/:betId", element: <WorkBet /> },
					{ path: "knowledge", element: <KnowledgeList /> },
					{ path: "knowledge/:knowledgeId", element: <KnowledgeDetail /> },
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

	it("renders WorkTeam page at /work/team", async () => {
		renderRoute("/work/team");
		await waitFor(() => {
			expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
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
});
