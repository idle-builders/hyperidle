import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../shell/Kanban";
import { Kanban } from "../shell/Kanban";

const holdTask: KanbanTask = {
	id: "task-1",
	title: "Setup CI",
	owner: "Agent Alpha",
	state: "hold",
};

const inProgressTask: KanbanTask = {
	id: "task-2",
	title: "Build API",
	owner: "Agent Beta",
	state: "in_progress",
};

const reviewTask: KanbanTask = {
	id: "task-3",
	title: "Review PR",
	owner: "Agent Gamma",
	state: "review",
};

const doneTask: KanbanTask = {
	id: "task-4",
	title: "Deploy",
	owner: "Agent Delta",
	state: "done",
};

describe("Kanban", () => {
	it("renders four state columns", () => {
		render(
			<Kanban tasks={[holdTask, inProgressTask, reviewTask, doneTask]} onMoveTask={vi.fn()} />,
		);
		expect(screen.getByText("Hold")).toBeInTheDocument();
		expect(screen.getByText("In Progress")).toBeInTheDocument();
		expect(screen.getByText("Review")).toBeInTheDocument();
		expect(screen.getByText("Done")).toBeInTheDocument();
	});

	it("renders tasks in their respective columns", () => {
		render(
			<Kanban tasks={[holdTask, inProgressTask, reviewTask, doneTask]} onMoveTask={vi.fn()} />,
		);
		expect(screen.getByText("Setup CI")).toBeInTheDocument();
		expect(screen.getByText("Build API")).toBeInTheDocument();
		expect(screen.getByText("Review PR")).toBeInTheDocument();
		expect(screen.getByText("Deploy")).toBeInTheDocument();
	});

	it("renders empty state for columns with no tasks", () => {
		render(<Kanban tasks={[holdTask]} onMoveTask={vi.fn()} />);
		// blocked column empty state
		const emptyMessages = screen.getAllByText(/No tasks in/);
		expect(emptyMessages.length).toBeGreaterThan(0);
	});

	it("renders tasks in the correct column based on their state", () => {
		const { container } = render(
			<Kanban tasks={[holdTask, inProgressTask, reviewTask, doneTask]} onMoveTask={vi.fn()} />,
		);
		// Each column has a KanbanDropZone with a data-draggable for its tasks
		const holdDraggable = container.querySelector("[data-draggable='task-1']");
		const ipDraggable = container.querySelector("[data-draggable='task-2']");
		const reviewDraggable = container.querySelector("[data-draggable='task-3']");
		const doneDraggable = container.querySelector("[data-draggable='task-4']");
		expect(holdDraggable).not.toBeNull();
		expect(ipDraggable).not.toBeNull();
		expect(reviewDraggable).not.toBeNull();
		expect(doneDraggable).not.toBeNull();
		// Verify each task is in its respective column by checking text content proximity
		expect(holdDraggable?.textContent).toContain("Setup CI");
		expect(ipDraggable?.textContent).toContain("Build API");
		expect(reviewDraggable?.textContent).toContain("Review PR");
		expect(doneDraggable?.textContent).toContain("Deploy");
	});

	it("excludes tasks with states not in the kanban columns", () => {
		const proposedTask: KanbanTask = {
			id: "task-5",
			title: "Proposed Task",
			owner: "Agent Epsilon",
			state: "proposed",
		};
		render(<Kanban tasks={[proposedTask]} onMoveTask={vi.fn()} />);
		// Proposed is not a kanban column, so the task should not appear
		expect(screen.queryByText("Proposed Task")).not.toBeInTheDocument();
	});

	it("renders TaskCard components showing owner", () => {
		render(<Kanban tasks={[holdTask, inProgressTask]} onMoveTask={vi.fn()} />);
		expect(screen.getByText("Agent Alpha")).toBeInTheDocument();
		expect(screen.getByText("Agent Beta")).toBeInTheDocument();
	});

	it("shows column task counts", () => {
		const tasks: KanbanTask[] = [
			{ id: "t1", title: "Task 1", owner: "A", state: "hold" },
			{ id: "t2", title: "Task 2", owner: "B", state: "hold" },
			{ id: "t3", title: "Task 3", owner: "C", state: "in_progress" },
		];
		render(<Kanban tasks={tasks} onMoveTask={vi.fn()} />);
		// Hold column should show count 2
		expect(screen.getByText("2")).toBeInTheDocument();
		// In Progress column should show count 1
		expect(screen.getByText("1")).toBeInTheDocument();
	});
});
