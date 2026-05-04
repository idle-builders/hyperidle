/**
 * L15 — Kanban no-drag contract tests.
 *
 * Proves drag infrastructure is structurally absent from Kanban:
 * - No DnD-Kit draggable wrappers (data-testid="draggable-task-*")
 * - No DnD-Kit droppable columns (data-droppable-column)
 * - No DnD-Kit ARIA role descriptors (aria-roledescription="draggable")
 * - Task card click raises onSelectTask callback
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../shell/Kanban";
import { Kanban } from "../shell/Kanban";

const tasks: KanbanTask[] = [
	{ id: "task-1", title: "Setup CI", owner: "Agent Alpha", state: "accepted" },
	{ id: "task-2", title: "Build API", owner: "Agent Beta", state: "in_progress" },
	{ id: "task-3", title: "Review PR", owner: "Agent Gamma", state: "blocked" },
	{ id: "task-4", title: "Deploy", owner: "Agent Delta", state: "done" },
];

describe("Kanban — no drag (L15)", () => {
	it("renders no draggable-task-* wrappers", () => {
		const { container } = render(<Kanban tasks={tasks} />);
		// Positive structural assertion: no DnD-Kit draggable wrapper elements.
		const draggables = container.querySelectorAll('[data-testid^="draggable-task-"]');
		expect(draggables).toHaveLength(0);
	});

	it("renders no data-droppable-column attributes", () => {
		const { container } = render(<Kanban tasks={tasks} />);
		// Positive structural assertion: no DnD-Kit droppable zones.
		const dropZones = container.querySelectorAll("[data-droppable-column]");
		expect(dropZones).toHaveLength(0);
	});

	it("renders no aria-roledescription='draggable' (no DnD-Kit sensor wired)", () => {
		const { container } = render(<Kanban tasks={tasks} />);
		// Positive structural assertion: DnD-Kit sensors are gone.
		const draggableRoles = container.querySelectorAll('[aria-roledescription="draggable"]');
		expect(draggableRoles).toHaveLength(0);
	});

	it("clicking a task card calls onSelectTask with the task id", async () => {
		const user = userEvent.setup();
		const onSelectTask = vi.fn();
		render(<Kanban tasks={tasks} onSelectTask={onSelectTask} />);

		// Click the first task card
		await user.click(screen.getByText("Setup CI"));

		expect(onSelectTask).toHaveBeenCalledOnce();
		expect(onSelectTask).toHaveBeenCalledWith("task-1");
	});

	it("clicking different task cards calls onSelectTask with correct ids", async () => {
		const user = userEvent.setup();
		const onSelectTask = vi.fn();
		render(<Kanban tasks={tasks} onSelectTask={onSelectTask} />);

		await user.click(screen.getByText("Build API"));
		expect(onSelectTask).toHaveBeenCalledWith("task-2");

		await user.click(screen.getByText("Review PR"));
		expect(onSelectTask).toHaveBeenCalledWith("task-3");
	});

	it("renders task titles in columns without drag wrappers", () => {
		render(<Kanban tasks={tasks} />);
		// All four tasks should appear in the kanban
		expect(screen.getByText("Setup CI")).toBeInTheDocument();
		expect(screen.getByText("Build API")).toBeInTheDocument();
		expect(screen.getByText("Review PR")).toBeInTheDocument();
		expect(screen.getByText("Deploy")).toBeInTheDocument();
	});

	it("empty columns show 'No tasks yet.' copy (not drag instruction)", () => {
		render(<Kanban tasks={[tasks[0]]} />);
		// Should NOT show "Drag tasks here" copy (AC: drag instruction removed)
		expect(screen.queryByText(/drag tasks here/i)).not.toBeInTheDocument();
	});
});
