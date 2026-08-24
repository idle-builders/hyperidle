/**
 * AF13 §3 — sortItems unit tests (red phase).
 *
 * sortItems is a pure helper to be added at module scope in KnowledgeList.tsx.
 * These tests define the exact ordering contract:
 *   - recency: updatedAt desc, tie-break title asc
 *   - frequency: accessCount30d desc null-last, tie-break updatedAt desc
 *   - relevance: relevanceScore desc null-last, tie-break updatedAt desc
 *
 * Tests will FAIL until sortItems is exported from KnowledgeList.tsx (or a
 * dedicated utility module). The test import path matches where the plan
 * places it; adjust if the builder locates it differently.
 *
 * SUGGESTION from architecture-critique: add a tie-break test with equal updatedAt
 * to lock the title tie-break — included here.
 */

import { describe, expect, it } from "vitest";
// @lore AF13: sortItems is defined at module scope in KnowledgeList.tsx and
// exported for testability. Import from the page file directly.
// If the builder locates it in a utility file, update this path.
import { sortItems } from "../pages/KnowledgeList.js";

interface TestItem {
	id: string;
	title: string;
	updatedAt: string;
	signals?: {
		relevanceScore?: number | null;
		accessCount30d?: number | null;
	} | null;
}

function item(
	id: string,
	updatedAt: string,
	opts: {
		title?: string;
		relevanceScore?: number | null;
		accessCount30d?: number | null;
	} = {},
): TestItem {
	return {
		id,
		title: opts.title ?? id,
		updatedAt,
		signals: {
			relevanceScore: opts.relevanceScore ?? null,
			accessCount30d: opts.accessCount30d ?? null,
		},
	};
}

// Typed helper: run sortItems and return a TestItem[] for assertions.
// The `as any` cast is required because sortItems accepts the full ApiKnowledgeItem
// shape; TestItem is a structural subset used only for these tests.
function sort(items: TestItem[]): TestItem[] {
	// biome-ignore lint/suspicious/noExplicitAny: TestItem is a structural subset of ApiKnowledgeItem
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

// ---------------------------------------------------------------------------
// Frequency sort: accessCount30d desc null-last, tie-break updatedAt desc
// ---------------------------------------------------------------------------
