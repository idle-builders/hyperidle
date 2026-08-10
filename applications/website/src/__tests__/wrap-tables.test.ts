import { describe, expect, test } from "vitest";

import { rehypeWrapTables } from "../lib/wrap-tables.js";

interface Node {
	type: string;
	tagName?: string;
	properties?: Record<string, unknown>;
	children?: Node[];
}

function run(tree: Node): Node {
	rehypeWrapTables()(tree);
	return tree;
}

describe("rehypeWrapTables", () => {
	test("wraps a table in a scrollable .table-wrap div", () => {
		const table: Node = { type: "element", tagName: "table", children: [] };
		const tree: Node = {
			type: "root",
			children: [{ type: "element", tagName: "p", children: [] }, table],
		};
		run(tree);
		const wrapper = tree.children?.[1];
		expect(wrapper?.tagName).toBe("div");
		expect(wrapper?.properties?.className).toEqual(["table-wrap"]);
		expect(wrapper?.children?.[0]).toBe(table);
	});

	test("wraps nested tables too", () => {
		const table: Node = { type: "element", tagName: "table", children: [] };
		const tree: Node = {
			type: "root",
			children: [{ type: "element", tagName: "div", children: [table] }],
		};
		run(tree);
		expect(tree.children?.[0]?.children?.[0]?.tagName).toBe("div");
	});

	test("leaves trees without tables untouched", () => {
		const p: Node = { type: "element", tagName: "p", children: [] };
		const tree: Node = { type: "root", children: [p] };
		run(tree);
		expect(tree.children?.[0]).toBe(p);
	});
});
