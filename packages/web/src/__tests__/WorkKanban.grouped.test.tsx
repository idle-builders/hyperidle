/**
 * J5 — Kanban tasks grouped by bet with collapsible group headers.
 *
 * AC: TaskCards grouped by bet under bet-name headers showing task count.
 *
 * @lore L15: drag is removed from the team-board Kanban; the prior
 * `onMoveTask` prop and `data-testid="draggable-task-…"` invariants are
 * gone. Each card is now wrapped in a TaskActionsMenu — the grouping
 * contract is unchanged.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../shell/Kanban";
import { Kanban } from "../shell/Kanban";

function noopHandlers(): Record<string, ReturnType<typeof vi.fn>> {
	return {
		onRequestStateChange: vi.fn(),
		onCancelPendingRequest: vi.fn(),
		onOpenThread: vi.fn(),
		onReplyInThread: vi.fn(),
		onSnooze24h: vi.fn(),
		onCopyLink: vi.fn(),
	};
}

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
		render(<Kanban tasks={[authTask, authTask2, dashTask]} {...noopHandlers()} groupByBet />);
		// authTask (accepted → planned) and authTask2 (in_progress) live in
		// different columns, so the Auth header appears twice (one per
		// column). Dashboard has a single task so it appears once.
		expect(screen.getAllByRole("button", { name: /Auth group/i }).length).toBe(2);
		expect(screen.getAllByRole("button", { name: /Dashboard group/i }).length).toBe(1);
	});

	it("bet group header shows task count for its column", () => {
		render(<Kanban tasks={[authTask, authTask2, dashTask]} {...noopHandlers()} groupByBet />);
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
		render(<Kanban tasks={[authTask, authTask2, dashTask]} {...noopHandlers()} groupByBet />);
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
		render(<Kanban tasks={[authTask, dashTask]} {...noopHandlers()} />);
		expect(screen.queryByRole("button", { name: /Auth group/i })).not.toBeInTheDocument();
	});

	it("renders each task card under its bet group", () => {
		// L15: drag is removed — replace the prior "draggable wrappers"
		// invariant with the equivalent "every task is rendered" contract.
		render(<Kanban tasks={[authTask, authTask2, dashTask]} {...noopHandlers()} groupByBet />);
		expect(screen.getByText("Login endpoint")).toBeInTheDocument();
		expect(screen.getByText("JWT refresh")).toBeInTheDocument();
		expect(screen.getByText("Widget layout")).toBeInTheDocument();
	});
});
