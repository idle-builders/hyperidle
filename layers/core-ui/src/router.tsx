import type { JSX } from "react";
import type { RouteObject } from "react-router-dom";
/**
 * @lore React Router v7 uses createBrowserRouter + RouterProvider pattern.
 * All routes are nested under AppShell layout which provides Sidebar | Main.
 * The index route redirects to /conversations (queue) as the default landing page.
 *
 * @lore L9: /conversations/review and /conversations/chat are legacy routes;
 * they now mount RedirectLegacyConversation which redirects to the canonical
 * /conversations or /conversations/:threadId shape.
 */
import { createBrowserRouter, Navigate, RouterProvider, useParams } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { AgentProfile } from "./pages/AgentProfile";
import { ArtifactPermalink } from "./pages/ArtifactPermalink";
import { Conversations } from "./pages/Conversations";
import { FirstRunRedirect } from "./pages/FirstRunRedirect";
import { KnowledgeCreate } from "./pages/KnowledgeCreate";
import { KnowledgeDetail } from "./pages/KnowledgeDetail";
import { KnowledgeList } from "./pages/KnowledgeList";
import { NotFound } from "./pages/NotFound";
import { RedirectLegacyConversation } from "./pages/RedirectLegacyConversation";
import { ReviewPage } from "./pages/review/ReviewPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupFlow } from "./pages/SetupFlow";
import { WorkBet } from "./pages/WorkBet";
import { WorkBetCreate } from "./pages/WorkBetCreate";
import { WorkOverview } from "./pages/WorkOverview";
import { WorkRoutine } from "./pages/WorkRoutine";
import { WorkTask } from "./pages/WorkTask";
import { WorkTeam } from "./pages/WorkTeam";

/**
 * @lore U6: React Router's Navigate element cannot forward route params directly
 * (Navigate's `to` prop is a string literal, not a pattern). This wrapper reads
 * the old `productId` param and redirects to the new `/work/team/:teamId` path.
 */
function RedirectProductToTeam(): JSX.Element {
	const { productId } = useParams<{ productId: string }>();
	// Z8-147: empty productId → /work/team/ matches no route. Redirect to Work overview.
	// AD9: was /work/portfolio; now /work (WorkOverview handles 1-team short-circuit).
	if (!productId) return <Navigate to="/work" replace />;
	return <Navigate to={`/work/team/${productId}`} replace />;
}

function buildRoutes(): RouteObject[] {
	const routes: RouteObject[] = [
		{
			// P4: /setup replaces /onboarding. SetupFlow is the initial setup page.
			path: "/setup",
			element: <SetupFlow />,
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
				// AD9: New canonical Work overview at /work; /work/portfolio redirects here.
				// WorkOverview handles the 1-team short-circuit (→ /work/team/:id) internally.
				{ path: "work", element: <WorkOverview /> },
				// AD9: /work/portfolio → /work (graceful redirect for bookmarks/external links).
				// The team-count branch lives in WorkOverview, not here — unconditional redirect.
				{ path: "work/portfolio", element: <Navigate to="/work" replace /> },
				// @lore U6: Route renamed from work/product/:productId to work/team/:teamId.
				// Old path redirects via RedirectProductToTeam wrapper (Navigate cannot
				// forward params directly in React Router v7).
				{ path: "work/team/:teamId", element: <WorkTeam /> },
				{ path: "work/product/:productId", element: <RedirectProductToTeam /> },
				{ path: "work/routine/:routineId", element: <WorkRoutine /> },
				{ path: "work/bet/new", element: <WorkBetCreate /> },
				{ path: "work/bet/:betId", element: <WorkBet /> },
				{ path: "work/bet/:betId/task/:taskId", element: <WorkTask /> },
				// Flattened from `work/bet/:betId/review/:reviewId` — the loader
				// now names the review's own thread directly, so the route needs
				// no bet. Deleted rather than redirected: no persisted row holds
				// the old shape (CLAUDE.md's absolute rule 2 forbids a compat
				// shim with nothing to bridge).
				{ path: "reviews/:reviewId", element: <ReviewPage /> },
				{ path: "agents/:agentId", element: <AgentProfile /> },
				{ path: "knowledge", element: <KnowledgeList /> },
				{ path: "knowledge/new", element: <KnowledgeCreate /> },
				{ path: "knowledge/:knowledgeId", element: <KnowledgeDetail /> },
				// L3 review fix Arch-M1 / D-M4: wire the ArtifactPermalink page.
				{ path: "artifacts/:id", element: <ArtifactPermalink /> },
				// @lore FR-18: /settings is now a real route (was ?settings=open overlay).
				// Sidebar marks the settings button active when pathname starts with /settings.
				{ path: "settings", element: <SettingsPage /> },
			],
		},
		// I4 E2: catch-all so unknown URLs render NotFound (not a blank page).
		// Rendered outside AppShell per error-states.html mockup (standalone page, no sidebar).
		{ path: "*", element: <NotFound /> },
	];

	if (import.meta.env.DEV) {
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
