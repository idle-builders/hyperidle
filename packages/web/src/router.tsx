import type { JSX } from "react";
import type { RouteObject } from "react-router-dom";
/**
 * @lore React Router v7 uses createBrowserRouter + RouterProvider pattern.
 * All routes are nested under AppShell layout which provides IconRail | Submenu | Main | Rail.
 * The index route redirects to /conversations (queue) as the default landing page.
 *
 * @lore L9: /conversations/review and /conversations/chat are legacy routes;
 * they now mount RedirectLegacyConversation which redirects to the canonical
 * /conversations or /conversations/:threadId shape. See plans/L9/architecture.md §3.
 *
 * @lore I6: /designsystem is integrated into the React Router tree (DEV only)
 * instead of being routed via window.location.pathname in App.tsx.
 */
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { ArtifactPermalink } from "./pages/ArtifactPermalink";
import { Conversations } from "./pages/Conversations";
import { FirstRunRedirect } from "./pages/FirstRunRedirect";
import { KnowledgeDetail } from "./pages/KnowledgeDetail";
import { KnowledgeList } from "./pages/KnowledgeList";
import { NotFound } from "./pages/NotFound";
import { Onboarding } from "./pages/Onboarding";
import { RedirectLegacyConversation } from "./pages/RedirectLegacyConversation";
import { WorkBet } from "./pages/WorkBet";
import { WorkPortfolio } from "./pages/WorkPortfolio";
import { WorkProduct } from "./pages/WorkProduct";

function buildRoutes(): RouteObject[] {
	const routes: RouteObject[] = [
		{
			path: "/onboarding",
			element: <Onboarding />,
		},
		{
			path: "/",
			element: <AppShell />,
			children: [
				{ index: true, element: <FirstRunRedirect /> },
				// Canonical conversation routes.
				{ path: "conversations", element: <Conversations /> },
				{ path: "conversations/:threadId", element: <Conversations /> },
				// Legacy redirects — preserve user-facing history via replace:true.
				// @lore L9: RedirectLegacyConversation reads the legacy query param
				// (?id= or ?thread=), trims whitespace, and redirects to the canonical
				// /conversations/:threadId or /conversations (queue). This handles all
				// four legacy URL shapes: review/chat × no-id/with-id.
				{
					path: "conversations/review",
					element: <RedirectLegacyConversation paramName="id" />,
				},
				{
					path: "conversations/chat",
					element: <RedirectLegacyConversation paramName="thread" />,
				},
				{ path: "work/portfolio", element: <WorkPortfolio /> },
				// L13: New product drill-down route
				{ path: "work/product/:productId", element: <WorkProduct /> },
				// L13: Legacy /work/team redirects to /work/portfolio (WorkTeam deleted)
				{
					path: "work/team",
					element: <Navigate to="/work/portfolio" replace />,
				},
				{ path: "work/bet/:betId", element: <WorkBet /> },
				{ path: "knowledge", element: <KnowledgeList /> },
				{ path: "knowledge/:knowledgeId", element: <KnowledgeDetail /> },
				// L3 review fix Arch-M1 / D-M4: wire the ArtifactPermalink page.
				{ path: "artifacts/:id", element: <ArtifactPermalink /> },
				{
					path: "settings",
					// L9: settings deep-link now points to /conversations?settings=open.
					element: <Navigate to="/conversations?settings=open" replace />,
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
