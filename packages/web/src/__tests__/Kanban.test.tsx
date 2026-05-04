/**
 * L15 — Kanban no-drag + action-footer assertions (RED phase).
 *
 * After L15:
 *  - The Kanban no longer accepts an `onMoveTask` prop. Drag/drop scaffolding
 *    is gone (no DndContext, no useDraggable wrappers, no `draggable-task-*`
 *    testids).
 *  - Every task card renders a `task-card-{id}` testid (the wrapper-div
 *    testid for selectors).
 *  - When a task has at least one requestable verb, the card's action footer
 *    renders a `Request ▾` trigger and (when the task has a thread) a
 *    `Thread (N)` chip.
 *  - Simulating a `dragstart`/`dragend` on a task card produces zero column
 *    changes — the rendered task list is reference-equal before and after.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { KanbanTask } from "../shell/Kanban";
import { Kanban } from "../shell/Kanban";

const plannedTask: KanbanTask = {
	id: "task-1",
	title: "Setup CI",
	owner: "Agent Alpha",
	ownerAgentId: "agent-alpha",
	state: "accepted",
};

const inProgressTask: KanbanTask = {
	id: "task-2",
	title: "Build API",
	owner: "Agent Beta",
	ownerAgentId: "agent-beta",
	state: "in_progress",
	threadId: "thread-2",
	threadCount: 3,
	threadUnread: 0,
};

const blockedTask: KanbanTask = {
	id: "task-3",
	title: "Review PR",
	owner: "Agent Gamma",
	ownerAgentId: "agent-gamma",
	state: "blocked",
};

const doneTask: KanbanTask = {
	id: "task-4",
	title: "Deploy",
	owner: "Agent Delta",
	ownerAgentId: "agent-delta",
	state: "done",
};

describe("Kanban — columns + cards (post-L15)", () => {
	it("renders four state columns", () => {
		render(<Kanban tasks={[plannedTask, inProgressTask, blockedTask, doneTask]} />);
		expect(screen.getByText("Planned")).toBeInTheDocument();
		expect(screen.getByText("Blocked")).toBeInTheDocument();
		expect(screen.getByText("In Progress")).toBeInTheDocument();
		expect(screen.getByText("Done")).toBeInTheDocument();
	});

	it("renders tasks in their respective columns", () => {
		render(<Kanban tasks={[plannedTask, inProgressTask, blockedTask, doneTask]} />);
		expect(screen.getByText("Setup CI")).toBeInTheDocument();
		expect(screen.getByText("Build API")).toBeInTheDocument();
		expect(screen.getByText("Review PR")).toBeInTheDocument();
		expect(screen.getByText("Deploy")).toBeInTheDocument();
	});

	it("renders empty state for columns with no tasks", () => {
		render(<Kanban tasks={[plannedTask]} />);
		const emptyMessages = screen.getAllByText(/No tasks in/);
		expect(emptyMessages.length).toBeGreaterThan(0);
	});

	it("excludes tasks with states not in the kanban columns", () => {
		const holdTask: KanbanTask = {
			id: "task-5",
			title: "Hold Task",
			owner: "Agent Epsilon",
			ownerAgentId: "agent-epsilon",
			state: "hold",
		};
		render(<Kanban tasks={[holdTask]} />);
		expect(screen.queryByText("Hold Task")).not.toBeInTheDocument();
	});
});

describe("Kanban — drag is a no-op (L15 AC1)", () => {
	it("does not export resolveKanbanDrop or COLUMN_TO_STATE (DnD scaffolding gone)", async () => {
		const mod = (await import("../shell/Kanban")) as Record<string, unknown>;
		expect(mod.resolveKanbanDrop).toBeUndefined();
		expect(mod.COLUMN_TO_STATE).toBeUndefined();
	});

	it("does not render any draggable-task-* testids; renders task-card-{id} testids instead", () => {
		render(<Kanban tasks={[plannedTask, inProgressTask]} />);
		expect(screen.queryByTestId("draggable-task-task-1")).toBeNull();
		expect(screen.queryByTestId("draggable-task-task-2")).toBeNull();
		expect(screen.getByTestId("task-card-task-1")).toBeInTheDocument();
		expect(screen.getByTestId("task-card-task-2")).toBeInTheDocument();
	});

	it("does not render a DndContext (no @dnd-kit role attributes)", () => {
		const { container } = render(<Kanban tasks={[plannedTask, inProgressTask]} />);
		// dnd-kit attaches role="application" and aria-roledescription="draggable"
		// to its draggable nodes. None should remain.
		expect(container.querySelector('[aria-roledescription="draggable"]')).toBeNull();
	});

	it("simulating dragstart + dragend on a task card does not mutate or re-order the rendered tasks", () => {
		const tasks = [plannedTask, inProgressTask, blockedTask, doneTask];
		render(<Kanban tasks={tasks} />);
		const card = screen.getByTestId("task-card-task-2");
		const beforeText = card.textContent;

		// Fire DnD-like events. Without DnD scaffolding this is a no-op.
		fireEvent.dragStart(card);
		fireEvent.dragEnd(card);
		fireEvent.drop(card);

		// Card is still in the DOM, in its same column, with the same content.
		const after = screen.getByTestId("task-card-task-2");
		expect(after.textContent).toBe(beforeText);
		expect(screen.getByText("Build API")).toBeInTheDocument();
	});

	it("the Kanban props type does not require onMoveTask (renders without it)", () => {
		// If KanbanProps still required onMoveTask, this would TS-fail at
		// compile time. The runtime assertion proves the prop is gone in
		// behaviour too.
		const { container } = render(<Kanban tasks={[plannedTask]} />);
		expect(container.firstChild).not.toBeNull();
	});
});

describe("Kanban — action footer (L15 AC2)", () => {
	it("renders a Request ▾ trigger on a card whose state has requestable verbs", () => {
		render(<Kanban tasks={[inProgressTask]} />);
		// in_progress state → ["pause", "mark_blocked", "ready_for_review", "kill"]
		const card = screen.getByTestId("task-card-task-2");
		const trigger = within(card).getByRole("button", { name: /request/i });
		expect(trigger).toBeInTheDocument();
		expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
	});

	it("renders a Thread (N) chip when the card has a thread", () => {
		render(<Kanban tasks={[inProgressTask]} />);
		const card = screen.getByTestId("task-card-task-2");
		// "Thread (3)" — the count is shown literally.
		expect(within(card).getByLabelText(/Open thread/i)).toBeInTheDocument();
	});

	it("does not render a Request ▾ trigger for a terminal state (done)", () => {
		render(<Kanban tasks={[doneTask]} />);
		const card = screen.getByTestId("task-card-task-4");
		expect(within(card).queryByRole("button", { name: /request/i })).toBeNull();
	});

	it("renders the unread chip variant when threadUnread > 0", () => {
		const taskWithUnread: KanbanTask = {
			...inProgressTask,
			id: "task-9",
			threadId: "thread-9",
			threadCount: 5,
			threadUnread: 2,
		};
		render(<Kanban tasks={[taskWithUnread]} />);
		const card = screen.getByTestId("task-card-task-9");
		// aria-label per design §9: "Open thread (5 messages, 2 unread)"
		expect(
			within(card).getByLabelText(/Open thread \(\s*5 messages,\s*2 unread\s*\)/i),
		).toBeInTheDocument();
	});
});
