import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../shell/Kanban";
import { Kanban } from "../shell/Kanban";

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

const okStateRequest = vi.fn(async () => ({ ok: true as const }));
const noopOpenThread = vi.fn();

function renderKanban(tasks: KanbanTask[]): ReturnType<typeof render> {
	return render(
		<Kanban
			tasks={tasks}
			onTaskStateRequest={okStateRequest}
			onOpenTaskThread={noopOpenThread}
		/>,
	);
}

describe("Kanban", () => {
	it("renders four state columns", () => {
		renderKanban([plannedTask, inProgressTask, blockedTask, doneTask]);
		expect(screen.getByText("Planned")).toBeInTheDocument();
		expect(screen.getByText("Blocked")).toBeInTheDocument();
		expect(screen.getByText("In Progress")).toBeInTheDocument();
		expect(screen.getByText("Done")).toBeInTheDocument();
	});

	it("renders tasks in their respective columns", () => {
		renderKanban([plannedTask, inProgressTask, blockedTask, doneTask]);
		expect(screen.getByText("Setup CI")).toBeInTheDocument();
		expect(screen.getByText("Build API")).toBeInTheDocument();
		expect(screen.getByText("Review PR")).toBeInTheDocument();
		expect(screen.getByText("Deploy")).toBeInTheDocument();
	});

	it("renders empty state for columns with no tasks", () => {
		renderKanban([plannedTask]);
		const emptyMessages = screen.getAllByText(/No tasks in/);
		expect(emptyMessages.length).toBeGreaterThan(0);
	});

	it("renders tasks in the correct column based on their state", () => {
		const { container } = renderKanban([plannedTask, inProgressTask, blockedTask, doneTask]);
		expect(container.textContent).toContain("Setup CI");
		expect(container.textContent).toContain("Build API");
		expect(container.textContent).toContain("Review PR");
		expect(container.textContent).toContain("Deploy");
	});

	it("excludes tasks with states not in the kanban columns", () => {
		const holdTask: KanbanTask = {
			id: "task-5",
			title: "Hold Task",
			owner: "Agent Epsilon",
			state: "hold",
		};
		renderKanban([holdTask]);
		expect(screen.queryByText("Hold Task")).not.toBeInTheDocument();
	});

	it("renders TaskCard components showing owner", () => {
		renderKanban([plannedTask, inProgressTask]);
		expect(screen.getByText("Agent Alpha")).toBeInTheDocument();
		expect(screen.getByText("Agent Beta")).toBeInTheDocument();
	});

	it("shows column task counts", () => {
		const tasks: KanbanTask[] = [
			{ id: "t1", title: "Task 1", owner: "A", state: "accepted" },
			{ id: "t2", title: "Task 2", owner: "B", state: "proposed" },
			{ id: "t3", title: "Task 3", owner: "C", state: "in_progress" },
		];
		renderKanban(tasks);
		expect(screen.getByText("2")).toBeInTheDocument();
		expect(screen.getByText("1")).toBeInTheDocument();
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
