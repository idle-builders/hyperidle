/**
 * The sidebar's Knowledge fast-nav list
 * shows general documents only. A skill or rule document must not appear
 * there either — the same rule DocumentList's own filter enforces.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

function docRow(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: "d1",
		title: "Untitled",
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
		updatedAt: "2025-01-02T00:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

beforeEach(() => {
	callMock.mockImplementation(async (action: string) => {
		if (action === "search_documents") {
			return {
				ok: true,
				data: [
					docRow({ id: "k-ordinary", title: "Ordinary decision doc" }),
					docRow({
						id: "k-skill",
						title: "write-tests-skill",
						slot: "skill",
						parentKind: "agent",
						parentId: "agent-1",
					}),
				],
			};
		}
		return { ok: true, data: [] };
	});
	global.fetch = vi.fn(async () => {
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
					{ path: "documents", element: <div data-testid="document-page">Documents Page</div> },
					{ path: "documents/:documentId", element: <div>Detail</div> },
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
		renderShellAt("/documents");
		await waitFor(() => {
			expect(screen.getByText("Ordinary decision doc")).toBeInTheDocument();
		});
		expect(screen.queryByText("write-tests-skill")).not.toBeInTheDocument();
	});
});
