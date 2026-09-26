/**
 * ThreadSections: the conversations-mode classifier (blocking/active/resolved
 * buckets, pinned-first sort), the activeFilter prop (all/blocking/async),
 * and the filter-empty state with its Clear-filter action.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
	type ConversationsFilter,
	groupThreadsForConversations,
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
	hostKind: overrides.hostKind ?? "team",
	hasUnresolvedReview: overrides.hasUnresolvedReview ?? false,
	blocking: overrides.blocking ?? false,
	pinned: overrides.pinned ?? false,
	resolvedAt: overrides.resolvedAt,
	lastActiveAt: overrides.lastActiveAt ?? "2026-04-30T12:00:00.000Z",
});

describe("groupThreadsForConversations classifier", () => {
	it("classifies threads into blocking/active/resolved buckets", () => {
		const within24h = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
		const threads: ThreadItem[] = [
			mk({ id: "b1", blocking: true }),
			mk({ id: "a1" }),
			mk({ id: "a2", hasUnresolvedReview: true }),
			mk({ id: "r1", resolvedAt: within24h }),
		];
		const sections = groupThreadsForConversations(threads, { now: NOW });
		const ids = (id: string): string[] =>
			sections.find((s) => s.id === id)?.items.map((i) => i.id) ?? [];
		expect(ids("blocking")).toEqual(["b1"]);
		expect(ids("active").sort()).toEqual(["a1", "a2"]);
		expect(ids("resolved")).toEqual(["r1"]);
	});

	it("renders sections in canonical order: blocking → active → resolved", () => {
		const within24h = new Date(NOW - 1 * 60 * 60 * 1000).toISOString();
		const threads: ThreadItem[] = [
			mk({ id: "r1", resolvedAt: within24h }),
			mk({ id: "a1" }),
			mk({ id: "b1", blocking: true }),
		];
		const sections = groupThreadsForConversations(threads, { now: NOW });
		expect(sections.map((s) => s.id)).toEqual(["blocking", "active", "resolved"]);
	});

	it("pinned thread sorts first within Active section", () => {
		const threads: ThreadItem[] = [
			mk({ id: "a1", hasUnresolvedReview: true }),
			mk({ id: "coach", pinned: true, hostKind: "user" }),
			mk({ id: "a2" }),
		];
		const sections = groupThreadsForConversations(threads, { now: NOW });
		const active = sections.find((s) => s.id === "active");
		expect(active?.items[0]?.id).toBe("coach"); // @lore AD8a: thread ID "coach" stays; route/type renamed in AD8b
	});

	it("re-opened blocking thread (resolved past 24h) lands in Active when not blocking", () => {
		const past = new Date(NOW - 30 * 60 * 60 * 1000).toISOString();
		const threads: ThreadItem[] = [mk({ id: "old", resolvedAt: past })];
		const sections = groupThreadsForConversations(threads, { now: NOW });
		const active = sections.find((s) => s.id === "active");
		expect(active?.items.map((i) => i.id)).toEqual(["old"]);
	});

	it("blocking outranks resolved if both flags present", () => {
		const within24h = new Date(NOW - 1 * 60 * 60 * 1000).toISOString();
		const threads: ThreadItem[] = [mk({ id: "x", blocking: true, resolvedAt: within24h })];
		const sections = groupThreadsForConversations(threads, { now: NOW });
		// Per design §2: resolved (within 24h) wins over blocking — resolved is the
		// terminal state. The plan §3.1 / approved.md §2 classification ladder:
		// resolved within 24h FIRST, then blocking. We assert this contract.
		const resolved = sections.find((s) => s.id === "resolved");
		expect(resolved?.items.map((i) => i.id)).toContain("x");
	});
});

describe("ThreadSections component", () => {
	const within24h = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
	const threads: ThreadItem[] = [
		mk({ id: "b1", title: "API key needed", blocking: true }),
		mk({
			id: "coach",
			title: "System Agent — weekly",
			pinned: true,
			hostKind: "user",
		}),
		mk({ id: "a1", title: "Pricing experiment" }),
		mk({ id: "a2", title: "Migration script", hasUnresolvedReview: true }),
		mk({ id: "r1", title: "Mobile dark mode shipped", resolvedAt: within24h }),
	];

	it("renders section headers for the three conversation buckets", () => {
		render(<ThreadSections threads={threads} now={NOW} />);
		expect(screen.getByRole("heading", { name: /blocking/i })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: /^active/i })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: /resolved/i })).toBeInTheDocument();
	});

	it("counts equal rendered list length — never literal", () => {
		// Protected test §7.1 (counts-derived-from-list).
		const { container } = render(<ThreadSections threads={threads} now={NOW} />);
		const sections = container.querySelectorAll("[data-thread-section]");
		expect(sections.length).toBe(3);
		// The actual recurrence guard: every section header count must match
		// the number of <ThreadRow> elements rendered in that section. With
		// the fixture (blocking=1, active=3, resolved=1), the legacy hardcoded
		// "3" and "1" can no longer survive in any header that disagrees
		// with its row count — the equality assertion below proves it.
		for (const sec of Array.from(sections)) {
			const rows = sec.querySelectorAll("[data-ds-component='ThreadRow']").length;
			const countText = sec.querySelector("[data-thread-section-count]")?.textContent ?? "";
			expect(countText).not.toBe("");
			expect(Number(countText)).toBe(rows);
		}
	});

	it("submenu title-bar count equals total rendered rows", () => {
		// The list-level count callback is the submenu title-bar's source —
		// a render-time prop the architect wires from the same data.
		const { container } = render(<ThreadSections threads={threads} now={NOW} />);
		const total = container.querySelectorAll("[data-ds-component='ThreadRow']").length;
		expect(total).toBe(threads.length);
	});

	it("section header count badge text equals the literal section size on a fixed fixture", () => {
		// Adversary M2: the prior section-level test is from-the-same-render
		// and tautological (header reads from items.length, rows render from
		// items.length — both pass with the same hardcoded literal injected
		// in either place). This test pins exact literals against an
		// independently-counted fixture: 2 blocking + 3 active + 1 resolved.
		// If a renderer ever hardcodes "3" (the old AppShell literal) into
		// any of these slots, this test fails because the expected literal
		// for blocking is 2 and resolved is 1.
		const within24h = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
		const fixed: ThreadItem[] = [
			mk({ id: "b1", blocking: true }),
			mk({ id: "b2", blocking: true }),
			mk({ id: "x1" }),
			mk({ id: "x2" }),
			mk({ id: "x3" }),
			mk({ id: "r1", resolvedAt: within24h }),
		];
		const { container } = render(<ThreadSections threads={fixed} now={NOW} />);
		const countOf = (sectionId: string): string =>
			container.querySelector(`[data-thread-section='${sectionId}'] [data-thread-section-count]`)
				?.textContent ?? "";
		expect(countOf("blocking")).toBe("2");
		expect(countOf("active")).toBe("3");
		expect(countOf("resolved")).toBe("1");
	});

	it("renders EmptyState when no threads provided", () => {
		render(<ThreadSections threads={[]} now={NOW} />);
		expect(screen.getByText(/no threads/i)).toBeInTheDocument();
	});

	it("renders Active 'Quiet' line when Active is empty but Blocking is present", () => {
		const onlyBlocking: ThreadItem[] = [mk({ id: "b1", blocking: true })];
		render(<ThreadSections threads={onlyBlocking} now={NOW} />);
		expect(screen.getByText(/quiet/i)).toBeInTheDocument();
	});

	it("Blocking section silently absent when no blocking threads", () => {
		const noneBlocking: ThreadItem[] = [mk({ id: "a1" })];
		const { container } = render(<ThreadSections threads={noneBlocking} now={NOW} />);
		expect(container.querySelector("[data-thread-section='blocking']")).toBeNull();
	});

	// UI-080: ThreadRow now renders as <a href> — navigation is via the link,
	// not via the onSelect callback. Verify that each row has an href pointing
	// to its conversation route.
	it("each thread row is an anchor with href to /conversations/:id", () => {
		const { container } = render(<ThreadSections threads={threads} now={NOW} />);
		const rows = Array.from(container.querySelectorAll("[data-ds-component='ThreadRow']"));
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(row.tagName.toLowerCase()).toBe("a");
			expect(row.getAttribute("href")).toMatch(/\/conversations\/.+/);
		}
	});

	it("renders skeleton rows while loading instead of EmptyState", () => {
		// Architecture C1: when loading=true the EmptyState must NOT flash.
		const { container } = render(<ThreadSections threads={[]} now={NOW} loading={true} />);
		expect(container.querySelector("[data-testid='thread-sections-loading']")).not.toBeNull();
		expect(container.querySelector("[data-testid='thread-sections-empty']")).toBeNull();
	});

	it("renders the blocking section", () => {
		const blocking: ThreadItem[] = [mk({ id: "b1", blocking: true })];
		const { container } = render(<ThreadSections threads={blocking} now={NOW} />);
		expect(container.querySelector("[data-thread-section='blocking']")).not.toBeNull();
	});

	it("marks the selected thread row with aria-current and the pinned row with the pin glyph", () => {
		const { container } = render(<ThreadSections threads={threads} now={NOW} selectedId="a1" />);
		const active = container.querySelector("[data-thread-section='active']") as HTMLElement;
		const selected = within(active)
			.getByLabelText(/Thread: Pricing experiment/i)
			.closest("[data-ds-component='ThreadRow']");
		expect(selected).toHaveAttribute("aria-current", "true");
		expect(within(active).getByLabelText(/Pinned/i)).toBeInTheDocument();
	});
});

describe("ThreadSections — flat mode (groupBySection=false)", () => {
	it("renders no section headers and shows every thread in one flat list", () => {
		const flat: ThreadItem[] = [
			mk({ id: "t1" }),
			mk({ id: "t2", blocking: true }),
			mk({ id: "t3" }),
		];
		const { container } = render(<ThreadSections threads={flat} groupBySection={false} />);
		expect(container.querySelector("[data-thread-section]")).toBeNull();
		expect(container.querySelectorAll("[data-ds-component='ThreadRow']")).toHaveLength(3);
	});
});

const FIXTURE: ThreadItem[] = [
	mk({ id: "b1", title: "API key needed", blocking: true }),
	mk({ id: "b2", title: "OAuth scopes review", blocking: true }),
	mk({ id: "a1", title: "Pricing experiment", blocking: false }),
	mk({ id: "a2", title: "Migration script", blocking: false }),
	mk({ id: "a3", title: "Doc cleanup", blocking: false }),
];

describe("predicateFor — closed `ConversationsFilter` vocabulary", () => {
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

describe("ThreadSections — selected thread independence", () => {
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

describe("ThreadSections — filter-empty EmptyState", () => {
	it("renders the filter-empty EmptyState when activeFilter='blocking' and no rows match", () => {
		const onlyAsync: ThreadItem[] = [
			mk({ id: "a1", blocking: false }),
			mk({ id: "a2", blocking: false }),
		];
		render(
			<ThreadSections
				threads={onlyAsync}
				now={NOW}
				activeFilter="blocking"
				onClearFilter={vi.fn()}
			/>,
		);
		const emptyState = screen.getByTestId("thread-sections-filter-empty");
		expect(emptyState).toBeInTheDocument();
		// Section regions must NOT be rendered alongside the filter-empty state.
		expect(screen.queryByRole("heading", { name: /blocking/i })).not.toBeInTheDocument();
	});

	it("renders chip-specific description copy for the 'blocking' filter", () => {
		render(
			<ThreadSections threads={[]} now={NOW} activeFilter="blocking" onClearFilter={vi.fn()} />,
		);
		const emptyState = screen.getByTestId("thread-sections-filter-empty");
		expect(emptyState.textContent ?? "").toMatch(/no blocking threads/i);
	});

	it("renders chip-specific description copy for the 'async' filter", () => {
		render(<ThreadSections threads={[]} now={NOW} activeFilter="async" onClearFilter={vi.fn()} />);
		const emptyState = screen.getByTestId("thread-sections-filter-empty");
		expect(emptyState.textContent ?? "").toMatch(/no async/i);
	});

	it("renders a Clear filter action button that invokes onClearFilter on click", async () => {
		const onClearFilter = vi.fn();
		const user = userEvent.setup();
		render(
			<ThreadSections
				threads={[]}
				now={NOW}
				activeFilter="blocking"
				onClearFilter={onClearFilter}
			/>,
		);
		const clearButton = screen.getByRole("button", { name: /clear filter/i });
		expect(clearButton).toBeInTheDocument();
		await user.click(clearButton);
		expect(onClearFilter).toHaveBeenCalledTimes(1);
	});

	it("does NOT render the filter-empty state when activeFilter='all' and the list is empty", () => {
		// activeFilter='all' on a globally empty list keeps the existing L8
		// "No threads yet" empty state — not the filter-empty variant.
		render(<ThreadSections threads={[]} now={NOW} activeFilter="all" />);
		expect(screen.queryByTestId("thread-sections-filter-empty")).not.toBeInTheDocument();
		expect(screen.getByTestId("thread-sections-empty")).toBeInTheDocument();
	});
});
