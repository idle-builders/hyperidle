/**
 * @lore U6: Knowledge scope browser moved from Submenu to Sidebar.
 * The Sidebar shows static Practices/Products/Factory scope items as buttons
 * in the Knowledge section. Clicking a scope item navigates to /knowledge?scope=<scope>.
 *
 * Old test (J6) looked for [data-testid="knowledge-submenu"] and scope tabs inside
 * a dedicated knowledge submenu panel. U6 replaces this with sidebar buttons.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
	global.fetch = vi.fn(async (url: string | URL | Request) => {
		const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
		if (urlStr.includes("/api/knowledge")) {
			return {
				ok: true,
				json: async () => ({
					items: [
						{
							id: "k1",
							topic: "Architecture",
							title: "Auth",
							body: "",
							format: "markdown",
							status: "draft",
							version: 1,
							updatedBy: "agent",
							createdAt: "2025-01-01",
							updatedAt: "2025-01-01",
							signals: null,
						},
					],
				}),
			};
		}
		if (urlStr.includes("/api/auth/me")) {
			return { ok: true, json: async () => ({ id: "u-founder", name: "Founder" }) };
		}
		return { ok: true, json: async () => ({ threads: [], nextCursor: null }) };
	}) as unknown as typeof fetch;
});

import { AppShell } from "../layouts/AppShell";

/**
 * J6 U6: Knowledge scope browser is now in the Sidebar as static scope buttons.
 * The sidebar navigation for knowledge renders Practices, Products, Factory as
 * clickable buttons that navigate to /knowledge?scope=<scope>.
 */
function renderShellAt(initialPath: string): ReturnType<typeof createMemoryRouter> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations", element: <div>Conversations Page</div> },
					{ path: "knowledge", element: <div data-testid="knowledge-page">Knowledge Page</div> },
					{ path: "knowledge/:knowledgeId", element: <div>Detail</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	render(<RouterProvider router={router} />);
	return router;
}

describe("AppShell — Knowledge scope browser in Sidebar (U6/J6)", () => {
	it("renders Practices, Products, Factory scope items in the Knowledge sidebar section", async () => {
		// Navigate to /knowledge so sidebar activates the knowledge section
		renderShellAt("/knowledge");
		// Wait for sidebar to render
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /knowledge/i })).toBeInTheDocument();
		});
		// Knowledge scope items should be visible
		expect(screen.getByText("Practices")).toBeInTheDocument();
		expect(screen.getByText("Products")).toBeInTheDocument();
		expect(screen.getByText("Factory")).toBeInTheDocument();
	});

	it("clicking Practices scope item navigates to /knowledge?scope=practices", async () => {
		const user = userEvent.setup();
		const router = renderShellAt("/knowledge");

		await waitFor(() => {
			expect(screen.getByText("Practices")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Practices"));

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/knowledge");
			expect(router.state.location.search).toBe("?scope=practices");
		});
	});

	it("clicking Factory scope item navigates to /knowledge?scope=factory", async () => {
		const user = userEvent.setup();
		const router = renderShellAt("/knowledge");

		await waitFor(() => {
			expect(screen.getByText("Factory")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Factory"));

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/knowledge");
			expect(router.state.location.search).toBe("?scope=factory");
		});
	});

	it("sidebar knowledge section is active when on /knowledge route", async () => {
		renderShellAt("/knowledge");

		await waitFor(() => {
			expect(screen.getByTestId("knowledge-page")).toBeInTheDocument();
		});

		// Knowledge section header button should be active
		// @lore U6: data-section="knowledge" data-active="true" is on the section header button
		const knowledgeBtn = document.querySelector("[data-section='knowledge'][data-active='true']");
		expect(knowledgeBtn).toBeInTheDocument();
	});
});
