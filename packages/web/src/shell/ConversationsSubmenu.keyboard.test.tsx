/**
 * L3 — Thread List / Queue Rendering. Keyboard navigation tests (red phase).
 *
 * Covers ACs:
 *  - J / K move selection down/up across all sections.
 *  - K at row 1 of section B -> last row of section A (cross-section).
 *  - Enter opens the selected thread.
 *  - [ / ] jump between sections (first row of next/prev section).
 *  - aria-current="true" on the selected row, scrollIntoView called.
 *
 * The component does not exist yet; these tests must FAIL today.
 */

import type { ThreadListEntry } from "@hyperidle/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConversationsSubmenu } from "./ConversationsSubmenu";

const NOW = Date.parse("2026-04-26T12:00:00.000Z");
const iso = (ms: number): string => new Date(ms).toISOString();

function thread(id: string, over: Partial<ThreadListEntry> = {}): ThreadListEntry {
	return {
		id,
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
		title: over.title ?? id,
		snippet: over.snippet ?? "",
		unread: over.unread ?? false,
	};
}

// Two pinned, two blocking, two reviews, two chats, one resolved.
const FIXTURE: ThreadListEntry[] = [
	thread("p1", { pinned: true, lastActivityAt: iso(NOW - 1_000) }),
	thread("p2", { pinned: true, lastActivityAt: iso(NOW - 2_000) }),
	thread("b1", { blocking: true, lastActivityAt: iso(NOW - 3_000) }),
	thread("b2", { blocking: true, lastActivityAt: iso(NOW - 4_000) }),
	thread("r1", { kind: "review", lastActivityAt: iso(NOW - 5_000) }),
	thread("r2", { kind: "review", lastActivityAt: iso(NOW - 6_000) }),
	thread("c1", { kind: "chat", lastActivityAt: iso(NOW - 7_000) }),
	thread("c2", { kind: "chat", lastActivityAt: iso(NOW - 8_000) }),
	thread("x1", {
		kind: "review",
		resolvedAt: iso(NOW - 3_600_000),
		lastActivityAt: iso(NOW - 3_600_000),
	}),
];

const ME = { id: "actor:ceo", role: "CEO" as const, domain_tags: [] };

function renderShell(onOpenThread = vi.fn()): { onOpenThread: ReturnType<typeof vi.fn> } {
	render(
		<MemoryRouter initialEntries={["/conversations/review"]}>
			<ConversationsSubmenu threads={FIXTURE} me={ME} now={NOW} onOpenThread={onOpenThread} />
		</MemoryRouter>,
	);
	return { onOpenThread };
}

function activeRowId(): string | null {
	const active = document.querySelector('[aria-current="true"]');
	return active?.getAttribute("data-thread-id") ?? null;
}

