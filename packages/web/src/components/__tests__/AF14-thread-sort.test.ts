/**
 * AF14 — AC1: Flat-list sort uses ISO lastActiveAt, not display timestamp string.
 *
 * The previous comparator did `Date.parse(a.timestamp)` where `timestamp` was
 * a relative display string like "5m" → NaN → id.localeCompare fallback.
 * The fix: ThreadItem gains `lastActiveAt: string` and the comparator uses it.
 *
 * These tests import the PRODUCTION comparator `compareThreadsByLastActive` from
 * ThreadSections so they test the real sort path — not a reimplemented inline copy.
 */

import { describe, expect, it } from "vitest";
import type { ThreadItem } from "../ThreadSections";
import { compareThreadsByLastActive } from "../ThreadSections";

// Build a minimal ThreadItem for testing the comparator.
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

describe("AF14 AC1 — compareThreadsByLastActive (production comparator)", () => {
	it("ThreadItem type accepts lastActiveAt as a string field", () => {
		// Static shape check — if ThreadItem doesn't have lastActiveAt, TypeScript
		// compile will fail and the test will not reach here.
		const item = makeFlatItem({ id: "t1", lastActiveAt: "2026-06-01T10:00:00.000Z" });
		expect(item.lastActiveAt).toBe("2026-06-01T10:00:00.000Z");
	});

	it("sorts DESC by lastActiveAt — most-recent first regardless of display timestamp", () => {
		// All three items have the SAME display timestamp ("5m") — the old comparator
		// would fall to id.localeCompare and produce wrong order.
		const items: ThreadItem[] = [
			makeFlatItem({ id: "c", lastActiveAt: "2026-01-01T08:00:00.000Z", timestamp: "5m" }),
			makeFlatItem({ id: "a", lastActiveAt: "2026-01-01T10:00:00.000Z", timestamp: "5m" }),
			makeFlatItem({ id: "b", lastActiveAt: "2026-01-01T09:00:00.000Z", timestamp: "5m" }),
		];

		const sorted = [...items].sort(compareThreadsByLastActive);

		expect(sorted.map((t) => t.id)).toEqual(["a", "b", "c"]);
	});

	it("id order with identical timestamps would differ from recency order (proves comparator is tested)", () => {
		// This test verifies that compareThreadsByLastActive produces a different
		// ordering than alphabetical id sort when ids and dates conflict.
		// If the comparator regresses to id.localeCompare, this test fails.
		const items: ThreadItem[] = [
			makeFlatItem({ id: "z-first", lastActiveAt: "2026-06-11T12:00:00.000Z", timestamp: "5m" }),
			makeFlatItem({ id: "a-second", lastActiveAt: "2026-06-11T11:00:00.000Z", timestamp: "5m" }),
			makeFlatItem({ id: "m-third", lastActiveAt: "2026-06-11T10:00:00.000Z", timestamp: "5m" }),
		];

		const sorted = [...items].sort(compareThreadsByLastActive);

		// "z-first" has latest lastActiveAt → first. "a-second" next. "m-third" last.
		// An id-sort would give: a-second, m-third, z-first (WRONG).
		expect(sorted.map((t) => t.id)).toEqual(["z-first", "a-second", "m-third"]);
	});

	it("falls back to id.localeCompare when lastActiveAt is unparseable", () => {
		const items: ThreadItem[] = [
			makeFlatItem({ id: "z", lastActiveAt: "not-a-date" }),
			makeFlatItem({ id: "a", lastActiveAt: "not-a-date" }),
			makeFlatItem({ id: "m", lastActiveAt: "not-a-date" }),
		];

		const sorted = [...items].sort(compareThreadsByLastActive);

		// NaN fallback: sort by id asc
		expect(sorted.map((t) => t.id)).toEqual(["a", "m", "z"]);
	});
});
