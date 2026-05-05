/**
 * L18 — TaskSheet thread tests.
 *
 * AC coverage:
 *  - task sheet renders thread inline (HostThreadSection with hostKind=task)
 *  - "Open thread" button is present for navigation (AC §621 — L15 affordance retained)
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../../shell/Kanban";
import { TaskSheet } from "../../shell/TaskSheet";

// Mock useHostThread so HostThreadSection renders without fetch calls
vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: vi.fn(() => ({
		data: null,
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	})),
}));

const MOCK_TASK: KanbanTask = {
	id: "task-sheet-001",
	title: "Build the feature",
	owner: "Dev Agent",
	state: "in_progress",
	betId: "bet-001",
	betTag: "BET-001",
	cost: "$5.00",
};

describe("TaskSheet thread (L18)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders thread inline; 'Open thread' button is present for navigation (AC §621)", () => {
		render(
			<TaskSheet
				task={MOCK_TASK}
				open
				onClose={vi.fn()}
				resolveThreadId={vi.fn()}
				postRequest={vi.fn()}
				onNavigateToThread={vi.fn()}
			/>,
		);

		// L18/L15: AC §621 requires the "Open thread" affordance to remain even though
		// the thread is now rendered inline. The button navigates to /conversations/chat.
		expect(screen.getByRole("button", { name: /open thread/i })).toBeInTheDocument();

		// The inline thread section renders with hostKind=task
		expect(screen.getByTestId("host-thread-section")).toBeInTheDocument();
	});
});