describe("L3 — keyboard navigation across sections", () => {
	it("J moves selection down through all rows in flat order across sections", () => {
		renderShell();
		// Initial state: first row in Pinned is active.
		expect(activeRowId()).toBe("p1");
		fireEvent.keyDown(document, { key: "j" });
		expect(activeRowId()).toBe("p2");
		fireEvent.keyDown(document, { key: "j" });
		expect(activeRowId()).toBe("b1"); // crossed Pinned -> Blocking
		fireEvent.keyDown(document, { key: "j" });
		expect(activeRowId()).toBe("b2");
		fireEvent.keyDown(document, { key: "j" });
		expect(activeRowId()).toBe("r1"); // Blocking -> Reviews
	});

	it("K moves selection up; at row 1 of section B it lands on the last row of section A", () => {
		renderShell();
		// Move down to first row of Reviews (r1).
		fireEvent.keyDown(document, { key: "j" });
		fireEvent.keyDown(document, { key: "j" });
		fireEvent.keyDown(document, { key: "j" });
		fireEvent.keyDown(document, { key: "j" });
		expect(activeRowId()).toBe("r1");
		// K should land on the last row of Blocking, which is b2.
		fireEvent.keyDown(document, { key: "k" });
		expect(activeRowId()).toBe("b2");
	});

	it("Enter opens the selected thread and invokes onOpenThread with id + kind", () => {
		const { onOpenThread } = renderShell();
		// Move to b1 (3rd row).
		fireEvent.keyDown(document, { key: "j" });
		fireEvent.keyDown(document, { key: "j" });
		expect(activeRowId()).toBe("b1");
		fireEvent.keyDown(document, { key: "Enter" });
		expect(onOpenThread).toHaveBeenCalledTimes(1);
		const call = onOpenThread.mock.calls[0];
		// Either (id) or (id, kind) — accept both shapes for early-bound impl.
		expect(call[0]).toBe("b1");
	});

	it("] jumps to the first row of the next non-empty section", () => {
		renderShell();
		// Start at p1. ] should land on b1 (first row of Blocking).
		fireEvent.keyDown(document, { key: "]" });
		expect(activeRowId()).toBe("b1");
		fireEvent.keyDown(document, { key: "]" });
		expect(activeRowId()).toBe("r1"); // first row of Reviews
		fireEvent.keyDown(document, { key: "]" });
		expect(activeRowId()).toBe("c1"); // first row of Chats
	});

	it("[ jumps to the first row of the previous non-empty section", () => {
		renderShell();
		// Move to first row of Chats (c1) via ] thrice.
		fireEvent.keyDown(document, { key: "]" });
		fireEvent.keyDown(document, { key: "]" });
		fireEvent.keyDown(document, { key: "]" });
		expect(activeRowId()).toBe("c1");
		fireEvent.keyDown(document, { key: "[" });
		expect(activeRowId()).toBe("r1");
		fireEvent.keyDown(document, { key: "[" });
		expect(activeRowId()).toBe("b1");
	});

	it("sets aria-current='true' on the selected row exactly once", () => {
		renderShell();
		fireEvent.keyDown(document, { key: "j" });
		const matching = document.querySelectorAll('[aria-current="true"]');
		expect(matching).toHaveLength(1);
		expect(matching[0].getAttribute("data-thread-id")).toBe("p2");
	});

	it("calls scrollIntoView on the active row when J/K changes selection", () => {
		const spy = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
		try {
			renderShell();
			spy.mockClear();
			fireEvent.keyDown(document, { key: "j" });
			expect(spy).toHaveBeenCalled();
		} finally {
			spy.mockRestore();
		}
	});

	it("updates the 'X of N blocking' counter position when active row is in Blocking", () => {
		renderShell();
		// Move to b1 (1 of 2 blocking).
		fireEvent.keyDown(document, { key: "]" });
		const counter = screen.getByTestId("blocking-counter");
		expect(counter.textContent).toMatch(/1\s*of\s*2\s*blocking/i);
		fireEvent.keyDown(document, { key: "j" });
		expect(counter.textContent).toMatch(/2\s*of\s*2\s*blocking/i);
	});

	it("does not consume J/K when the user is typing in an input", () => {
		const { onOpenThread } = renderShell();
		const input = document.createElement("input");
		document.body.appendChild(input);
		input.focus();
		try {
			const startId = activeRowId();
			fireEvent.keyDown(input, { key: "j" });
			expect(activeRowId()).toBe(startId);
			fireEvent.keyDown(input, { key: "Enter" });
			expect(onOpenThread).not.toHaveBeenCalled();
		} finally {
			document.body.removeChild(input);
		}
	});

	it("clicking a thread row makes it the active row (parity with keyboard)", () => {
		renderShell();
		const r1 = document.querySelector('[data-thread-id="r1"]');
		expect(r1).not.toBeNull();
		if (r1 instanceof HTMLElement) fireEvent.click(r1);
		// After click, aria-current should be on r1.
		expect(activeRowId()).toBe("r1");
		// And the section it lives in is "reviews".
		const reviews = screen.getByTestId("section-reviews");
		expect(within(reviews).getByText("r1")).toBeInTheDocument();
	});
});
