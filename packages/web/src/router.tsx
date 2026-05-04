import type { JSX } from "react";
import type { RouteObject } from "react-router-dom";
/**
 * @lore React Router v7 uses createBrowserRouter + RouterProvider pattern.
 * All routes are nested under AppShell layout which provides IconRail | Submenu | Main | Rail.
 * The index route redirects to /conversations/review as the default landing page.
 *
 * @lore I6: /designsystem is integrated into the React Router tree (DEV only)
 * instead of being routed via window.location.pathname in App.tsx.
 */
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { ArtifactPermalink } from "./pages/ArtifactPermalink";
import { ConversationsChat } from "./pages/ConversationsChat";
import { ConversationsReview } from "./pages/ConversationsReview";
import { KnowledgeDetail } from "./pages/KnowledgeDetail";
import { KnowledgeList } from "./pages/KnowledgeList";
import { NotFound } from "./pages/NotFound";
import { WorkBet } from "./pages/WorkBet";
import { WorkPortfolio } from "./pages/WorkPortfolio";
import { WorkTeam } from "./pages/WorkTeam";
import { WorkTeamTaskThread } from "./pages/WorkTeamTaskThread";

function buildRoutes(): RouteObject[] {
	const routes: RouteObject[] = [
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
				{ path: "work/team/task/:taskId/thread", element: <WorkTeamTaskThread /> },
				{ path: "knowledge", element: <KnowledgeList /> },
				{ path: "knowledge/:knowledgeId", element: <KnowledgeDetail /> },
				// L3 review fix Arch-M1 / D-M4: wire the ArtifactPermalink page.
				{ path: "artifacts/:id", element: <ArtifactPermalink /> },
				{
					path: "settings",
					element: <Navigate to="/conversations/review?settings=open" replace />,
				},
				// I4 E2: catch-all so unknown URLs render NotFound (not a blank page).
				{ path: "*", element: <NotFound /> },
			],
		},
	];

	// I6: /designsystem route integrated into React Router (DEV only).
	// Lazy-loaded to avoid bundling the component explorer in production.
	if (import.meta.env.DEV) {
		routes.push({
			path: "/designsystem",
			lazy: async () => {
				const { DesignSystem } = await import("./designsystem/DesignSystem.js");
				// biome-ignore lint/style/useNamingConvention: React Router lazy() API requires PascalCase Component key
				return { Component: DesignSystem };
			},
		});
		// L3 throwaway: AC-10 evidence surface; permanent mounts ship in L11/L12.
		routes.push({
			path: "/_dev/artifacts",
			lazy: async () => {
				const { ArtifactDemo } = await import("./pages/_dev/ArtifactDemo.js");
				// biome-ignore lint/style/useNamingConvention: React Router lazy() API requires PascalCase Component key
				return { Component: ArtifactDemo };
			},
		});
	}

	return routes;
}

export const router = createBrowserRouter(buildRoutes());

export function AppRouter(): JSX.Element {
	return <RouterProvider router={router} />;
}
