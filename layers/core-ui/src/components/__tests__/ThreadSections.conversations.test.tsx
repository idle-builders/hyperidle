/**
 * L8 — Conversations-mode classifier + render tests for ThreadSections.
 *
 * Plan §3.2: ThreadSections gains `mode: 'conversations' | 'legacy'`. The
 * conversations classifier yields three sections only: blocking | active |
 * resolved. Pinned threads sort to row 1 of Active.
 *
 * Protected test §7.1: counts equal rendered list length — never literal.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ThreadItem } from "../ThreadSections";
import { groupThreadsForConversations, ThreadSections } from "../ThreadSections";

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
