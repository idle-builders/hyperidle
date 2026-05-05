import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
	// L8: AppShell fetches /api/threads on mount.
	const existing = global.fetch as unknown;
	if (typeof existing !== "function" || !("mock" in (existing as object))) {
		global.fetch = vi.fn(async () => ({
			ok: true,
			json: async () => ({ threads: [], nextCursor: null }),
		})) as unknown as typeof fetch;
	}
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

	it("renders topic NavItems for the current scope with health dots", async () => {
		renderShellAt("/knowledge");
		const submenu = await screen.findByTestId("knowledge-submenu");
		// Practice scope topics: Architecture, Research, Component Library, Process.
		expect(within(submenu).getByTestId("knowledge-topic-nav-Architecture")).toBeInTheDocument();
		expect(within(submenu).getByTestId("knowledge-topic-nav-Research")).toBeInTheDocument();
		expect(within(submenu).getByTestId("knowledge-topic-nav-Process")).toBeInTheDocument();
		// Architecture has 1 stale of 3 => some_stale (amber)
		const archNav = within(submenu).getByTestId("knowledge-topic-nav-Architecture");
		const dot = archNav.querySelector('[data-health="some_stale"]');
		expect(dot).not.toBeNull();
	});

	it("switching scope navigates to /knowledge?scope=<next> and swaps topics", async () => {
		const user = userEvent.setup();
		const router = renderShellAt("/knowledge");
		const submenu = await screen.findByTestId("knowledge-submenu");
		await user.click(within(submenu).getByRole("tab", { name: "Factory" }));
		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/knowledge");
			expect(router.state.location.search).toBe("?scope=factory");
		});
		const submenu2 = await screen.findByTestId("knowledge-submenu");
		expect(within(submenu2).getByTestId("knowledge-topic-nav-Governance")).toBeInTheDocument();
		expect(within(submenu2).queryByTestId("knowledge-topic-nav-Architecture")).toBeNull();
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
