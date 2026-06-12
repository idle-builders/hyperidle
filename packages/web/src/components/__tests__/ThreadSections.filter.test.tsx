/**
 * L10 — `ThreadSections` filter predicate tests.
 *
 * Covers acceptance criteria from TRACK-L L10:351–357 + plan §3:
 *   - submenu filter state is consumed by the thread list (closes the
 *     "set but never read" bug);
 *   - the real axis is blocking ↔ non-blocking (`'all' | 'blocking' | 'async'`);
 *   - filter narrows correctly; clearing restores the full list;
 *   - selected-thread interaction with filter is independent (selected row
 *     filtered out renders no `aria-current` row, no exception thrown).
 *
 * Red phase: imports `ConversationsFilter` + `predicateFor` which do not
 * yet exist in `ThreadSections.tsx`. These tests are expected to FAIL
 * until L10 implementation lands.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	type ConversationsFilter,
	predicateFor,
	type ThreadItem,
	ThreadSections,
} from "../ThreadSections";

const NOW = Date.parse("2026-04-30T12:00:00Z");
const AVATAR =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E";

const mk = (overrides: Partial<ThreadItem>): ThreadItem => ({
	id: overrides.id ?? "t1",
	title: overrides.title ?? "Default title",
	snippet: overrides.snippet ?? "Snippet",
	timestamp: overrides.timestamp ?? "just now",
	avatarUrl: overrides.avatarUrl ?? AVATAR,
	hostKind: overrides.hostKind ?? "task",
	hasUnresolvedReview: overrides.hasUnresolvedReview ?? false,
	blocking: overrides.blocking ?? false,
	pinned: overrides.pinned ?? false,
	resolvedAt: overrides.resolvedAt,
	lastActiveAt: overrides.lastActiveAt ?? "2026-04-30T12:00:00.000Z",
});

const FIXTURE: ThreadItem[] = [
	mk({ id: "b1", title: "API key needed", blocking: true }),
	mk({ id: "b2", title: "OAuth scopes review", blocking: true }),
	mk({ id: "a1", title: "Pricing experiment", blocking: false }),
	mk({ id: "a2", title: "Migration script", blocking: false }),
	mk({ id: "a3", title: "Doc cleanup", blocking: false }),
];

describe("predicateFor (L10 — closed `ConversationsFilter` vocabulary)", () => {
	it("'all' returns true for every thread", () => {
		const p = predicateFor("all");
		for (const t of FIXTURE) expect(p(t)).toBe(true);
	});

	it("'blocking' returns true only for `blocking === true`", () => {
		const p = predicateFor("blocking");
		expect(
			FIXTURE.filter(p)
				.map((t) => t.id)
				.sort(),
		).toEqual(["b1", "b2"]);
	});

	it("'async' returns true only for `blocking === false`", () => {
		const p = predicateFor("async");
		expect(
			FIXTURE.filter(p)
				.map((t) => t.id)
				.sort(),
		).toEqual(["a1", "a2", "a3"]);
	});

	it("type contract: every member of the closed union has a defined predicate", () => {
		const ids: ConversationsFilter[] = ["all", "blocking", "async"];
		for (const id of ids) {
			expect(typeof predicateFor(id)).toBe("function");
		}
	});
});

describe("ThreadSections — activeFilter prop narrows the rendered list", () => {
	it("renders all rows when activeFilter is 'all'", () => {
		const { container } = render(<ThreadSections threads={FIXTURE} now={NOW} activeFilter="all" />);
		const rows = container.querySelectorAll("[data-ds-component='ThreadRow']");
		expect(rows.length).toBe(FIXTURE.length);
	});

	it("renders only blocking rows when activeFilter is 'blocking'", () => {
		const { container } = render(
			<ThreadSections threads={FIXTURE} now={NOW} activeFilter="blocking" />,
		);
		const rows = container.querySelectorAll("[data-ds-component='ThreadRow']");
		expect(rows.length).toBe(2);
		// Async section header must not be rendered while blocking filter is active.
		expect(container.querySelector("[data-thread-section='active']")).toBeNull();
		expect(container.querySelector("[data-thread-section='resolved']")).toBeNull();
	});

	it("renders only async (non-blocking) rows when activeFilter is 'async'", () => {
		const { container } = render(
			<ThreadSections threads={FIXTURE} now={NOW} activeFilter="async" />,
		);
		const rows = container.querySelectorAll("[data-ds-component='ThreadRow']");
		expect(rows.length).toBe(3);
		// Blocking section must not be rendered while async filter is active.
		expect(container.querySelector("[data-thread-section='blocking']")).toBeNull();
	});

	it("defaults to 'all' when activeFilter is omitted (back-compat)", () => {
		const { container } = render(<ThreadSections threads={FIXTURE} now={NOW} />);
		const rows = container.querySelectorAll("[data-ds-component='ThreadRow']");
		expect(rows.length).toBe(FIXTURE.length);
	});
});

describe("ThreadSections — selected thread independence (L8 §5.7 preserved)", () => {
	it("filtered-out selected thread renders no aria-current row and does not throw", () => {
		// b1 is blocking — selecting it while activeFilter='async' must filter
		// the row out (Submenu hides it) without crashing.
		const { container } = render(
			<ThreadSections threads={FIXTURE} now={NOW} selectedId="b1" activeFilter="async" />,
		);
		expect(
			container.querySelector("[data-ds-component='ThreadRow'][aria-current='true']"),
		).toBeNull();
	});
});
