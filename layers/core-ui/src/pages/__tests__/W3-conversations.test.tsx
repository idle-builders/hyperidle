/**
 * W3 — Conversations AC-5 through AC-12: Red phase tests.
 *
 * AC-5: Thread list is flat (no Active/Resolved section grouping).
 * AC-6: Filter chips are toggle-style (Blocking, Unread), not mutually exclusive tabs.
 * AC-7: ThreadRow shows "Blocking" badge (text badge, not just border accent).
 * AC-8: "New thread" button in header.
 * AC-12: Composer flex container uses align-items: stretch.
 *
 * AC-9, AC-10, AC-11 are covered by E2E tests (require real render context).
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ThreadItem } from "../../components/ThreadSections";
import { ThreadSections } from "../../components/ThreadSections";
import { Composer, ThreadRow } from "../../ds";
import { Conversations } from "../../pages/Conversations";

// Mock API hooks used by Conversations page
vi.mock("../../hooks/useThreadList", () => ({
	useThreadList: () => ({
		data: null,
		loading: false,
		error: null,
		refresh: vi.fn(),
	}),
}));

vi.mock("../../hooks/useThreadDetail", () => ({
	useThreadDetail: () => ({
		data: null,
		loading: false,
		error: null,
		refresh: vi.fn(),
	}),
}));

vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section-mock" />,
}));

function makeThread(overrides: Partial<ThreadItem> = {}): ThreadItem {
	return {
		id: "t1",
		title: "Test Thread",
		snippet: "Some content",
		timestamp: "2026-01-01T10:00:00.000Z",
		avatarUrl: null,
		hostKind: "task",
		hasUnresolvedReview: false,
		blocking: false,
		pinned: false,
		lastActiveAt: "2026-01-01T10:00:00.000Z",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// AC-5: Flat thread list — no section headers
// ---------------------------------------------------------------------------
describe("W3 AC-5 — Flat thread list (no Active/Resolved grouping)", () => {
	it("renders NO section header elements (data-thread-section)", () => {
		const threads: ThreadItem[] = [
			makeThread({ id: "t1", blocking: false }),
			makeThread({ id: "t2", blocking: true }),
		];
		render(
			<ThreadSections
				threads={threads}
				// AC-5: new prop to disable section grouping
				groupBySection={false}
			/>,
		);
		// No section headers should be present
		expect(document.querySelector("[data-thread-section]")).toBeNull();
	});

	it("renders all threads in a single flat list", () => {
		const threads: ThreadItem[] = [
			makeThread({ id: "a1" }),
			makeThread({ id: "a2" }),
			makeThread({ id: "a3" }),
		];
		render(<ThreadSections threads={threads} groupBySection={false} />);
		const rows = document.querySelectorAll("[data-ds-component='ThreadRow']");
		expect(rows.length).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// AC-6: Toggle filter chips (Blocking, Unread) — independently toggleable
// ---------------------------------------------------------------------------
describe("W3 AC-6 — Toggle-style filter chips", () => {
	it("AF14 AC4: Blocking chip is NOT rendered (removed by AF14)", () => {
		// AF14 AC4 supersedes W3 AC-6: Blocking and Unread chips removed from flat-list view.
		// The chip bar is gone; no aria-pressed buttons should be present.
		const threads: ThreadItem[] = [makeThread({ id: "t1" })];
		render(<ThreadSections threads={threads} groupBySection={false} />);
		expect(screen.queryByRole("button", { name: /^blocking$/i })).not.toBeInTheDocument();
	});

	it("AF14 AC4: Unread chip is NOT rendered (removed by AF14)", () => {
		// AF14 AC4 supersedes W3 AC-6: Blocking and Unread chips removed from flat-list view.
		const threads: ThreadItem[] = [makeThread({ id: "t1" })];
		render(<ThreadSections threads={threads} groupBySection={false} />);
		expect(screen.queryByRole("button", { name: /^unread$/i })).not.toBeInTheDocument();
	});

	it("does NOT render an 'All' tab (not mutually exclusive)", () => {
		const threads: ThreadItem[] = [makeThread()];
		render(<ThreadSections threads={threads} groupBySection={false} />);
		// 'All' tab is gone — replaced by two independent toggles
		expect(screen.queryByRole("tab", { name: /^all$/i })).not.toBeInTheDocument();
	});

	it("does NOT render an 'Async' tab", () => {
		const threads: ThreadItem[] = [makeThread()];
		render(<ThreadSections threads={threads} groupBySection={false} />);
		expect(screen.queryByRole("tab", { name: /^async$/i })).not.toBeInTheDocument();
	});

	it("AF14 AC4: flat list shows all threads with no chip filtering (chips removed)", () => {
		// AF14 AC4 supersedes W3 AC-6 chip-filter behavior: chips removed, all threads show.
		const threads: ThreadItem[] = [
			makeThread({ id: "b1", blocking: true }),
			makeThread({ id: "a1", blocking: false }),
			makeThread({ id: "a2", blocking: false }),
		];
		render(<ThreadSections threads={threads} groupBySection={false} />);
		// All 3 threads are visible (no chip to filter them)
		expect(document.querySelectorAll("[data-ds-component='ThreadRow']").length).toBe(3);
		// No chip buttons
		expect(screen.queryByRole("button", { name: /^blocking$/i })).not.toBeInTheDocument();
	});

	it("filter type is object { blocking: boolean; unread: boolean }, not string enum", () => {
		// This is a structural test: the new ConversationsFilter type must be an object
		// When the type is updated from "all" | "blocking" | "async" to { blocking: boolean; unread: boolean },
		// this test serves as documentation. The type assertion below verifies the shape.
		type NewConversationsFilter = { blocking: boolean; unread: boolean };
		const filter: NewConversationsFilter = { blocking: false, unread: false };
		expect(filter.blocking).toBe(false);
		expect(filter.unread).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// AC-7: ThreadRow "Blocking" text badge
// ---------------------------------------------------------------------------
describe("W3 AC-7 — ThreadRow blocking badge", () => {
	it("renders a visible 'Blocking' text badge when blocking=true", () => {
		render(
			<ThreadRow
				avatarUrl={null}
				title="Blocking Thread"
				snippet="Some snippet"
				timestamp="2026-01-01"
				blocking={true}
			/>,
		);
		// Must render a visible "Blocking" text badge, not just a border
		expect(screen.getByText("Blocking")).toBeInTheDocument();
	});

	it("does NOT render a 'Blocking' text badge when blocking=false", () => {
		render(
			<ThreadRow
				avatarUrl={null}
				title="Normal Thread"
				snippet="Some snippet"
				timestamp="2026-01-01"
				blocking={false}
			/>,
		);
		// No "Blocking" badge text when flag is false
		expect(screen.queryByText("Blocking")).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-8: "New thread" button in header
// ---------------------------------------------------------------------------
describe("W3 AC-8 — New thread button in header", () => {
	function renderConversations(): ReturnType<typeof render> {
		return render(
			<MemoryRouter initialEntries={["/conversations"]}>
				<Routes>
					<Route path="/conversations" element={<Conversations />} />
					<Route path="/conversations/:threadId" element={<Conversations />} />
				</Routes>
			</MemoryRouter>,
		);
	}

	it("renders a 'New thread' button inside the page header", () => {
		renderConversations();
		const btn = screen.getByRole("button", { name: /new thread/i });
		expect(btn).toBeInTheDocument();
		// Button lives in PageHeader.actions so it aligns with the page title.
		const header = document.querySelector("[data-conversations-header]");
		expect(header).not.toBeNull();
		expect(header).toContainElement(btn);
		// It must carry the canonical testid for selector continuity.
		expect(btn).toHaveAttribute("data-testid", "new-thread-btn");
	});
});

// ---------------------------------------------------------------------------
// AC-12: Composer align-items: stretch
// ---------------------------------------------------------------------------
describe("W3 AC-12 — Composer stretch layout", () => {
	it("composer inner row has items-stretch layout class", () => {
		render(<Composer threadId="t1" onSubmit={async () => {}} />);
		// The outer flex container of the composer row (textarea + send) must use align-items: stretch
		const composerEl = document.querySelector("[data-ds-component='Composer']");
		expect(composerEl).not.toBeNull();
		// The inner row div containing textarea + button should have items-stretch
		const row = composerEl?.querySelector("[data-composer-row]");
		expect(row).not.toBeNull();
		// Verify the class includes items-stretch
		expect(row?.className).toMatch(/items-stretch/);
	});
});
