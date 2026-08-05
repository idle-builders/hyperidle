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
function sort(items: TestItem[], by: "recency" | "frequency" | "relevance"): TestItem[] {
	// biome-ignore lint/suspicious/noExplicitAny: TestItem is a structural subset of ApiKnowledgeItem
	return sortItems(items as any, by) as TestItem[];
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
		const result = sort(items, "recency");
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
		const result = sort(items, "recency");
		expect(result.map((i) => i.title)).toEqual(["Apple", "Mango", "Zebra"]);
	});

	it("does not mutate the input array", () => {
		const items = [item("b", "2024-01-02"), item("a", "2024-01-01")];
		const original = [...items];
		sort(items, "recency");
		expect(items).toEqual(original);
	});
});

// ---------------------------------------------------------------------------
// Frequency sort: accessCount30d desc null-last, tie-break updatedAt desc
// ---------------------------------------------------------------------------

describe("sortItems — frequency", () => {
	it("orders by accessCount30d descending", () => {
		const items = [
			item("low", "2024-01-01", { accessCount30d: 2 }),
			item("high", "2024-01-01", { accessCount30d: 10 }),
			item("mid", "2024-01-01", { accessCount30d: 5 }),
		];
		const result = sort(items, "frequency");
		expect(result.map((i) => i.id)).toEqual(["high", "mid", "low"]);
	});

	it("sorts null accessCount30d items last", () => {
		const items = [
			item("no-score", "2024-01-03", { accessCount30d: null }),
			item("has-score", "2024-01-01", { accessCount30d: 1 }),
		];
		const result = sort(items, "frequency");
		expect(result[0]?.id).toBe("has-score");
		expect(result[1]?.id).toBe("no-score");
	});

	it("tie-break by updatedAt desc when accessCount30d is equal", () => {
		const items = [
			item("older", "2024-01-01", { accessCount30d: 5 }),
			item("newer", "2024-01-03", { accessCount30d: 5 }),
		];
		const result = sort(items, "frequency");
		expect(result[0]?.id).toBe("newer");
	});

	it("two null-score items fall back to updatedAt desc", () => {
		const items = [
			item("older-null", "2024-01-01", { accessCount30d: null }),
			item("newer-null", "2024-01-03", { accessCount30d: null }),
		];
		const result = sort(items, "frequency");
		expect(result[0]?.id).toBe("newer-null");
	});
});

// ---------------------------------------------------------------------------
// Relevance sort: relevanceScore desc null-last, tie-break updatedAt desc
// ---------------------------------------------------------------------------

describe("sortItems — relevance", () => {
	it("orders by relevanceScore descending", () => {
		const items = [
			item("low-rel", "2024-01-01", { relevanceScore: 0.2 }),
			item("high-rel", "2024-01-01", { relevanceScore: 0.9 }),
			item("mid-rel", "2024-01-01", { relevanceScore: 0.5 }),
		];
		const result = sort(items, "relevance");
		expect(result.map((i) => i.id)).toEqual(["high-rel", "mid-rel", "low-rel"]);
	});

	it("sorts null relevanceScore items last", () => {
		const items = [
			item("no-rel", "2024-01-03", { relevanceScore: null }),
			item("has-rel", "2024-01-01", { relevanceScore: 0.1 }),
		];
		const result = sort(items, "relevance");
		expect(result[0]?.id).toBe("has-rel");
		expect(result[1]?.id).toBe("no-rel");
	});

	it("two null-relevance items fall back to updatedAt desc", () => {
		const items = [
			item("null-old", "2024-01-01", { relevanceScore: null }),
			item("null-new", "2024-06-01", { relevanceScore: null }),
		];
		const result = sort(items, "relevance");
		expect(result[0]?.id).toBe("null-new");
	});

	it("returns a new array (does not sort in place)", () => {
		const items = [
			item("b", "2024-01-02", { relevanceScore: 0.1 }),
			item("a", "2024-01-01", { relevanceScore: 0.9 }),
		];
		const copy = [...items];
		sort(items, "relevance");
		expect(items[0]?.id).toBe(copy[0]?.id); // original not mutated
	});
});
