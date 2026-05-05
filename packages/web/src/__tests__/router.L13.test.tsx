/**
 * L13 — Router tests for new product drill-down route and legacy redirect.
 *
 * Separate from router.test.tsx so these can be tested independently
 * while router.test.tsx still tests legacy WorkTeam (which is deleted in step 8).
 *
 * AC coverage:
 * - URL /work/team renders the Portfolio page (the redirect target).
 * - URL /work/product/:productId renders the WorkProduct page.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Navigate, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppShell } from "../layouts/AppShell";
import { WorkPortfolio } from "../pages/WorkPortfolio";
// WorkProduct doesn't exist yet — this import will fail until green phase
import { WorkProduct } from "../pages/WorkProduct";

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
					// L13: New product drill-down route
					{ path: "work/product/:productId", element: <WorkProduct /> },
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

	it("renders WorkProduct page at /work/product/:productId", async () => {
		renderRoute("/work/product/p1");
		await waitFor(() => {
			expect(screen.getByTestId("work-product-page")).toBeInTheDocument();
		});
	});
});
