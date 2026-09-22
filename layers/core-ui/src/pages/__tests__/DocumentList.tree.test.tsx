/**
 * @lore nested-knowledge-items AC1 — Curated tab is a real tree (collapse,
 * indent guides), not a flat list with └ dent markers.
 */
import type { DocumentRow } from "@hyperidle/domain-model";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "../DocumentList";

function makeDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
	return {
		id: "k1",
		title: "Untitled",
		body: "",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "factory",
		scopeId: null,
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "u-founder",
		createdAt: "2026-01-01T10:00:00.000Z",
		updatedAt: "2026-01-01T10:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

const mockUseDocuments = vi.fn();
vi.mock("../../hooks/useDocuments.js", () => ({
	useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

function renderDocumentList(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/documents"]}>
			<Routes>
				<Route path="/documents" element={<DocumentList />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("DocumentList Curated tab: a tree, not a flat list", () => {
	beforeEach(() => {
		mockUseDocuments.mockReturnValue({
			documents: [
				makeDoc({
					id: "k-parent",
					title: "Pricing",
					body: "Root document.",
					parentKind: null,
					parentId: null,
				}),
				makeDoc({
					id: "k-child",
					title: "Objection handling",
					body: "Child document.",
					parentKind: "document",
					parentId: "k-parent",
					updatedAt: "2026-01-02T10:00:00.000Z",
				}),
				makeDoc({
					id: "k-orphan-child",
					title: "Orphaned but active",
					body: "Parent is not itself active, so it is not in this list.",
					parentKind: "document",
					parentId: "k-not-in-list",
					updatedAt: "2026-01-03T10:00:00.000Z",
				}),
			],
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
	});

	it("renders parent then child with collapse control — no └ dent marker", async () => {
		renderDocumentList();

		await screen.findByText("Pricing");
		const rows = screen.getAllByTestId("document-row");
		const titles = rows.map((row) => within(row).getByText(/Pricing|Objection handling|Orphaned/));
		expect(titles.map((t) => t.textContent)).toEqual([
			"Orphaned but active",
			"Pricing",
			"Objection handling",
		]);
		expect(screen.queryByText(/└/)).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();
		expect(screen.getByTestId("document-tree-list")).toBeInTheDocument();
	});

	it("collapses a parent so its child leaves the list", async () => {
		const user = userEvent.setup();
		renderDocumentList();
		await screen.findByText("Objection handling");
		await user.click(screen.getByRole("button", { name: "Collapse" }));
		expect(screen.queryByText("Objection handling")).not.toBeInTheDocument();
		expect(screen.getByText("Pricing")).toBeInTheDocument();
	});
});
