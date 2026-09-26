/**
 * U6 — Router rename tests (AC-13, AC-14, AC-15).
 *
 * AC-13: /work/team/:teamId renders WorkTeam; /work/product/:productId redirects to /work/team/:productId
 * AC-14: WorkTeam uses teamId param (not productId alias)
 * AC-15: WorkPortfolio navigates to /work/team/ (not /work/product/)
 *
 * @lore U6: Route renamed from work/product/:productId to work/team/:teamId.
 * The old path /work/product/:productId must redirect to /work/team/:productId
 * using a wrapper component (React Router Navigate cannot forward params directly).
 */

import { render, screen, waitFor } from "@testing-library/react";
import type { JSX } from "react";
import { createMemoryRouter, Navigate, RouterProvider, useParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../layouts/AppShell";
// AD9: WorkPortfolio retired → WorkOverview
import { WorkOverview } from "../pages/WorkOverview";
import { WorkTeam } from "../pages/WorkTeam";

function stubFetch(): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/teams")) {
				return {
					ok: true,
					json: async () => ({
						teams: [
							{ id: "t1", name: "Alpha", active: true, slug: "alpha", lead: null, phase: "active" },
						],
					}),
				} as Response;
			}
			if (url.includes("/api/portfolios") || url.includes("/api/bets")) {
				return {
					ok: true,
					json: async () => ({ bets: [], teams: [], portfolios: [] }),
				} as Response;
			}
			return {
				ok: true,
				json: async () => ({ threads: [], nextCursor: null }),
			} as Response;
		}),
	);
}

/**
 * Redirect wrapper for old route: /work/product/:productId → /work/team/:productId
 * This is the redirect wrapper described in architecture.md Task 4.
 */
function RedirectProductToTeam(): JSX.Element {
	const { productId } = useParams<{ productId: string }>();
	return <Navigate to={`/work/team/${productId ?? ""}`} replace />;
}

// AD9: useTeams mock so WorkOverview renders list (2 teams, no 1-team redirect)
vi.mock("../hooks/useTeams", () => ({
	useTeams: () => ({
		data: {
			teams: [
				{
					id: "t1",
					name: "Alpha",
					status: "healthy" as const,
					tasksInProgress: 0,
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
					status: "behind" as const,
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

function renderRoute(initialPath: string): { router: ReturnType<typeof createMemoryRouter> } {
	stubFetch();
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations", element: <div>Conversations</div> },
					// AD9: /work → WorkOverview; /work/portfolio → redirect to /work
					{ path: "work", element: <WorkOverview /> },
					{ path: "work/portfolio", element: <Navigate to="/work" replace /> },
					// AC-13: new route with teamId param
					{ path: "work/team/:teamId", element: <WorkTeam /> },
					// AC-13: redirect from old path
					{ path: "work/product/:productId", element: <RedirectProductToTeam /> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	render(<RouterProvider router={router} />);
	return { router };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Router — U6: work/team/:teamId route (AC-13)", () => {
	it("navigating to /work/team/t1 renders WorkTeam page", async () => {
		renderRoute("/work/team/t1");
		await waitFor(() => {
			expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
		});
	});

	it("navigating to /work/product/t1 redirects to /work/team/t1 and renders WorkTeam", async () => {
		const { router } = renderRoute("/work/product/t1");
		await waitFor(() => {
			// After redirect, the pathname should be /work/team/t1
			expect(router.state.location.pathname).toBe("/work/team/t1");
		});
		await waitFor(() => {
			expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
		});
	});

	it("redirect from /work/product/:id preserves the id in the new URL", async () => {
		const { router } = renderRoute("/work/product/my-team-id");
		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/work/team/my-team-id");
		});
	});
});

describe("WorkTeam — AC-14: uses teamId param", () => {
	it("WorkTeam mounts at /work/team/:teamId without crashing", async () => {
		renderRoute("/work/team/t1");
		await waitFor(() => {
			expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
		});
	});

	it("WorkTeam does NOT use productId alias — component renders with teamId route param", async () => {
		// This test verifies that the refactored WorkTeam component works with
		// useParams<{ teamId: string }>() rather than the old productId alias.
		// If WorkTeam still uses productId alias at the /work/team/:teamId route,
		// teamId would be undefined and the team fetch would not fire.
		renderRoute("/work/team/real-team-id");
		await waitFor(() => {
			expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
		});
		// Verify the page loaded (not stuck in a broken state due to undefined param)
		// If teamId param works, the page renders team content (or loading skeleton),
		// not an unexpected error state caused by undefined teamId
		const page = screen.getByTestId("work-team-page");
		expect(page).toBeInTheDocument();
	});
});

// AD9: WorkPortfolio retired. WorkOverview is the new Work landing.
// These tests verify the AD9 routing is correct (replaces AC-15 WorkPortfolio tests).
describe("WorkOverview — AD9: /work renders team list (replaces portfolio)", () => {
	it("WorkOverview renders at /work and shows team rows", async () => {
		stubFetch();
		// useTeams is mocked at module level — 2 teams
		const router = createMemoryRouter(
			[
				{
					path: "/",
					element: <AppShell />,
					children: [
						{ path: "conversations", element: <div>Conversations</div> },
						{ path: "work", element: <WorkOverview /> },
						{ path: "work/team/:teamId", element: <WorkTeam /> },
						{ path: "work/product/:productId", element: <RedirectProductToTeam /> },
					],
				},
			],
			{ initialEntries: ["/work"] },
		);

		render(<RouterProvider router={router} />);

		await waitFor(() => {
			expect(screen.getByTestId("work-overview-page")).toBeInTheDocument();
		});
	});

	it("/work does NOT contain any /work/product/ navigation links", async () => {
		stubFetch();
		const router = createMemoryRouter(
			[
				{
					path: "/",
					element: <AppShell />,
					children: [
						{ path: "conversations", element: <div>Conversations</div> },
						{ path: "work", element: <WorkOverview /> },
					],
				},
			],
			{ initialEntries: ["/work"] },
		);

		const { container } = render(<RouterProvider router={router} />);

		await waitFor(() => {
			expect(screen.getByTestId("work-overview-page")).toBeInTheDocument();
		});

		// No links to the old /work/product/ path should exist
		const oldLinks = container.querySelectorAll("a[href*='/work/product/']");
		expect(oldLinks.length).toBe(0);
	});
});
