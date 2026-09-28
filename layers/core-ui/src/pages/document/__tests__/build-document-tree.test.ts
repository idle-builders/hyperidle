import { describe, expect, it } from "vitest";
import {
	buildDocumentTree,
	type DocumentTreeItem,
	visibleDocumentTreeRows,
} from "../build-document-tree.js";

function item(
	partial: Partial<DocumentTreeItem> & Pick<DocumentTreeItem, "id" | "title">,
): DocumentTreeItem {
	return {
		body: "",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "u-1",
		createdAt: "2026-01-01",
		updatedAt: "2026-01-01",
		parentId: null,
		...partial,
	};
}

describe("buildDocumentTree", () => {
	it("orders a parent immediately followed by its own children and marks hasChildren", () => {
		const rows = buildDocumentTree([
			item({ id: "root", title: "Root" }),
			item({ id: "child", title: "Child", parentId: "root" }),
		]);
		expect(rows.map((r) => [r.item.id, r.depth, r.hasChildren])).toEqual([
			["root", 0, true],
			["child", 1, false],
		]);
	});

	it("treats an item whose parent is absent from the array as a root, never dropping it", () => {
		const rows = buildDocumentTree([
			item({ id: "orphan", title: "Orphan", parentId: "not-in-array" }),
		]);
		expect(rows).toEqual([
			{ item: expect.objectContaining({ id: "orphan" }), depth: 0, hasChildren: false },
		]);
	});
});

describe("visibleDocumentTreeRows", () => {
	it("hides descendants of a collapsed parent and keeps siblings", () => {
		const rows = buildDocumentTree([
			item({ id: "a", title: "A" }),
			item({ id: "a1", title: "A1", parentId: "a" }),
			item({ id: "a1a", title: "A1a", parentId: "a1" }),
			item({ id: "b", title: "B" }),
		]);
		const visible = visibleDocumentTreeRows(rows, new Set(["a"]));
		expect(visible.map((r) => r.item.id)).toEqual(["a", "b"]);
	});
});
