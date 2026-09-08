/**
 * @lore nested-knowledge-items AC1 — the Curated tab renders as a tree: a parent
 * row is immediately followed by its own children, indented, instead of a
 * flat recency-sorted list (review.md B1). Reproduces the exact scenario the
 * review's live-render check found missing: no nesting affordance anywhere.
 */
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { buildKnowledgeTree, KnowledgeList } from "../KnowledgeList";

vi.mock("../../hooks/useFetch", () => ({
	useFetch: (url: string | null) => {
		if (url?.includes("/api/knowledge")) {
			return {
				data: {
					items: [
						{
							id: "k-parent",
							title: "Pricing",
							body: "Root knowledge item.",
							status: "active",
							scopeKind: "factory",
							role: "ordinary",
							parentKind: null,
							parentId: null,
							updatedAt: "2026-01-01T10:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
						{
							id: "k-child",
							title: "Objection handling",
							body: "Child knowledge item.",
							status: "active",
							scopeKind: "factory",
							role: "ordinary",
							parentKind: "knowledge_item",
							parentId: "k-parent",
							updatedAt: "2026-01-02T10:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
						{
							id: "k-orphan-child",
							title: "Orphaned but active",
							body: "Parent is not itself active, so it is not in this list.",
							status: "active",
							scopeKind: "factory",
							role: "ordinary",
							parentKind: "knowledge_item",
							parentId: "k-not-in-list",
							updatedAt: "2026-01-03T10:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
					],
				},
				loading: false,
				error: null,
				refresh: vi.fn(),
			};
		}
		return { data: null, loading: false, error: null, refresh: vi.fn() };
	},
}));

vi.mock("../../hooks/useCurrentUser", () => ({
	useCurrentUser: () => ({ data: { id: "u-founder", name: "Test Founder", avatarUrl: null } }),
}));

function renderKnowledgeList(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/knowledge"]}>
			<Routes>
				<Route path="/knowledge" element={<KnowledgeList />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("buildKnowledgeTree", () => {
	it("orders a parent immediately followed by its own children", () => {
		const rows = buildKnowledgeTree([
			{
				id: "root",
				title: "Root",
				body: "",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "u-1",
				createdAt: "2026-01-01",
				updatedAt: "2026-01-01",
				parentId: null,
			},
			{
				id: "child",
				title: "Child",
				body: "",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "u-1",
				createdAt: "2026-01-01",
				updatedAt: "2026-01-01",
				parentId: "root",
			},
		]);
		expect(rows.map((r) => [r.item.id, r.depth])).toEqual([
			["root", 0],
			["child", 1],
		]);
	});

	it("treats an item whose parent is absent from the array as a root, never dropping it", () => {
		const rows = buildKnowledgeTree([
			{
				id: "orphan",
				title: "Orphan",
				body: "",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "u-1",
				createdAt: "2026-01-01",
				updatedAt: "2026-01-01",
				parentId: "not-in-array",
			},
		]);
		expect(rows).toEqual([{ item: expect.objectContaining({ id: "orphan" }), depth: 0 }]);
	});
});

describe("KnowledgeList Curated tab: a tree, not a flat list", () => {
	it("renders the child immediately after its parent, indented — both visible in one list", async () => {
		renderKnowledgeList();

		const parentRow = await screen.findByText("Pricing");
		expect(parentRow).toBeInTheDocument();

		const rows = screen.getAllByTestId("knowledge-row");
		const titles = rows.map((row) => within(row).getByText(/Pricing|Objection handling|Orphaned/));
		// Roots sort by recency (2026-01-03 orphan, then 2026-01-01 Pricing);
		// the child always immediately follows its own parent, regardless of
		// the child's own timestamp — that is the tree structure.
		expect(titles.map((t) => t.textContent)).toEqual([
			"Orphaned but active",
			"Pricing",
			"└ Objection handling",
		]);

		// The child row is indented relative to the parent — real nesting, not
		// a flat sorted list (review.md B1: "no expander, no indentation, no
		// nesting affordance anywhere").
		const childTitle = screen.getByText(/Objection handling/);
		expect(childTitle.closest("span")?.getAttribute("style") ?? "").toContain("padding-left");
	});
});
