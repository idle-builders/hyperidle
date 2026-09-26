/**
 * compareThreadsByLastActive sorts by ISO lastActiveAt, not the relative
 * display timestamp string ("5m") — Date.parse on that string is NaN.
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
		hostKind: overrides.hostKind ?? "team",
		hasUnresolvedReview: false,
		blocking: false,
		pinned: false,
		// AF14: lastActiveAt is the ISO sort key (distinct from display timestamp)
		lastActiveAt: overrides.lastActiveAt ?? "2026-01-01T00:00:00.000Z",
	};
}

describe("compareThreadsByLastActive", () => {
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
