/**
 * L15 — Kanban is now read-only. Drag is removed; the only mutation
 * affordances on a TaskCard are the `request state change` menu and the
 * `Open thread` row (both surfaced via `<TaskRequestMenu>` injected into the
 * TaskCard `actions` slot by `<KanbanTaskCardWithMenu>`).
 *
 * NOTE: This file replaces the prior I4 drag-asserting tests. The previous
 * `imports KeyboardSensor from @dnd-kit/core` test, the `COLUMN_TO_STATE`
 * round-trip test, and the `data-testid='draggable-task-…'` assumption have
 * all been REMOVED on purpose — those are the very contracts L15 strips out.
 * See `Kanban.no-dnd-import.test.ts` for the source-level tripwire that
 * pins the removal.
 *
 * Source of truth: `plans/L15-plan.md` §4.5 + AC-1 + protected tests §9.
 *
 * Red phase: `KanbanProps.onMoveTask` is still required and the test file
 * does not yet provide `onSubmitTaskRequest`/`onOpenTaskThread`, so every
 * render call fails the typechecker. Green phase swaps the contract.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../shell/Kanban";
import { groupTasksByBet, Kanban } from "../shell/Kanban";

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

const noopSubmit = vi.fn(async () => {});
const noopOpen = vi.fn();

function renderKanban(tasks: KanbanTask[], groupByBet?: boolean): ReturnType<typeof render> {
	return render(
		<Kanban
			tasks={tasks}
			onSubmitTaskRequest={noopSubmit}
			onOpenTaskThread={noopOpen}
			groupByBet={groupByBet}
		/>,
	);
}

describe("Kanban — read-only column rendering (L15)", () => {
	it("renders the four state columns", () => {
		renderKanban([plannedTask, inProgressTask, blockedTask, doneTask]);
		expect(screen.getByText("Planned")).toBeInTheDocument();
		expect(screen.getByText("Blocked")).toBeInTheDocument();
		expect(screen.getByText("In Progress")).toBeInTheDocument();
		expect(screen.getByText("Done")).toBeInTheDocument();
	});

	it("places each task in its column based on state", () => {
		renderKanban([plannedTask, inProgressTask, blockedTask, doneTask]);
		expect(screen.getByText("Setup CI")).toBeInTheDocument();
		expect(screen.getByText("Build API")).toBeInTheDocument();
		expect(screen.getByText("Review PR")).toBeInTheDocument();
		expect(screen.getByText("Deploy")).toBeInTheDocument();
	});

	it("renders empty state for columns with no tasks (no drag prompt)", () => {
		renderKanban([plannedTask]);
		const emptyMessages = screen.getAllByText(/No tasks in/);
		expect(emptyMessages.length).toBeGreaterThan(0);
		// L15 §4.5: the legacy "Drag tasks here…" copy is removed.
		expect(screen.queryByText(/Drag tasks here/)).not.toBeInTheDocument();
	});

	it("excludes tasks with states not mapped to columns (hold, killed)", () => {
		const holdTask: KanbanTask = {
			id: "task-5",
			title: "Hold Task",
			owner: "Agent Epsilon",
			state: "hold",
		};
		renderKanban([holdTask]);
		expect(screen.queryByText("Hold Task")).not.toBeInTheDocument();
	});

	it("uses responsive grid classes grid-cols-1 sm:grid-cols-2 lg:grid-cols-4", () => {
		const { container } = renderKanban([]);
		const grid = container.querySelector(".grid");
		expect(grid).not.toBeNull();
		expect(grid?.className).toContain("grid-cols-1");
		expect(grid?.className).toContain("sm:grid-cols-2");
		expect(grid?.className).toContain("lg:grid-cols-4");
	});
});

describe("Kanban — drag is a no-op on tasks (AC-1)", () => {
	it("does NOT render the legacy `data-testid='draggable-task-…'` wrapper around any task", () => {
		// The old wrapper was the smoking gun for `useDraggable`. After L15
		// the wrapper is gone entirely and the TaskCard is rendered raw inside
		// the column.
		renderKanban([plannedTask, inProgressTask]);
		expect(screen.queryByTestId(/^draggable-task-/)).toBeNull();
	});

	it("does NOT render any `data-droppable-column` zones (no useDroppable)", () => {
		const { container } = renderKanban([plannedTask, inProgressTask]);
		const droppable = container.querySelector("[data-droppable-column]");
		expect(droppable).toBeNull();
	});

	it("simulating a drag (pointerdown → pointermove → pointerup) is a no-op (no callback fires)", async () => {
		const onSubmit = vi.fn(async () => {});
		const onOpen = vi.fn();
		render(
			<Kanban
				tasks={[plannedTask, inProgressTask]}
				onSubmitTaskRequest={onSubmit}
				onOpenTaskThread={onOpen}
			/>,
		);
		const card = screen.getByText("Build API").closest("div");
		expect(card).not.toBeNull();
		if (card) {
			fireEvent.pointerDown(card, { clientX: 0, clientY: 0 });
			fireEvent.pointerMove(card, { clientX: 200, clientY: 0 });
			fireEvent.pointerUp(card, { clientX: 200, clientY: 0 });
		}
		// Read-only: NO mutation callback should fire from a drag attempt.
		expect(onSubmit).not.toHaveBeenCalled();
		expect(onOpen).not.toHaveBeenCalled();
	});
});

describe("Kanban — KanbanProps no longer carries onMoveTask (AC-1)", () => {
	it("the resolveKanbanDrop helper is no longer exported from the module", async () => {
		const mod = (await import("../shell/Kanban")) as Record<string, unknown>;
		// AC-1 (plan §4.5 + §9.1): both the helper AND the COLUMN_TO_STATE map
		// are deleted. Their continued existence is the regression smell.
		expect(mod.resolveKanbanDrop).toBeUndefined();
		expect(mod.COLUMN_TO_STATE).toBeUndefined();
	});
});

describe("Kanban — groupTasksByBet pure helper (preserved from J5)", () => {
	it("groups tasks by betTag preserving input order", () => {
		const tasks: KanbanTask[] = [
			{ id: "a", title: "A", owner: "x", state: "accepted", betTag: "Auth" },
			{ id: "b", title: "B", owner: "x", state: "accepted", betTag: "Dash" },
			{ id: "c", title: "C", owner: "x", state: "accepted", betTag: "Auth" },
		];
		const groups = groupTasksByBet(tasks);
		expect(groups.map((g) => g.bet)).toEqual(["Auth", "Dash"]);
		expect(groups[0].tasks.map((t) => t.id)).toEqual(["a", "c"]);
		expect(groups[1].tasks.map((t) => t.id)).toEqual(["b"]);
	});

	it("buckets unset betTag under 'Unassigned'", () => {
		const tasks: KanbanTask[] = [
			{ id: "a", title: "A", owner: "x", state: "accepted" },
			{ id: "b", title: "B", owner: "x", state: "accepted", betTag: "Auth" },
		];
		const groups = groupTasksByBet(tasks);
		expect(groups[0].bet).toBe("Unassigned");
		expect(groups[1].bet).toBe("Auth");
	});
});
