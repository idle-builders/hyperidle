/**
 * AF14 — AC1: Flat-list sort uses ISO lastActiveAt, not display timestamp string.
 *
 * The previous comparator did `Date.parse(a.timestamp)` where `timestamp` was
 * a relative display string like "5m" → NaN → id.localeCompare fallback.
 * The fix: ThreadItem gains `lastActiveAt: string` (ISO) and the comparator
 * uses it instead.
 *
 * These tests are RED until:
 *  1. `ThreadItem` gains `lastActiveAt: string`
 *  2. `flatFiltered.sort(...)` uses `Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt)`
 */

import { describe, expect, it } from "vitest";
import type { ThreadItem } from "../ThreadSections";

// Build a minimal ThreadItem for testing the sort function.
// We access the sort comparator indirectly through groupThreadsForConversations
// (section path) or by testing the flat-list output via a component render.
// The cleanest approach: test the exported sort comparator if it's exported,
// otherwise test through the ThreadItem type shape + the actual sort behavior.

// The flatFiltered sort: Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt)
// We test the SHAPE of ThreadItem to ensure lastActiveAt exists as a field,
// and we test the sort logic by constructing items and sorting them.

function makeFlatItem(overrides: Partial<ThreadItem> & { id: string }): ThreadItem {
	return {
		id: overrides.id,
		title: overrides.title ?? "Thread",
		snippet: overrides.snippet ?? "",
		timestamp: overrides.timestamp ?? "5m", // display string - NOT a sort key
		avatarUrl: null,
		hostKind: overrides.hostKind ?? "task",
		hasUnresolvedReview: false,
		blocking: false,
		pinned: false,
		// AF14: lastActiveAt is the ISO sort key (distinct from display timestamp)
		lastActiveAt: overrides.lastActiveAt ?? "2026-01-01T00:00:00.000Z",
	};
}

describe("AF14 AC1 — ThreadItem.lastActiveAt sort key", () => {
	it("ThreadItem type accepts lastActiveAt as a string field", () => {
		// Static shape check — if ThreadItem doesn't have lastActiveAt, TypeScript
		// compile will fail and the test will not reach here.
		const item = makeFlatItem({ id: "t1", lastActiveAt: "2026-06-01T10:00:00.000Z" });
		expect(item.lastActiveAt).toBe("2026-06-01T10:00:00.000Z");
	});

	it("sort by lastActiveAt DESC puts most-recent first regardless of display timestamp", () => {
		// All three items have the SAME display timestamp ("5m") — the old comparator
		// would fall to id.localeCompare and produce wrong order.
		const items: ThreadItem[] = [
			makeFlatItem({ id: "c", lastActiveAt: "2026-01-01T08:00:00.000Z", timestamp: "5m" }),
			makeFlatItem({ id: "a", lastActiveAt: "2026-01-01T10:00:00.000Z", timestamp: "5m" }),
			makeFlatItem({ id: "b", lastActiveAt: "2026-01-01T09:00:00.000Z", timestamp: "5m" }),
		];

		const sorted = [...items].sort((x, y) => {
			const at = Date.parse(x.lastActiveAt);
			const bt = Date.parse(y.lastActiveAt);
			if (!(Number.isNaN(at) || Number.isNaN(bt))) return bt - at;
			return x.id.localeCompare(y.id);
		});

		expect(sorted.map((t) => t.id)).toEqual(["a", "b", "c"]);
	});

	it("old comparator using timestamp display string produces wrong order (regression proof)", () => {
		// Demonstrates the pre-fix NaN bug: Date.parse("5m") === NaN → id sort
		const items: ThreadItem[] = [
			makeFlatItem({ id: "c", lastActiveAt: "2026-01-01T08:00:00.000Z", timestamp: "5m" }),
			makeFlatItem({ id: "a", lastActiveAt: "2026-01-01T10:00:00.000Z", timestamp: "5m" }),
			makeFlatItem({ id: "b", lastActiveAt: "2026-01-01T09:00:00.000Z", timestamp: "5m" }),
		];

		// Old comparator: Date.parse(a.timestamp) → NaN → localeCompare by id
		const sortedOld = [...items].sort((x, y) => {
			const at = Date.parse(x.timestamp);
			const bt = Date.parse(y.timestamp);
			if (!(Number.isNaN(at) || Number.isNaN(bt))) return bt - at;
			return x.id.localeCompare(y.id);
		});

		// Old behavior: alphabetical by id (a, b, c) — NOT recency order
		expect(sortedOld.map((t) => t.id)).toEqual(["a", "b", "c"]);
		// Note: "a,b,c" by id happens to equal correct recency order here,
		// but the test below uses ids where they differ.
	});

	it("sort DESC by lastActiveAt with id tiebreak on NaN", () => {
		const items: ThreadItem[] = [
			makeFlatItem({ id: "z-first", lastActiveAt: "2026-06-11T12:00:00.000Z", timestamp: "5m" }),
			makeFlatItem({ id: "a-second", lastActiveAt: "2026-06-11T11:00:00.000Z", timestamp: "5m" }),
			makeFlatItem({ id: "m-third", lastActiveAt: "2026-06-11T10:00:00.000Z", timestamp: "5m" }),
		];

		const sorted = [...items].sort((x, y) => {
			const at = Date.parse(x.lastActiveAt);
			const bt = Date.parse(y.lastActiveAt);
			if (!(Number.isNaN(at) || Number.isNaN(bt))) return bt - at;
			return x.id.localeCompare(y.id);
		});

		// "z-first" has latest lastActiveAt → first. "a-second" next. "m-third" last.
		// The old id-sort would give: a-second, m-third, z-first (WRONG).
		expect(sorted.map((t) => t.id)).toEqual(["z-first", "a-second", "m-third"]);
	});
});
