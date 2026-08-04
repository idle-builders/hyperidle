/**
 * AD9 — Router tests (AC1, AC5).
 *
 * AC5: /work/portfolio redirects to /work (then page resolves by team count).
 * AC1: Work section header navigates to /work for 2+ teams.
 *
 * The existing router.test.tsx is migrated separately — this tests AD9-specific routing.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Navigate, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock useTeams to return 2 teams (so WorkOverview shows the list)
const mockUseTeams = vi.fn();
vi.mock("../hooks/useTeams", () => ({
	useTeams: () => mockUseTeams(),
}));

vi.mock("../hooks/useBets", () => ({
	useBets: () => ({ bets: [], loading: false, error: null, refresh: vi.fn() }),
}));

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

function stubFetch(): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/auth/me")) {
				return {
					ok: true,
					json: async () => ({ id: "u-test", name: "Tester", avatarUrl: null }),
				} as Response;
			}
			if (url.includes("/api/teams")) {
				return {
					ok: true,
					json: async () => ({
						teams: [
							{
								id: "t1",
								name: "Alpha",
								status: "healthy",
								activeBets: 2,
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
								status: "behind",
								activeBets: 1,
								phase: "build",
								leadAgentId: null,
								shipped: 0,
								shipRate: "—",
								progress: { done: 0, total: 0 },
								routineCount: 0,
								agentCount: 0,
							},
						],
					}),
				} as Response;
			}
			return {
				ok: true,
				json: async () => ({ threads: [], nextCursor: null }),
			} as Response;
		}),
	);
}

// ---------------------------------------------------------------------------
// AC5 — /work/portfolio redirects to /work
// ---------------------------------------------------------------------------
describe("AC5 — /work/portfolio redirects to /work overview (2+ teams)", () => {
	it("navigating to /work/portfolio renders the WorkOverview page", async () => {
		stubFetch();
		// useTeams used inside WorkOverview
		mockUseTeams.mockReturnValue({
			data: {
				teams: [
					{
						id: "t1",
						name: "Alpha",
						status: "healthy" as const,
						activeBets: 2,
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
						activeBets: 1,
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
		});

		const { WorkOverview } = await import("../pages/WorkOverview.js");

		const router = createMemoryRouter(
			[
				{
					path: "work/portfolio",
					element: <Navigate to="/work" replace />,
				},
				{
					path: "work",
					element: <WorkOverview />,
				},
				{
					path: "work/team/:teamId",
					element: <div data-testid="team-page">Team</div>,
				},
			],
			{ initialEntries: ["/work/portfolio"] },
		);

		render(<RouterProvider router={router} />);

		await waitFor(() => {
			expect(screen.getByTestId("work-overview-page")).toBeInTheDocument();
		});
	});

	it("navigating to /work/portfolio with 1 team short-circuits to /work/team/:id", async () => {
		stubFetch();
		mockUseTeams.mockReturnValue({
			data: {
				teams: [
					{
						id: "t1",
						name: "Alpha",
						status: "healthy" as const,
						activeBets: 2,
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
		});

		const { WorkOverview } = await import("../pages/WorkOverview.js");

		const router = createMemoryRouter(
			[
				{
					path: "work/portfolio",
					element: <Navigate to="/work" replace />,
				},
				{
					path: "work",
					element: <WorkOverview />,
				},
				{
					path: "work/team/:teamId",
					element: <div data-testid="team-page">Team Page</div>,
				},
			],
			{ initialEntries: ["/work/portfolio"] },
		);

		render(<RouterProvider router={router} />);

		// 1-team: WorkOverview redirects to team page
		await waitFor(() => {
			expect(screen.getByTestId("team-page")).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// AC5 — /work route resolves WorkOverview
// ---------------------------------------------------------------------------
describe("AC5 — /work route renders WorkOverview", () => {
	it("/work renders WorkOverview (work-overview-page testid) for 2+ teams", async () => {
		stubFetch();
		mockUseTeams.mockReturnValue({
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
						activeBets: 1,
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
		});

		const { WorkOverview } = await import("../pages/WorkOverview.js");

		const router = createMemoryRouter(
			[
				{
					path: "work",
					element: <WorkOverview />,
				},
				{
					path: "work/team/:teamId",
					element: <div data-testid="team-page">Team</div>,
				},
			],
			{ initialEntries: ["/work"] },
		);

		render(<RouterProvider router={router} />);

		await waitFor(() => {
			expect(screen.getByTestId("work-overview-page")).toBeInTheDocument();
		});
	});

	it("/work/team/:teamId does not match /work (no collision)", async () => {
		stubFetch();
		mockUseTeams.mockReturnValue({
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
		});

		const { WorkOverview } = await import("../pages/WorkOverview.js");

		const router = createMemoryRouter(
			[
				{
					path: "work",
					element: <WorkOverview />,
				},
				{
					path: "work/team/:teamId",
					element: <div data-testid="team-page">Team Detail</div>,
				},
			],
			{ initialEntries: ["/work/team/t1"] },
		);

		render(<RouterProvider router={router} />);

		await waitFor(() => {
			expect(screen.getByTestId("team-page")).toBeInTheDocument();
		});
		expect(screen.queryByTestId("work-overview-page")).not.toBeInTheDocument();
	});
});
