import type { JSX } from "react";
import type { RouteObject } from "react-router-dom";
import { createBrowserRouter, Navigate, RouterProvider, useParams } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { AgentProfile } from "./pages/AgentProfile";
import { Conversations } from "./pages/Conversations";
import { DocumentCreate } from "./pages/DocumentCreate";
import { DocumentDetail } from "./pages/DocumentDetail";
import { DocumentList } from "./pages/DocumentList";
import { FirstRunRedirect } from "./pages/FirstRunRedirect";
import { NotFound } from "./pages/NotFound";
import { RedirectLegacyConversation } from "./pages/RedirectLegacyConversation";
import { ReviewPage } from "./pages/review/ReviewPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupFlow } from "./pages/SetupFlow";
import { WorkOverview } from "./pages/WorkOverview";
import { WorkTaskCreate } from "./pages/WorkTaskCreate";
import { WorkTaskPage } from "./pages/WorkTaskPage";
import { WorkTeam } from "./pages/WorkTeam";

// @lore: RedirectProductToTeam — Navigate can't forward route params (to prop is a string literal); wrapper reads productId and redirects
function RedirectProductToTeam(): JSX.Element {
	const { productId } = useParams<{ productId: string }>();
	if (!productId) return <Navigate to="/work" replace />;
	return <Navigate to={`/work/team/${productId}`} replace />;
}

export function buildRoutes(): RouteObject[] {
	const routes: RouteObject[] = [
		{
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
				{
					path: "conversations/review",
					element: <RedirectLegacyConversation paramName="id" />,
				},
				{
					path: "conversations/chat",
					element: <RedirectLegacyConversation paramName="thread" />,
				},
				// New canonical Work overview at /work; /work/portfolio redirects here.
				// WorkOverview handles the 1-team short-circuit (→ /work/team/:id) internally.
				{ path: "work", element: <WorkOverview /> },
				// /work/portfolio → /work (graceful redirect for bookmarks/external links).
				// The team-count branch lives in WorkOverview, not here — unconditional redirect.
				{ path: "work/portfolio", element: <Navigate to="/work" replace /> },
				{ path: "work/team/:teamId", element: <WorkTeam /> },
				{ path: "work/product/:productId", element: <RedirectProductToTeam /> },
				{ path: "work/task/new", element: <WorkTaskCreate /> },
				{ path: "work/task/:taskId", element: <WorkTaskPage /> },
				// Flattened from `work/bet/:betId/review/:reviewId` — the loader
				// now names the review's own thread directly, so the route needs
				// no bet. Deleted rather than redirected: no persisted row holds
				// the old shape (CLAUDE.md's absolute rule 2 forbids a compat
				// shim with nothing to bridge).
				{ path: "reviews/:reviewId", element: <ReviewPage /> },
				{ path: "agents/:agentId", element: <AgentProfile /> },
				{ path: "documents", element: <DocumentList /> },
				{ path: "documents/new", element: <DocumentCreate /> },
				{ path: "documents/:documentId", element: <DocumentDetail /> },
				{ path: "settings", element: <SettingsPage /> },
			],
		},
		// I4 E2: catch-all so unknown URLs render NotFound (not a blank page).
		// Rendered outside AppShell per error-states.html mockup (standalone page, no sidebar).
		{ path: "*", element: <NotFound /> },
	];

	return routes;
}

export const router = createBrowserRouter(buildRoutes());

export function AppRouter(): JSX.Element {
	return <RouterProvider router={router} />;
}
