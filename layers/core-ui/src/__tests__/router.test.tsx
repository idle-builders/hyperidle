/**
 * Router wiring: redirects and the catch-all resolve to the right place.
 * Each page's own render behavior is covered by that page's test file — this
 * only proves the route table's rules (redirects, params, catch-all).
 */

import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRoutes } from "../router.js";

vi.mock("../hooks/useTeams", () => ({
	useTeams: () => ({
		data: {
			teams: [
				{
					id: "t1",
					name: "Alpha",
					status: "healthy",
					tasksInProgress: 2,
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
					status: "behind",
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

function renderRoute(initialPath: string): ReturnType<typeof createMemoryRouter> {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({
			ok: true,
			json: async () => ({ threads: [], nextCursor: null }),
			status: 200,
		})),
	);
	const router = createMemoryRouter(buildRoutes(), { initialEntries: [initialPath] });
	render(<RouterProvider router={router} />);
	return router;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("legacy redirects", () => {
	it("/work/portfolio redirects to /work", async () => {
		const router = renderRoute("/work/portfolio");
		await waitFor(() => expect(router.state.location.pathname).toBe("/work"));
	});

	it("/work/product/:id redirects to /work/team/:id, preserving the id", async () => {
		const router = renderRoute("/work/product/my-team-id");
		await waitFor(() => expect(router.state.location.pathname).toBe("/work/team/my-team-id"));
	});

	it("/conversations/review wires to RedirectLegacyConversation (own tests cover its rules)", async () => {
		const router = renderRoute("/conversations/review?id=t-legacy");
		await waitFor(() => expect(router.state.location.pathname).toBe("/conversations/t-legacy"));
	});
});

describe("catch-all", () => {
	it("renders NotFound for an unmatched path", async () => {
		renderRoute("/no-such-route");
		await waitFor(() => {
			expect(screen.getByText(/page not found/i)).toBeInTheDocument();
		});
	});
});
