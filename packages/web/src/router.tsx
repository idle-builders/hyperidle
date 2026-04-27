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
import { FirstRunGate } from "./layouts/FirstRunGate";
import { ConversationsChat } from "./pages/ConversationsChat";
import { ConversationsReview } from "./pages/ConversationsReview";
import { FirstRunFlow } from "./pages/FirstRunFlow";
import { KnowledgeDetail } from "./pages/KnowledgeDetail";
import { KnowledgeList } from "./pages/KnowledgeList";
import { NotFound } from "./pages/NotFound";
import { WorkBet } from "./pages/WorkBet";
import { WorkPortfolio } from "./pages/WorkPortfolio";
import { WorkTeam } from "./pages/WorkTeam";

function buildRoutes(): RouteObject[] {
	const routes: RouteObject[] = [
		// L10: /first-run sits as a sibling of <AppShell /> so first-run is
		// a dedicated full-screen flow (no rail/submenu chrome). The gate
		// at "/" redirects here when first-run isn't complete.
		{ path: "/first-run", element: <FirstRunFlow /> },
		{
			path: "/",
			element: (
				<FirstRunGate>
					<AppShell />
				</FirstRunGate>
			),
			children: [
				{ index: true, element: <Navigate to="/conversations/review" replace /> },
				{ path: "conversations/review", element: <ConversationsReview /> },
				{ path: "conversations/chat", element: <ConversationsChat /> },
				{ path: "work/portfolio", element: <WorkPortfolio /> },
				{ path: "work/team", element: <WorkTeam /> },
				{ path: "work/bet/:betId", element: <WorkBet /> },
				{ path: "knowledge", element: <KnowledgeList /> },
				{ path: "knowledge/:knowledgeId", element: <KnowledgeDetail /> },
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
	}

	return routes;
}

export const router = createBrowserRouter(buildRoutes());

export function AppRouter(): JSX.Element {
	return <RouterProvider router={router} />;
}
