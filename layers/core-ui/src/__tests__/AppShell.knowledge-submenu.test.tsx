/**
 * @lore U6/W3: Knowledge scope browser moved from Sidebar sub-items to
 * inline pills on the DocumentList page (W3 AC-3).
 *
 * The sidebar no longer renders Practices/Products/Factory scope sub-items.
 * The sidebar's Knowledge section header navigates to /documents; scope
 * filtering happens via pills within the DocumentList page body.
 *
 * These tests verify the sidebar knowledge section still renders and activates
 * correctly, without scope sub-items.
 *
 * @lore BC4: the sidebar fast-nav list comes from `search_documents`
 * (`useDocuments`), not a raw `/api/knowledge` fetch — `call` is mocked.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

beforeEach(() => {
	callMock.mockImplementation(async (action: string) => {
		if (action === "search_documents") {
			return {
				ok: true,
				data: [
					{
						id: "k1",
						title: "Auth",
						body: "",
						format: "markdown",
						status: "active",
						slot: "ordinary",
						scopeKind: "team",
						scopeId: "team-1",
						parentKind: null,
						parentId: null,
						position: 0,
						version: 1,
						updatedBy: "agent",
						createdAt: "2025-01-01T00:00:00.000Z",
						updatedAt: "2025-01-01T00:00:00.000Z",
						readCount: 0,
						lastReadAt: null,
						sessionUseCount: 0,
						lastUsedAt: null,
						as: "document",
					},
				],
			};
		}
		return { ok: true, data: [] };
	});
	global.fetch = vi.fn(async (url: string | URL | Request) => {
		const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
		if (urlStr.includes("/api/auth/me")) {
			return { ok: true, json: async () => ({ id: "u-founder", name: "Founder" }) };
		}
		return { ok: true, json: async () => ({ threads: [], nextCursor: null }) };
	}) as unknown as typeof fetch;
});

import { AppShell } from "../layouts/AppShell";

/**
 * W3 AC-3: Scope sub-items are removed from the sidebar.
 * The sidebar knowledge section is a header only — scope pills live in the DocumentList page.
 */
function renderShellAt(initialPath: string): ReturnType<typeof createMemoryRouter> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ path: "conversations", element: <div>Conversations Page</div> },
					{ path: "documents", element: <div data-testid="knowledge-page">Documents Page</div> },
					{ path: "documents/:documentId", element: <div>Detail</div> },
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
		renderShellAt("/documents");
		await waitFor(() => {
			// UI-080: Knowledge section header is now a <Link> (role="link"), not a button
			expect(screen.getByRole("link", { name: /knowledge/i })).toBeInTheDocument();
		});
		// W3 AC-3: scope sub-items removed from sidebar
		expect(screen.queryByText("Practices")).not.toBeInTheDocument();
		expect(screen.queryByText("Products")).not.toBeInTheDocument();
		expect(screen.queryByText("Factory")).not.toBeInTheDocument();
	});

	it("sidebar knowledge section is active when on /documents route", async () => {
		renderShellAt("/documents");

		await waitFor(() => {
			expect(screen.getByTestId("knowledge-page")).toBeInTheDocument();
		});

		// Knowledge section header should be active (now a <Link>, not button — UI-080)
		// @lore U6: data-section="knowledge" data-active="true" is on the section header element
		const knowledgeBtn = document.querySelector("[data-section='knowledge'][data-active='true']");
		expect(knowledgeBtn).toBeInTheDocument();
	});

	it("the sidebar fast-nav list comes from search_documents", async () => {
		renderShellAt("/documents");
		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("search_documents", { inTree: true, limit: 50 });
		});
		await waitFor(() => {
			expect(screen.getByText("Auth")).toBeInTheDocument();
		});
	});

	it('the sidebar section reads exactly "Knowledge" even though its route is /documents', async () => {
		renderShellAt("/documents");
		await waitFor(() => {
			// Exact-equality name match (not a substring/regex) — founder ruling 3.
			expect(screen.getByRole("link", { name: "Knowledge" })).toBeInTheDocument();
		});
	});
});
