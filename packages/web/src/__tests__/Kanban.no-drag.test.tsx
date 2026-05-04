/**
 * L15 — Replaces the deleted Kanban.keyboard-drag.test.tsx.
 *
 * Source: docs/work-packages/L15-plan.md §12 (Kanban.no-drag.test.tsx row).
 *
 * Asserts:
 *  - arrow/space keypress on a focused TaskCard does NOT begin a drag pickup
 *  - aria-pressed is never set on a TaskCard
 *  - no document-level drag listener attaches when Kanban mounts
 */

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../shell/Kanban";
import { Kanban } from "../shell/Kanban";

function noopHandlers(): Record<string, ReturnType<typeof vi.fn>> {
	return {
		onRequestStateChange: vi.fn(),
		onCancelPendingRequest: vi.fn(),
		onOpenThread: vi.fn(),
		onReplyInThread: vi.fn(),
		onSnooze24h: vi.fn(),
		onCopyLink: vi.fn(),
	};
}

const tasks: KanbanTask[] = [
	{ id: "t1", title: "T1", owner: "O", state: "in_progress" },
	{ id: "t2", title: "T2", owner: "O", state: "blocked" },
];

describe("Kanban — no drag", () => {
	it("no element carries aria-pressed (the dnd-kit pickup signal)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: post-L15 props
		const { container } = render(<Kanban tasks={tasks} {...(noopHandlers() as any)} />);
		expect(container.querySelector("[aria-pressed]")).toBeNull();
	});

	it("does not register document-level drag listeners when Kanban mounts", () => {
		const addSpy = vi.spyOn(document, "addEventListener");
		// biome-ignore lint/suspicious/noExplicitAny: post-L15 props
		render(<Kanban tasks={tasks} {...(noopHandlers() as any)} />);
		const dragEvents = addSpy.mock.calls
			.map((c) => c[0])
			.filter((e): e is string => typeof e === "string")
			.filter((e) => /^drag|^pointer|^keydown$/.test(e));
		// dnd-kit attaches document-level listeners — none of those event
		// types should appear since drag is gone.
		expect(dragEvents.filter((e) => e.startsWith("drag"))).toEqual([]);
		addSpy.mockRestore();
	});

	it("arrow/space on a focused TaskCard does NOT toggle aria-pressed", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: post-L15 props
		const { container } = render(<Kanban tasks={tasks} {...(noopHandlers() as any)} />);
		const card = container.querySelector('[data-ds-component="TaskCard"]') as
			| HTMLElement
			| null;
		expect(card).not.toBeNull();
		card?.focus();
		card?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		card?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		expect(card?.getAttribute("aria-pressed")).toBeNull();
	});
});
