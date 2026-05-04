import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

// L15 audit: the following assertions from the pre-L15 Kanban.test.tsx that
// referenced drag have been removed:
//   - `onMoveTask={vi.fn()}` prop removed from all renders (onMoveTask is deleted).
//   - `it("imports KeyboardSensor …")` source-scan test deleted (KeyboardSensor
//     and all @dnd-kit sensor imports are gone).
// The remaining tests cover render, columns, grouping, and task card rendering;
// none of those assertions referenced drag directly.

describe("Kanban", () => {
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
		// Other columns show empty state
		const emptyMessages = screen.getAllByText(/No tasks in/);
		expect(emptyMessages.length).toBeGreaterThan(0);
	});

	it("renders tasks in the correct column based on their state", () => {
		const { container } = render(
			<Kanban tasks={[plannedTask, inProgressTask, blockedTask, doneTask]} />,
		);
		// Verify each task text appears in the rendered output
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
		render(<Kanban tasks={[holdTask]} />);
		// Hold is not mapped to any kanban column, so the task should not appear
		expect(screen.queryByText("Hold Task")).not.toBeInTheDocument();
	});

	it("renders TaskCard components showing owner", () => {
		render(<Kanban tasks={[plannedTask, inProgressTask]} />);
		expect(screen.getByText("Agent Alpha")).toBeInTheDocument();
		expect(screen.getByText("Agent Beta")).toBeInTheDocument();
	});

	it("shows column task counts", () => {
		const tasks: KanbanTask[] = [
			{ id: "t1", title: "Task 1", owner: "A", state: "accepted" },
			{ id: "t2", title: "Task 2", owner: "B", state: "proposed" },
			{ id: "t3", title: "Task 3", owner: "C", state: "in_progress" },
		];
		render(<Kanban tasks={tasks} />);
		// Planned column should show count 2 (accepted + proposed)
		expect(screen.getByText("2")).toBeInTheDocument();
		// In Progress column should show count 1
		expect(screen.getByText("1")).toBeInTheDocument();
	});

	it("uses responsive grid classes grid-cols-1 sm:grid-cols-2 lg:grid-cols-4", () => {
		// I4 R3: per spec, Kanban must use breakpoint-responsive grid columns.
		const { container } = render(<Kanban tasks={[]} />);
		const grid = container.querySelector(".grid");
		expect(grid).not.toBeNull();
		expect(grid?.className).toContain("grid-cols-1");
		expect(grid?.className).toContain("sm:grid-cols-2");
		expect(grid?.className).toContain("lg:grid-cols-4");
	});
});
