/**
 * L13 / AD9 — Router tests for team drill-down route.
 *
 * AD9 migration: /work/portfolio retired → /work overview.
 * L13 redirect /work/team → /work/portfolio is updated to /work/team → /work.
 *
 * AC coverage:
 * - URL /work/product/:productId renders the WorkTeam page (U6 legacy redirect).
 * - URL /work/portfolio redirects to /work (AD9).
 */

import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Navigate, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "../layouts/AppShell";
import { WorkOverview } from "../pages/WorkOverview";
import { WorkTeam } from "../pages/WorkTeam";

// AD9: useTeams needed by WorkOverview — render 2 teams to show the list
vi.mock("../hooks/useTeams", () => ({
	useTeams: () => ({
		data: {
			teams: [
				{
					id: "t1",
					name: "Alpha",
					status: "healthy" as const,
					activeBets: 0,
					phase: "build",
					leadAgentId: null,
					shipped: 0,
					shipRate: "—",
					progress: { done: 0, total: 0 },
					routineCount: 0,
					agentCount: 0,
				},
				{
					id: "t2",
					name: "Beta",
					status: "behind" as const,
					activeBets: 0,
					phase: "build",
					leadAgentId: null,
					shipped: 0,
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

afterEach(() => {
	vi.restoreAllMocks();
});

function stubFetch(): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({
			ok: true,
			json: async () => ({ threads: [], nextCursor: null }),
			status: 200,
		})),
	);
}

function renderRoute(initialPath: string): ReturnType<typeof render> {
	stubFetch();
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					// AD9: /work → WorkOverview
					{ path: "work", element: <WorkOverview /> },
					// AD9: /work/portfolio → redirect to /work
					{ path: "work/portfolio", element: <Navigate to="/work" replace /> },
					// L13: Team drill-down route
					{ path: "work/product/:productId", element: <WorkTeam /> },
					{ path: "work/team/:teamId", element: <WorkTeam /> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);

	return render(<RouterProvider router={router} />);
}

describe("Router — L13/AD9 routes", () => {
	// AD9: /work/portfolio redirects to /work (WorkOverview), not a 404
	it("AD9: /work/portfolio redirects to /work and renders WorkOverview", async () => {
		renderRoute("/work/portfolio");
		await waitFor(() => {
			expect(screen.getByTestId("work-overview-page")).toBeInTheDocument();
		});
	});

	it("renders WorkTeam page at /work/product/:productId", async () => {
		renderRoute("/work/product/p1");
		await waitFor(() => {
			expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
		});
	});
});
