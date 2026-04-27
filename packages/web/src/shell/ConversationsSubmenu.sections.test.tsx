/**
 * L3 — Thread List / Queue Rendering. Section rendering tests (red phase).
 *
 * Covers ACs:
 *  - Sections render ThreadRow items under each header.
 *  - Header counts match rendered rows.
 *  - Section ordering: Pinned -> Blocking -> Reviews -> Chats -> Resolved.
 *  - Within each section: blocking-flagged first, then lastActivityAt desc.
 *  - Empty section still renders header + "(none)".
 *  - "X of N blocking" counter visible at top.
 *  - Pinned Coach/CoS thread sticky at top of Pinned section.
 *
 * The component under test does not yet exist; these tests must FAIL today.
 */

import type { ThreadListEntry } from "@hyperidle/shared";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConversationsSubmenu } from "./ConversationsSubmenu";

const NOW = Date.parse("2026-04-26T12:00:00.000Z");
const iso = (ms: number): string => new Date(ms).toISOString();

function makeThread(over: Partial<ThreadListEntry> = {}): ThreadListEntry {
	return {
		id: over.id ?? "t-default",
		kind: over.kind ?? "review",
		pinned: over.pinned ?? false,
		participants: over.participants ?? [],
		routedToActorId: over.routedToActorId ?? null,
		routedToActorRole: over.routedToActorRole ?? null,
		domainTag: over.domainTag ?? null,
		createdAt: over.createdAt ?? iso(NOW - 60_000),
		lastActivityAt: over.lastActivityAt ?? iso(NOW - 60_000),
		blocking: over.blocking ?? false,
		resolvedAt: over.resolvedAt ?? null,
		title: over.title ?? "Untitled",
		snippet: over.snippet ?? "",
		unread: over.unread ?? false,
	};
}

const FIXTURE: ThreadListEntry[] = [
	makeThread({
		id: "t-coach",
		kind: "chat",
		pinned: true,
		participants: ["seed-agent-cos"],
		title: "Coach checkpoint",
		lastActivityAt: iso(NOW - 1_000),
	}),
	makeThread({
		id: "t-pin-other",
		kind: "review",
		pinned: true,
		title: "Other pinned",
		lastActivityAt: iso(NOW - 5_000),
	}),
	makeThread({
		id: "t-blk-1",
		kind: "review",
		blocking: true,
		title: "Blocking older",
		lastActivityAt: iso(NOW - 30_000),
	}),
	makeThread({
		id: "t-blk-2",
		kind: "chat",
		blocking: true,
		title: "Blocking newer",
		lastActivityAt: iso(NOW - 10_000),
	}),
	makeThread({
		id: "t-rev-1",
		kind: "review",
		title: "Review oldest",
		lastActivityAt: iso(NOW - 80_000),
	}),
	makeThread({
		id: "t-rev-2",
		kind: "review",
		title: "Review newer",
		lastActivityAt: iso(NOW - 40_000),
	}),
	makeThread({
		id: "t-chat-1",
		kind: "chat",
		title: "Chat single",
		lastActivityAt: iso(NOW - 20_000),
	}),
	makeThread({
		id: "t-res-1",
		kind: "review",
		title: "Resolved recent",
		resolvedAt: iso(NOW - 3_600_000),
		lastActivityAt: iso(NOW - 3_600_000),
	}),
];

const ME = { id: "actor:ceo", role: "CEO" as const, domain_tags: [] };

function renderSubmenu(threads: ThreadListEntry[] = FIXTURE): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/conversations/review"]}>
			<ConversationsSubmenu threads={threads} me={ME} now={NOW} />
		</MemoryRouter>,
	);
}

