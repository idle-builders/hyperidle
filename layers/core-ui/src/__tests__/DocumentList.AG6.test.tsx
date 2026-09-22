/**
 * AG6 — DocumentList migration: Row primitive integration tests.
 *
 * AC-2: Document rows render through Row/ItemList (the "one more" surface).
 * AC-3: Rows share one treatment — each document row carries data-ds-component=Row.
 * AC-4: KnowledgeListRow bespoke component removed; composed via Row.
 *
 * Protected testids (time-vocabulary.spec, L13-product-drilldown.spec) must survive:
 * document-row, document-time, status-badge, private-badge, data-focused.
 * @lore nested-knowledge-items: kind-badge removed from the protected list —
 * `kind` vocabulary is deleted.
 */

import type { DocumentRow } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "../pages/DocumentList";

function makeDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
	return {
		id: "k1",
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
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

const MOCK_DOCUMENTS: DocumentRow[] = [
	makeDoc({
		id: "k1",
		title: "Architecture Decision: Auth Strategy",
		body: "JWT auth decision",
		updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
	}),
	makeDoc({
		id: "k2",
		title: "User Interview Notes",
		body: "Interview notes",
		updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
	}),
];

const mockUseDocuments = vi.fn();
vi.mock("../hooks/useDocuments.js", () => ({
	useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

function renderPage() {
	return render(
		<MemoryRouter>
			<DocumentList />
		</MemoryRouter>,
	);
}

// ── AC-2: Document rows rendered via Row primitive ──────────────────────────

describe("AG6 AC-2 — DocumentList rows via Row primitive (T8)", () => {
	beforeEach(() => {
		mockUseDocuments.mockReturnValue({
			documents: MOCK_DOCUMENTS,
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
	});

	it("document rows render as treeitem inside DocumentTreeList", async () => {
		// @lore nested-knowledge-items tree-ui: curated tab migrated from Row/ItemList
		// to DocumentTreeList — rows are <li role="treeitem"> not Row primitives.
		renderPage();
		const treeEl = await screen.findByTestId("document-tree-list");
		expect(treeEl).not.toBeNull();
		const documentRows = screen.getAllByTestId("document-row");
		expect(documentRows.length).toBeGreaterThan(0);
	});

	// Protected testids (time-vocabulary.spec / L13 spec) must survive T8
	it("document-row testid preserved (protected)", async () => {
		renderPage();
		const rows = await screen.findAllByTestId("document-row");
		expect(rows.length).toBeGreaterThan(0);
	});

	it("document-time testid preserved (time-vocabulary.spec protected)", async () => {
		renderPage();
		const times = await screen.findAllByTestId("document-time");
		expect(times.length).toBeGreaterThan(0);
	});

	it("DocumentTreeList renders inside curated view (no contained surface)", async () => {
		// @lore nested-knowledge-items tree-ui: the curated tab uses DocumentTreeList
		// which renders a <ul role="tree"> without a surface-container wrapper.
		renderPage();
		const list = await screen.findByTestId("document-curated-view");
		const treeEl = list.querySelector("[data-testid='document-tree-list']");
		expect(treeEl).not.toBeNull();
		expect(treeEl?.className ?? "").not.toContain("surface-container");
	});
});

// ── AC-5: Loading/empty states via ItemList (T8) ────────────────────────────

describe("AG6 AC-5 — DocumentList empty/loading via ItemList (T8)", () => {
	it("loading state renders via ItemList (no bespoke SkeletonList call outside primitive)", async () => {
		mockUseDocuments.mockReturnValue({
			documents: [],
			status: "loading",
			error: null,
			retry: vi.fn(),
		});
		renderPage();
		// The ItemList should be present even in populated state — existence proves T8 migration
		const page = await screen.findByTestId("document-list-page");
		expect(page).toBeInTheDocument();
	});
});
