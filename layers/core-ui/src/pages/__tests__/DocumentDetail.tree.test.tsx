/**
 * DocumentDetail — the tree: ancestry breadcrumb, the Children card and the
 * Backlinks (siblings) card. `open_document`'s view carries `ancestors`,
 * `children` and `siblings` directly — no client-side parent-chain walk.
 *
 * @lore BC4: replaces `KnowledgeDetail.ancestry.test.tsx`,
 * `KnowledgeDetail.children.test.tsx` and `KnowledgeDetail.related.test.tsx`.
 */

import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentDetail } from "../DocumentDetail";
import {
	makeCallRouter,
	makeDocumentRow,
	makeDocumentView,
} from "./document-detail-test-helpers.js";

const callMock = vi.fn();
vi.mock("../../services/call.js", () => ({
	call: (...args: [string, unknown]) => callMock(...args),
}));

vi.mock("../../shell/HostThreadSection.js", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "u-founder", name: "Founder" } }),
}));

vi.mock("../../hooks/useTeams.js", () => ({
	useTeams: () => ({ data: { teams: [] }, loading: false }),
}));

function renderPage(id: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/documents/${id}`]}>
			<Routes>
				<Route path="/documents/:documentId" element={<DocumentDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

afterEach(() => {
	callMock.mockReset();
	vi.restoreAllMocks();
});

describe("DocumentDetail — ancestry breadcrumb", () => {
	it("shows the parent chain, root-first, each linking to /documents/:id", async () => {
		const root = makeDocumentRow({ id: "doc-product", title: "Product" });
		const mid = makeDocumentRow({ id: "doc-pricing", title: "Pricing", parentId: "doc-product" });
		const row = makeDocumentRow({
			id: "doc-objections",
			title: "Objections playbook",
			parentId: "doc-pricing",
		});
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({
					ok: true,
					data: makeDocumentView(row, { ancestors: [root, mid] }),
				}),
			}),
		);

		renderPage("doc-objections");

		const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
		expect(within(nav).getByRole("link", { name: "Product" })).toHaveAttribute(
			"href",
			"/documents/doc-product",
		);
		expect(within(nav).getByRole("link", { name: "Pricing" })).toHaveAttribute(
			"href",
			"/documents/doc-pricing",
		);
		expect(nav).toHaveTextContent("Objections playbook");
	});

	it("shows just the Knowledge root for a top-level document", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Root document" });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-1");

		const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
		expect(within(nav).getByRole("link", { name: "Knowledge" })).toHaveAttribute(
			"href",
			"/documents",
		);
	});
});

describe("DocumentDetail — Children card", () => {
	it("lists each child's title and links to it", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Pricing" });
		const child1 = makeDocumentRow({ id: "doc-2", title: "Objections playbook" });
		const child2 = makeDocumentRow({ id: "doc-3", title: "Discount policy" });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({
					ok: true,
					data: makeDocumentView(row, { children: [child1, child2] }),
				}),
			}),
		);

		renderPage("doc-1");

		const card = await screen.findByTestId("document-children-card");
		expect(within(card).getByText("Objections playbook")).toBeInTheDocument();
		expect(within(card).getByText("Discount policy")).toBeInTheDocument();
		expect(within(card).getByRole("link", { name: "Objections playbook" })).toHaveAttribute(
			"href",
			"/documents/doc-2",
		);
	});

	it("offers Add child linking to /documents/new?parentId=<id>, even with no children yet", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Pricing" });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-1");

		const card = await screen.findByTestId("document-children-card");
		expect(within(card).getByTestId("document-add-child")).toHaveAttribute(
			"href",
			"/documents/new?parentId=doc-1",
		);
		expect(within(card).getByText(/No nested documents yet/)).toBeInTheDocument();
	});
});

describe("DocumentDetail — Backlinks card", () => {
	it("lists siblings by title", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Pricing" });
		const sibling = makeDocumentRow({ id: "doc-4", title: "API Rate Limiting Best Practices" });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({
					ok: true,
					data: makeDocumentView(row, { siblings: [sibling] }),
				}),
			}),
		);

		renderPage("doc-1");

		const card = await screen.findByTestId("document-backlinks-card");
		expect(within(card).getByText("API Rate Limiting Best Practices")).toBeInTheDocument();
	});

	it("shows an honest empty state when there are no siblings", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Pricing" });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-1");

		const card = await screen.findByTestId("document-backlinks-card");
		expect(within(card).getByText(/No backlinks/i)).toBeInTheDocument();
	});
});
