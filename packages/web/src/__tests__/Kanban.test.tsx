import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
		const emptyMessages = screen.getAllByText(/No tasks in/);
		expect(emptyMessages.length).toBeGreaterThan(0);
	});

	it("renders tasks in the correct column based on their state", () => {
		const { container } = render(
			<Kanban tasks={[plannedTask, inProgressTask, blockedTask, doneTask]} />,
		);
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
		expect(screen.getByText("2")).toBeInTheDocument();
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

	// L15: drag layer is gone. The four following tests lock the no-drag
	// contract — the previous KeyboardSensor source-grep test was deleted in
	// L15 along with `Kanban.keyboard-drag.test.tsx` (see REMOVED-TESTS.md).
	it("L15: source no longer imports @dnd-kit/core (drag removed)", () => {
		const Filename = fileURLToPath(import.meta.url);
		const Dirname = dirname(Filename);
		const src = readFileSync(join(Dirname, "..", "shell", "Kanban.tsx"), "utf8");
		// Comments referencing the removed dependency are allowed; the runtime
		// import / hook usage must not reappear.
		expect(src).not.toMatch(/from\s+["']@dnd-kit\/core["']/);
		expect(src).not.toMatch(/\buseDraggable\s*\(/);
		expect(src).not.toMatch(/\buseDroppable\s*\(/);
		expect(src).not.toMatch(/\bnew\s+KeyboardSensor\b/);
	});

	it("L15: does not render any draggable wrappers", () => {
		const tasks: KanbanTask[] = [plannedTask, inProgressTask, blockedTask, doneTask];
		render(<Kanban tasks={tasks} />);
		expect(screen.queryAllByTestId(/^draggable-task-/)).toHaveLength(0);
	});

	it("L15: source no longer exports COLUMN_TO_STATE or resolveKanbanDrop", async () => {
		const mod = (await import("../shell/Kanban")) as Record<string, unknown>;
		expect(mod.COLUMN_TO_STATE).toBeUndefined();
		expect(mod.resolveKanbanDrop).toBeUndefined();
	});

	it("L15: invokes renderTaskActions for each visible task", () => {
		const renderActions = vi.fn((task: KanbanTask) => (
			<span data-testid={`action-${task.id}`}>menu</span>
		));
		render(
			<Kanban
				tasks={[plannedTask, inProgressTask, blockedTask, doneTask]}
				renderTaskActions={renderActions}
			/>,
		);
		expect(renderActions).toHaveBeenCalledTimes(4);
		expect(screen.getByTestId(`action-${plannedTask.id}`)).toBeInTheDocument();
		expect(screen.getByTestId(`action-${inProgressTask.id}`)).toBeInTheDocument();
	});
});
