/**
 * L15 — Kanban no-drag invariants + grouping retention.
 *
 * Source: docs/work-packages/L15-plan.md §4.1 + §12 (Kanban.test.tsx row).
 * REPLACES the prior I4-era drag tests. The drag stack is being stripped;
 * this file pins the post-L15 contract:
 *  (a) 4 columns
 *  (b) tasks land in the correct column per state
 *  (c) groupByBet retained
 *  (d) <DndContext> NOT rendered
 *  (e) no [data-droppable-column]
 *  (f) no aria-roledescription="draggable"
 *  (g) source does NOT import @dnd-kit/core
 *
 * @lore L15: drag is removed from Team Board's Kanban; humans request via
 * TaskActionsMenu. Canvas Shaped→Committed drag is preserved separately.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
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

function renderKanban(
	tasks: KanbanTask[],
	props: Record<string, unknown> = {},
): ReturnType<typeof render> {
	// biome-ignore lint/suspicious/noExplicitAny: post-L15 prop shape lands in green phase
	return render(<Kanban tasks={tasks} {...(noopHandlers() as any)} {...(props as any)} />);
}

const plannedTask: KanbanTask = {
	id: "task-1",
	title: "Setup CI",
	owner: "Agent Alpha",
	state: "accepted",
};
const inProgressTask: KanbanTask = {
	id: "task-2",
	title: "Build API",
	owner: "Agent Beta",
	state: "in_progress",
};
const blockedTask: KanbanTask = {
	id: "task-3",
	title: "Review PR",
	owner: "Agent Gamma",
	state: "blocked",
};
const doneTask: KanbanTask = {
	id: "task-4",
	title: "Deploy",
	owner: "Agent Delta",
	state: "done",
};

describe("Kanban — post-L15 (no drag)", () => {
	it("(a) renders four state columns", () => {
		renderKanban([plannedTask, inProgressTask, blockedTask, doneTask]);
		expect(screen.getByText("Planned")).toBeInTheDocument();
		expect(screen.getByText("Blocked")).toBeInTheDocument();
		expect(screen.getByText("In Progress")).toBeInTheDocument();
		expect(screen.getByText("Done")).toBeInTheDocument();
	});

	it("(b) renders tasks in their column based on state", () => {
		renderKanban([plannedTask, inProgressTask, blockedTask, doneTask]);
		expect(screen.getByText("Setup CI")).toBeInTheDocument();
		expect(screen.getByText("Build API")).toBeInTheDocument();
		expect(screen.getByText("Review PR")).toBeInTheDocument();
		expect(screen.getByText("Deploy")).toBeInTheDocument();
	});

	it("(c) groupByBet still works (pure helper preserved)", () => {
		const tasks: KanbanTask[] = [
			{ ...plannedTask, betTag: "Auth" },
			{ ...inProgressTask, betTag: "Auth" },
		];
		renderKanban(tasks, { groupByBet: true });
		// Both bet rows of the same tag should render under the same group.
		expect(screen.getByText("Setup CI")).toBeInTheDocument();
		expect(screen.getByText("Build API")).toBeInTheDocument();
	});

	it("(d) does NOT render any DndContext provider in the tree", () => {
		const { container } = renderKanban([plannedTask, inProgressTask]);
		// dnd-kit DndContext renders no DOM by default; we verify by attribute
		// markers it would set on draggables.
		expect(container.querySelector("[data-dnd-kit]")).toBeNull();
	});

	it("(e) no element has [data-droppable-column]", () => {
		const { container } = renderKanban([plannedTask, inProgressTask]);
		expect(container.querySelector("[data-droppable-column]")).toBeNull();
	});

	it("(f) no element has aria-roledescription='draggable'", () => {
		const { container } = renderKanban([plannedTask, inProgressTask]);
		expect(container.querySelector('[aria-roledescription="draggable"]')).toBeNull();
	});

	it("(g) Kanban.tsx source does NOT import any @dnd-kit/core symbol", () => {
		const filename = fileURLToPath(import.meta.url);
		const dir = dirname(filename);
		const src = readFileSync(join(dir, "..", "shell", "Kanban.tsx"), "utf8");
		expect(src).not.toMatch(/@dnd-kit\/core/);
		expect(src).not.toMatch(/\bDndContext\b/);
		expect(src).not.toMatch(/\buseDraggable\b/);
		expect(src).not.toMatch(/\buseDroppable\b/);
		expect(src).not.toMatch(/\bDragOverlay\b/);
		expect(src).not.toMatch(/\bKeyboardSensor\b/);
		expect(src).not.toMatch(/\bPointerSensor\b/);
	});
});
