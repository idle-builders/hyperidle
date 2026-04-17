import type { JSX } from "react";
/**
 * @lore React Router v7 uses createBrowserRouter + RouterProvider pattern.
 * All routes are nested under AppShell layout which provides IconRail | Submenu | Main | Rail.
 * The index route redirects to /conversations/review as the default landing page.
 */
import { Navigate, createBrowserRouter } from "react-router-dom";
import { RouterProvider } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { ConversationsChat } from "./pages/ConversationsChat";
import { ConversationsReview } from "./pages/ConversationsReview";
import { KnowledgeDetail } from "./pages/KnowledgeDetail";
import { KnowledgeList } from "./pages/KnowledgeList";
import { WorkBet } from "./pages/WorkBet";
import { WorkPortfolio } from "./pages/WorkPortfolio";
import { WorkTeam } from "./pages/WorkTeam";

export const router = createBrowserRouter([
	{
		path: "/",
		element: <AppShell />,
		children: [
			{ index: true, element: <Navigate to="/conversations/review" replace /> },
			{ path: "conversations/review", element: <ConversationsReview /> },
			{ path: "conversations/chat", element: <ConversationsChat /> },
			{ path: "work/portfolio", element: <WorkPortfolio /> },
			{ path: "work/team", element: <WorkTeam /> },
			{ path: "work/bet/:betId", element: <WorkBet /> },
			{ path: "knowledge", element: <KnowledgeList /> },
			{ path: "knowledge/:knowledgeId", element: <KnowledgeDetail /> },
		],
	},
]);

export function AppRouter(): JSX.Element {
	return <RouterProvider router={router} />;
}
