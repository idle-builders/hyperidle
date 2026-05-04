/**
 * J5 — Kanban tasks grouped by bet under collapsible group headers.
 *
 * UPDATED FOR L15: drag is removed from the Kanban; the bet-grouping
 * structure stays. The legacy `data-testid='draggable-task-…'` assertion
 * is replaced with `screen.getByText(<title>)` because tasks are now
 * rendered without the draggable wrapper.
 *
 * Red phase: `<Kanban>` no longer accepts `onMoveTask`; the new contract
 * requires `onSubmitTaskRequest` + `onOpenTaskThread`.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../shell/Kanban";
import { Kanban } from "../shell/Kanban";

const authTask: KanbanTask = {
	id: "t1",
	title: "Login endpoint",
	owner: "Dev A",
	state: "accepted",
	betTag: "Auth",
};

const authTask2: KanbanTask = {
	id: "t2",
	title: "JWT refresh",
	owner: "Dev A",
	state: "in_progress",
	betTag: "Auth",
};

const dashTask: KanbanTask = {
	id: "t3",
	title: "Widget layout",
	owner: "Dev B",
	state: "in_progress",
	betTag: "Dashboard",
};

function renderGrouped(tasks: KanbanTask[]): ReturnType<typeof render> {
	return render(
		<Kanban
			tasks={tasks}
			onSubmitTaskRequest={vi.fn(async () => {})}
			onOpenTaskThread={vi.fn()}
			groupByBet
		/>,
	);
}

describe("Kanban — bet grouping (J5, drag-stripped per L15)", () => {
	it("renders a bet group header per distinct bet (one per column the bet appears in)", () => {
		renderGrouped([authTask, authTask2, dashTask]);
		expect(screen.getAllByRole("button", { name: /Auth group/i }).length).toBe(2);
		expect(screen.getAllByRole("button", { name: /Dashboard group/i }).length).toBe(1);
	});

	it("bet group header shows task count for its column", () => {
		renderGrouped([authTask, authTask2, dashTask]);
		const authHeaders = screen.getAllByRole("button", { name: /Auth group/i });
		for (const header of authHeaders) {
			expect(header.textContent).toMatch(/1/);
		}
		const dashHeader = screen.getByRole("button", { name: /Dashboard group/i });
		expect(dashHeader.textContent).toMatch(/1/);
	});

	it("collapses/expands bet groups when header is clicked", async () => {
		const user = userEvent.setup();
		renderGrouped([authTask, authTask2, dashTask]);
		expect(screen.getByText("Login endpoint")).toBeInTheDocument();
		expect(screen.getByText("Widget layout")).toBeInTheDocument();

		const [firstAuthHeader] = screen.getAllByRole("button", { name: /Auth group/i });
		await user.click(firstAuthHeader);

		expect(screen.queryByText("Login endpoint")).not.toBeInTheDocument();
		expect(screen.queryByText("JWT refresh")).not.toBeInTheDocument();
		expect(screen.getByText("Widget layout")).toBeInTheDocument();
	});

	it("does not render bet group headers when groupByBet is false", () => {
		render(
			<Kanban
				tasks={[authTask, dashTask]}
				onSubmitTaskRequest={vi.fn(async () => {})}
				onOpenTaskThread={vi.fn()}
			/>,
		);
		expect(screen.queryByRole("button", { name: /Auth group/i })).not.toBeInTheDocument();
	});

	it("renders each task title even though the draggable wrapper is gone (L15)", () => {
		renderGrouped([authTask, authTask2, dashTask]);
		expect(screen.getByText("Login endpoint")).toBeInTheDocument();
		expect(screen.getByText("JWT refresh")).toBeInTheDocument();
		expect(screen.getByText("Widget layout")).toBeInTheDocument();
		// L15: legacy draggable wrappers are gone.
		expect(screen.queryByTestId(/^draggable-task-/)).toBeNull();
	});
});
