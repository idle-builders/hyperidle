/**
 * @lore U6/W3: Knowledge scope browser moved from Sidebar sub-items to
 * inline pills on the KnowledgeList page (W3 AC-3).
 *
 * The sidebar no longer renders Practices/Products/Factory scope sub-items.
 * The sidebar's Knowledge section header navigates to /knowledge; scope
 * filtering happens via pills within the KnowledgeList page body.
 *
 * These tests verify the sidebar knowledge section still renders and activates
 * correctly, without scope sub-items.
 */
import { render, screen, waitFor } from "@testing-library/react";
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
 * W3 AC-3: Scope sub-items are removed from the sidebar.
 * The sidebar knowledge section is a header only — scope pills live in the KnowledgeList page.
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

describe("AppShell — Knowledge sidebar section (W3 AC-3)", () => {
	it("does NOT render scope sub-items (Practices/Products/Factory) in sidebar", async () => {
		renderShellAt("/knowledge");
		await waitFor(() => {
			// UI-080: Knowledge section header is now a <Link> (role="link"), not a button
			expect(screen.getByRole("link", { name: /knowledge/i })).toBeInTheDocument();
		});
		// W3 AC-3: scope sub-items removed from sidebar
		expect(screen.queryByText("Practices")).not.toBeInTheDocument();
		expect(screen.queryByText("Products")).not.toBeInTheDocument();
		expect(screen.queryByText("Factory")).not.toBeInTheDocument();
	});

	it("sidebar knowledge section is active when on /knowledge route", async () => {
		renderShellAt("/knowledge");

		await waitFor(() => {
			expect(screen.getByTestId("knowledge-page")).toBeInTheDocument();
		});

		// Knowledge section header should be active (now a <Link>, not button — UI-080)
		// @lore U6: data-section="knowledge" data-active="true" is on the section header element
		const knowledgeBtn = document.querySelector("[data-section='knowledge'][data-active='true']");
		expect(knowledgeBtn).toBeInTheDocument();
	});
});
