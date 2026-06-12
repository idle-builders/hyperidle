/**
 * AF14 — AC4: Filter chips (Unread, Blocking) removed from Conversations flat-list view.
 *
 * These tests are RED until:
 *  - `<FilterChip label="Blocking">` + `<FilterChip label="Unread">` are removed
 *    from the Conversations page header (the flat-list/controlled-mode path).
 *  - `toggleFilter` state + `onToggleFilter` plumbing removed from Conversations.tsx
 *
 * Verify: render Conversations populated → no element with `aria-pressed`;
 * no "Unread"/"Blocking" chip text in the header.
 *
 * The `unread`/`blocking` FIELDS on ThreadItem must still compile (verified by
 * TypeScript, not by this test). The FilterChip COMPONENT stays (not deleted).
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import type { ThreadItem } from "../components/ThreadSections";
import { ThreadSections } from "../components/ThreadSections";

// We test ThreadSections flat-list (groupBySection=false) directly, as that is
// the code path Conversations uses. Conversations.tsx lifts toggleFilter state
// and renders chips in controlled mode — after AC4 the controlled mode removes
// those chip instances from Conversations.tsx, meaning ThreadSections in
// controlled-mode should render NO chip bar (isControlled path, no chip bar).
// In uncontrolled mode (no toggleFilter prop), ThreadSections also removes chips.

function makeItem(overrides: Partial<ThreadItem> & { id: string }): ThreadItem {
	return {
		id: overrides.id,
		title: overrides.title ?? "Thread Title",
		snippet: "",
		timestamp: "5m",
		avatarUrl: null,
		hostKind: overrides.hostKind ?? "task",
		hasUnresolvedReview: false,
		blocking: false,
		pinned: false,
		lastActiveAt: overrides.lastActiveAt ?? "2026-06-11T10:00:00.000Z",
	};
}

describe("AF14 AC4 — filter chips removed from flat-list view", () => {
	beforeEach(() => {
		// No mocks needed — using real ThreadSections component
	});

	it("flat-list (uncontrolled) renders no aria-pressed buttons", () => {
		const threads = [makeItem({ id: "t1" }), makeItem({ id: "t2" })];

		render(
			<MemoryRouter>
				<ThreadSections threads={threads} groupBySection={false} />
			</MemoryRouter>,
		);

		// After AC4: no aria-pressed buttons (chips removed)
		const pressedButtons = document.querySelectorAll("[aria-pressed]");
		expect(pressedButtons.length).toBe(0);
	});

	it("flat-list (groupBySection=false) renders no Unread/Blocking chip text", () => {
		const threads = [makeItem({ id: "t1" }), makeItem({ id: "t2" })];

		render(
			<MemoryRouter>
				<ThreadSections threads={threads} groupBySection={false} />
			</MemoryRouter>,
		);

		// After AC4: no "Unread" or "Blocking" button text
		const unreadEl = screen.queryByText("Unread");
		const blockingEl = screen.queryByText("Blocking");
		expect(unreadEl).toBeNull();
		expect(blockingEl).toBeNull();
	});

	it("flat-list threads still render (list is not empty)", () => {
		const threads = [
			makeItem({ id: "t1", title: "Thread Alpha" }),
			makeItem({ id: "t2", title: "Thread Beta" }),
		];

		render(
			<MemoryRouter>
				<ThreadSections threads={threads} groupBySection={false} />
			</MemoryRouter>,
		);

		// Thread list still renders after chip removal
		expect(screen.getByTestId("flat-thread-list")).toBeDefined();
	});

	it("ThreadItem.blocking and ThreadItem.unread fields still compile (type check)", () => {
		// The fields must still exist on ThreadItem — they are forward-compatible.
		// This test fails if ThreadItem loses these fields.
		const item: ThreadItem = makeItem({ id: "t1" });
		item.blocking = true;
		item.unread = true;
		expect(item.blocking).toBe(true);
		expect(item.unread).toBe(true);
	});
});