describe("L3 — ConversationsSubmenu section rendering", () => {
	it("renders all five section headers in canonical order", () => {
		renderSubmenu();
		const headers = screen.getAllByTestId("section-header").map((h) => h.textContent ?? "");
		expect(headers[0]).toMatch(/^Pinned/i);
		expect(headers[1]).toMatch(/^Blocking/i);
		expect(headers[2]).toMatch(/^Reviews/i);
		expect(headers[3]).toMatch(/^Chats/i);
		expect(headers[4]).toMatch(/^Resolved/i);
		expect(headers).toHaveLength(5);
	});

	it("renders ThreadRow items under each section header with counts that match", () => {
		renderSubmenu();
		const sections: Record<string, number> = {
			pinned: 2,
			blocking: 2,
			reviews: 2,
			chats: 1,
			resolved: 1,
		};
		for (const [sectionId, expectedCount] of Object.entries(sections)) {
			const sectionEl = screen.getByTestId(`section-${sectionId}`);
			const rows = within(sectionEl).getAllByTestId(`thread-row-${sectionId}`);
			expect(rows).toHaveLength(expectedCount);
			const countBadge = within(sectionEl).getByTestId(`section-count-${sectionId}`);
			expect(countBadge.textContent).toBe(String(expectedCount));
		}
	});

	it("sorts non-blocking review threads by lastActivityAt desc and routes blocking rows to Blocking section", () => {
		// L3 review (adversary C5): the prior `useBlockingSection >= 2` gate
		// is gone. Even a single blocker creates the Blocking section, so
		// the blocking row leaves Reviews entirely.
		const threads: ThreadListEntry[] = [
			makeThread({ id: "r-norm-old", kind: "review", lastActivityAt: iso(NOW - 30_000) }),
			makeThread({
				id: "r-blk",
				kind: "review",
				blocking: true,
				lastActivityAt: iso(NOW - 90_000),
			}),
			makeThread({ id: "r-norm-new", kind: "review", lastActivityAt: iso(NOW - 10_000) }),
		];
		renderSubmenu(threads);
		const reviews = screen.getByTestId("section-reviews");
		const reviewIds = within(reviews)
			.getAllByTestId("thread-row-reviews")
			.map((r) => r.getAttribute("data-thread-id"));
		// Non-blocking newest -> oldest within Reviews.
		expect(reviewIds).toEqual(["r-norm-new", "r-norm-old"]);
		const blocking = screen.getByTestId("section-blocking");
		const blockingIds = within(blocking)
			.getAllByTestId("thread-row-blocking")
			.map((r) => r.getAttribute("data-thread-id"));
		expect(blockingIds).toEqual(["r-blk"]);
	});

	it("renders empty section header with '(none)' muted text and never hides the header", () => {
		const noResolved = FIXTURE.filter((t) => t.resolvedAt === null);
		renderSubmenu(noResolved);
		const resolved = screen.getByTestId("section-resolved");
		expect(within(resolved).getByTestId("section-header")).toBeInTheDocument();
		expect(within(resolved).getByText(/\(none\)/i)).toBeInTheDocument();
		// Count badge for empty section reads 0.
		expect(within(resolved).getByTestId("section-count-resolved").textContent).toBe("0");
	});

	it("renders the 'X of N blocking' counter at the top of the conversations view", () => {
		renderSubmenu();
		const counter = screen.getByTestId("blocking-counter");
		// 2 blocking total in the fixture; with no selection the position is "—".
		expect(counter.textContent).toMatch(/of\s*2\s*blocking/i);
	});

	it("places the Coach/CoS thread first within the Pinned section", () => {
		renderSubmenu();
		const pinned = screen.getByTestId("section-pinned");
		const ids = within(pinned)
			.getAllByTestId("thread-row-pinned")
			.map((r) => r.getAttribute("data-thread-id"));
		expect(ids[0]).toBe("t-coach");
	});

	it("uses tabular numerals on the blocking counter (AQ-006)", () => {
		renderSubmenu();
		const counter = screen.getByTestId("blocking-counter");
		const styles = window.getComputedStyle(counter);
		// Tailwind/CSS variable classes resolve to fontVariantNumeric or numericVariant
		const tabular =
			counter.className.includes("tabular") ||
			counter.style.fontVariantNumeric === "tabular-nums" ||
			styles.fontVariantNumeric.includes("tabular");
		expect(tabular).toBe(true);
	});
});
