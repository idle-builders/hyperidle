/**
 * J5 — Kanban tasks grouped by bet with collapsible group headers.
 *
 * AC: TaskCards grouped by bet under bet-name headers showing task count.
 *
 * @lore L15: drag is deleted; the testid moves from `draggable-task-{id}`
 * to `task-card-{id}` (the card body itself, not a draggable wrapper).
 * `onMoveTask` is no longer a prop.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { KanbanTask } from "../shell/Kanban";
import { Kanban } from "../shell/Kanban";

const authTask: KanbanTask = {
	id: "t1",
	title: "Login endpoint",
	owner: "Dev A",
	ownerAgentId: "agent-dev-a",
	state: "accepted",
	betTag: "Auth",
};

const authTask2: KanbanTask = {
	id: "t2",
	title: "JWT refresh",
	owner: "Dev A",
	ownerAgentId: "agent-dev-a",
	state: "in_progress",
	betTag: "Auth",
};

const dashTask: KanbanTask = {
	id: "t3",
	title: "Widget layout",
	owner: "Dev B",
	ownerAgentId: "agent-dev-b",
	state: "in_progress",
	betTag: "Dashboard",
};

describe("Kanban — bet grouping (J5)", () => {
	it("renders a bet group header per distinct bet (one per column the bet appears in)", () => {
		render(<Kanban tasks={[authTask, authTask2, dashTask]} groupByBet />);
		expect(screen.getAllByRole("button", { name: /Auth group/i }).length).toBe(2);
		expect(screen.getAllByRole("button", { name: /Dashboard group/i }).length).toBe(1);
	});

	it("bet group header shows task count for its column", () => {
		render(<Kanban tasks={[authTask, authTask2, dashTask]} groupByBet />);
		const authHeaders = screen.getAllByRole("button", { name: /Auth group/i });
		for (const header of authHeaders) {
			expect(header.textContent).toMatch(/1/);
		}
		const dashHeader = screen.getByRole("button", { name: /Dashboard group/i });
		expect(dashHeader.textContent).toMatch(/1/);
	});

	it("collapses/expands bet groups when header is clicked", async () => {
		const user = userEvent.setup();
		render(<Kanban tasks={[authTask, authTask2, dashTask]} groupByBet />);
		expect(screen.getByText("Login endpoint")).toBeInTheDocument();
		expect(screen.getByText("Widget layout")).toBeInTheDocument();

		const [firstAuthHeader] = screen.getAllByRole("button", { name: /Auth group/i });
		await user.click(firstAuthHeader);

		expect(screen.queryByText("Login endpoint")).not.toBeInTheDocument();
		expect(screen.queryByText("JWT refresh")).not.toBeInTheDocument();
		expect(screen.getByText("Widget layout")).toBeInTheDocument();
	});

	it("does not render bet group headers when groupByBet is false", () => {
		render(<Kanban tasks={[authTask, dashTask]} />);
		expect(screen.queryByRole("button", { name: /Auth group/i })).not.toBeInTheDocument();
	});

	it("renders task-card-{id} testids for every task in groups (L15: drag deleted)", () => {
		render(<Kanban tasks={[authTask, authTask2, dashTask]} groupByBet />);
		expect(screen.getByTestId("task-card-t1")).toBeInTheDocument();
		expect(screen.getByTestId("task-card-t2")).toBeInTheDocument();
		expect(screen.getByTestId("task-card-t3")).toBeInTheDocument();
		// And the legacy draggable-task-{id} testid is gone.
		expect(screen.queryByTestId("draggable-task-t1")).toBeNull();
	});
});
