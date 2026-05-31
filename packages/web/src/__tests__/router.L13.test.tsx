/**
 * L13 — Router tests for new team drill-down route and legacy redirect.
 *
 * @lore U5: Updated to use WorkTeam (renamed from WorkProduct).
 * URL path /work/product/:productId kept for backward compat (U6 will rename).
 *
 * AC coverage:
 * - URL /work/team renders the Portfolio page (the redirect target).
 * - URL /work/product/:productId renders the WorkTeam page.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Navigate, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppShell } from "../layouts/AppShell";
import { WorkPortfolio } from "../pages/WorkPortfolio";
import { WorkTeam } from "../pages/WorkTeam";

function renderRoute(initialPath: string): ReturnType<typeof render> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "work/portfolio", element: <WorkPortfolio /> },
					// L13: Legacy redirect
					{
						path: "work/team",
						element: <Navigate to="/work/portfolio" replace />,
					},
					// L13: Team drill-down route (URL path kept for backward compat — U6 renames)
					{ path: "work/product/:productId", element: <WorkTeam /> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);

	return render(<RouterProvider router={router} />);
}

describe("Router — L13 routes", () => {
	it("13. /work/team redirects to /work/portfolio and renders the Portfolio page", async () => {
		renderRoute("/work/team");
		await waitFor(() => {
			expect(screen.getByTestId("work-portfolio-page")).toBeInTheDocument();
		});
	});

	it("renders WorkTeam page at /work/product/:productId", async () => {
		renderRoute("/work/product/p1");
		await waitFor(() => {
			expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
		});
	});
});
