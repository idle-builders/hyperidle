/**
 * sortItems: pure ordering helper for DocumentList — updatedAt desc, tie-break
 * title asc.
 */

import { describe, expect, it } from "vitest";
// @lore exported-for-testability: sortItems is defined at module scope in DocumentList.tsx and exported for testability.
import { sortItems } from "../pages/DocumentList.js";

interface TestItem {
	id: string;
	title: string;
	updatedAt: string;
}

function item(id: string, updatedAt: string, opts: { title?: string } = {}): TestItem {
	return {
		id,
		title: opts.title ?? id,
		updatedAt,
	};
}

// Typed helper: run sortItems and return a TestItem[] for assertions.
// The `as any` cast is required because sortItems accepts the full DocumentRow
// shape; TestItem is a structural subset used only for these tests.
function sort(items: TestItem[]): TestItem[] {
	// biome-ignore lint/suspicious/noExplicitAny: TestItem is a structural subset of DocumentRow
	return sortItems(items as any) as TestItem[];
}

// ---------------------------------------------------------------------------
// Recency sort: updatedAt desc, tie-break title asc
// ---------------------------------------------------------------------------

describe("sortItems — recency", () => {
	it("orders by updatedAt descending", () => {
		const items = [
			item("b", "2024-01-02T00:00:00Z"),
			item("c", "2024-01-03T00:00:00Z"),
			item("a", "2024-01-01T00:00:00Z"),
		];
		const result = sort(items);
		expect(result.map((i) => i.id)).toEqual(["c", "b", "a"]);
	});

	it("tie-break by title ascending when updatedAt is equal", () => {
		// Architecture-critique SUGGESTION: lock the title tie-break
		const same = "2024-06-01T12:00:00Z";
		const items = [
			item("z-item", same, { title: "Zebra" }),
			item("a-item", same, { title: "Apple" }),
			item("m-item", same, { title: "Mango" }),
		];
		const result = sort(items);
		expect(result.map((i) => i.title)).toEqual(["Apple", "Mango", "Zebra"]);
	});

	it("does not mutate the input array", () => {
		const items = [item("b", "2024-01-02"), item("a", "2024-01-01")];
		const original = [...items];
		sort(items);
		expect(items).toEqual(original);
	});
});
