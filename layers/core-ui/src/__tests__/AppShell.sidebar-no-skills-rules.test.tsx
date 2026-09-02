/**
 * The sidebar's Knowledge fast-nav list
 * shows general knowledge only. A skill or rule item must not appear there
 * either — the same rule KnowledgeList's own filter enforces.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
	global.fetch = vi.fn(async (url: string | URL | Request) => {
		const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
		if (urlStr.includes("/api/knowledge/triage-count")) {
			return { ok: true, json: async () => ({ count: 0 }) };
		}
		if (urlStr.includes("/api/knowledge")) {
			return {
				ok: true,
				json: async () => ({
					items: [
						{
							id: "k-ordinary",
							topic: "Architecture",
							title: "Ordinary decision doc",
							body: "",
							format: "markdown",
							status: "active",
							role: "ordinary",
							version: 1,
							updatedBy: "agent",
							createdAt: "2025-01-01",
							updatedAt: "2025-01-02",
						},
						{
							id: "k-skill",
							topic: null,
							title: "write-tests-skill",
							body: "",
							format: "markdown",
							status: "active",
							role: "skill",
							parentKind: "agent",
							version: 1,
							updatedBy: "agent",
							createdAt: "2025-01-01",
							updatedAt: "2025-01-01",
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

function renderShellAt(initialPath: string): ReturnType<typeof createMemoryRouter> {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <AppShell />,
				children: [
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

describe("AppShell sidebar — no skill or rule in the Knowledge fast-nav list", () => {
	it("shows the ordinary item, not the skill", async () => {
		renderShellAt("/knowledge");
		await waitFor(() => {
			expect(screen.getByText("Ordinary decision doc")).toBeInTheDocument();
		});
		expect(screen.queryByText("write-tests-skill")).not.toBeInTheDocument();
	});
});
