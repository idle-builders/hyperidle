import { render, screen, waitFor, within } from "@testing-library/react";
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
						{
							id: "k2",
							topic: "Architecture",
							title: "DB",
							body: "",
							format: "markdown",
							status: "active",
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
import { KnowledgeList } from "../pages/KnowledgeList";

/**
 * J6: the Knowledge submenu hosts a scope browser (Practice/Product/Factory)
 * and a list of topic NavItems with health dots. Switching scope navigates
 * to /knowledge?scope=<next>, which is what the KnowledgeList page reads to
 * derive its scoped view.
 */
function renderShellAt(initialPath: string): ReturnType<typeof createMemoryRouter> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations", element: <div>Conversations Page</div> },
					{ path: "knowledge", element: <KnowledgeList /> },
					{ path: "knowledge/:knowledgeId", element: <div>Detail</div> },
				],
			},
		],
		{ initialEntries: [initialPath] },
	);
	render(<RouterProvider router={router} />);
	return router;
}

describe("AppShell — Knowledge scope browser (J6)", () => {
	it("renders the three-scope segmented control inside the Knowledge submenu", async () => {
		renderShellAt("/knowledge");
		const submenu = await screen.findByTestId("knowledge-submenu");
		const browser = within(submenu).getByTestId("knowledge-scope-browser");
		expect(within(browser).getByRole("tab", { name: "Practice" })).toBeInTheDocument();
		expect(within(browser).getByRole("tab", { name: "Product" })).toBeInTheDocument();
		expect(within(browser).getByRole("tab", { name: "Factory" })).toBeInTheDocument();
	});

	it("defaults to Practice when no ?scope= param", async () => {
		renderShellAt("/knowledge");
		const submenu = await screen.findByTestId("knowledge-submenu");
		expect(within(submenu).getByRole("tab", { name: "Practice" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	it("reflects the ?scope= param in the selected tab", async () => {
		renderShellAt("/knowledge?scope=factory");
		const submenu = await screen.findByTestId("knowledge-submenu");
		expect(within(submenu).getByRole("tab", { name: "Factory" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});

	it("shows empty state when no topics exist for the current scope", async () => {
		renderShellAt("/knowledge");
		const submenu = await screen.findByTestId("knowledge-submenu");
		expect(within(submenu).getByText("No topics yet")).toBeInTheDocument();
	});

	it("switching scope navigates to /knowledge?scope=<next>", async () => {
		const user = userEvent.setup();
		const router = renderShellAt("/knowledge");
		const submenu = await screen.findByTestId("knowledge-submenu");
		await user.click(within(submenu).getByRole("tab", { name: "Factory" }));
		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/knowledge");
			expect(router.state.location.search).toBe("?scope=factory");
		});
	});

	it("resets the list tab to the new scope default on scope switch", async () => {
		// Both practice and product scopes have needs_human => default Triage.
		// We validate resetting by flipping the list tab to Curated manually,
		// then clicking Product scope, and confirming Triage is re-selected.
		const user = userEvent.setup();
		renderShellAt("/knowledge?scope=practice");
		await user.click(screen.getByRole("tab", { name: "Curated" }));
		expect(screen.getByRole("tab", { name: "Curated" })).toHaveAttribute("aria-selected", "true");

		const submenu = await screen.findByTestId("knowledge-submenu");
		await user.click(within(submenu).getByRole("tab", { name: "Product" }));
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: "Triage" })).toHaveAttribute("aria-selected", "true");
		});
	});
});
