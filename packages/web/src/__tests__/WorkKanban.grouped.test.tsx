/**
 * J5 — Kanban tasks grouped by bet with collapsible group headers.
 *
 * AC: TaskCards grouped by bet under bet-name headers showing task count.
 * Drag behavior preserved within groups (dnd-kit wiring untouched).
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

describe("Kanban — bet grouping (J5)", () => {
	it("renders a bet group header per distinct bet (one per column the bet appears in)", () => {
		render(
			<Kanban
				tasks={[authTask, authTask2, dashTask]}
				onMoveTask={vi.fn()}
				groupByBet
			/>,
		);
		// authTask (accepted → planned) and authTask2 (in_progress) live in
		// different columns, so the Auth header appears twice (one per
		// column). Dashboard has a single task so it appears once.
		expect(screen.getAllByRole("button", { name: /Auth group/i }).length).toBe(2);
		expect(screen.getAllByRole("button", { name: /Dashboard group/i }).length).toBe(1);
	});

	it("bet group header shows task count for its column", () => {
		render(
			<Kanban
				tasks={[authTask, authTask2, dashTask]}
				onMoveTask={vi.fn()}
				groupByBet
			/>,
		);
		// Each of the two Auth headers shows 1 (one task in its column).
		// Dashboard shows 1.
		const authHeaders = screen.getAllByRole("button", { name: /Auth group/i });
		for (const header of authHeaders) {
			expect(header.textContent).toMatch(/1/);
		}
		const dashHeader = screen.getByRole("button", { name: /Dashboard group/i });
		expect(dashHeader.textContent).toMatch(/1/);
	});

	it("collapses/expands bet groups when header is clicked", async () => {
		const user = userEvent.setup();
		render(
			<Kanban
				tasks={[authTask, authTask2, dashTask]}
				onMoveTask={vi.fn()}
				groupByBet
			/>,
		);
		// Initially expanded: all titles visible
		expect(screen.getByText("Login endpoint")).toBeInTheDocument();
		expect(screen.getByText("Widget layout")).toBeInTheDocument();

		// Collapsing any Auth header toggles all Auth groups together.
		const [firstAuthHeader] = screen.getAllByRole("button", { name: /Auth group/i });
		await user.click(firstAuthHeader);

		// Auth collapsed → Auth tasks not visible, Dashboard still visible
		expect(screen.queryByText("Login endpoint")).not.toBeInTheDocument();
		expect(screen.queryByText("JWT refresh")).not.toBeInTheDocument();
		expect(screen.getByText("Widget layout")).toBeInTheDocument();
	});

	it("does not render bet group headers when groupByBet is false", () => {
		render(
			<Kanban
				tasks={[authTask, dashTask]}
				onMoveTask={vi.fn()}
			/>,
		);
		expect(screen.queryByRole("button", { name: /Auth group/i })).not.toBeInTheDocument();
	});

	it("preserves draggable wrappers for each task in groups", () => {
		// Drag behaviour contract: each task still carries its
		// `data-testid='draggable-task-…'` regardless of grouping.
		render(
			<Kanban
				tasks={[authTask, authTask2, dashTask]}
				onMoveTask={vi.fn()}
				groupByBet
			/>,
		);
		expect(screen.getByTestId("draggable-task-t1")).toBeInTheDocument();
		expect(screen.getByTestId("draggable-task-t2")).toBeInTheDocument();
		expect(screen.getByTestId("draggable-task-t3")).toBeInTheDocument();
	});
});
