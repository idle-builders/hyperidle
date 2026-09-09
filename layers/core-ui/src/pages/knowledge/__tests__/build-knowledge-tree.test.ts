/**
 * @lore nested-knowledge-items tree-ui — pure tree assembly + collapse filter.
 */
import { describe, expect, it } from "vitest";
import {
	buildKnowledgeTree,
	type KnowledgeTreeItem,
	visibleKnowledgeTreeRows,
} from "../build-knowledge-tree.js";

function item(
	partial: Partial<KnowledgeTreeItem> & Pick<KnowledgeTreeItem, "id" | "title">,
): KnowledgeTreeItem {
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

describe("buildKnowledgeTree", () => {
	it("orders a parent immediately followed by its own children and marks hasChildren", () => {
		const rows = buildKnowledgeTree([
			item({ id: "root", title: "Root" }),
			item({ id: "child", title: "Child", parentId: "root" }),
		]);
		expect(rows.map((r) => [r.item.id, r.depth, r.hasChildren])).toEqual([
			["root", 0, true],
			["child", 1, false],
		]);
	});

	it("treats an item whose parent is absent from the array as a root, never dropping it", () => {
		const rows = buildKnowledgeTree([
			item({ id: "orphan", title: "Orphan", parentId: "not-in-array" }),
		]);
		expect(rows).toEqual([
			{ item: expect.objectContaining({ id: "orphan" }), depth: 0, hasChildren: false },
		]);
	});
});

describe("visibleKnowledgeTreeRows", () => {
	it("hides descendants of a collapsed parent and keeps siblings", () => {
		const rows = buildKnowledgeTree([
			item({ id: "a", title: "A" }),
			item({ id: "a1", title: "A1", parentId: "a" }),
			item({ id: "a1a", title: "A1a", parentId: "a1" }),
			item({ id: "b", title: "B" }),
		]);
		const visible = visibleKnowledgeTreeRows(rows, new Set(["a"]));
		expect(visible.map((r) => r.item.id)).toEqual(["a", "b"]);
	});
});
