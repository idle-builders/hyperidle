/**
 * L18 — TaskSheet thread tests.
 *
 * AC coverage:
 *  - task sheet renders thread inline (HostThreadSection with hostKind=task)
 *  - "Open thread" button is present for navigation (AC §621 — L15 affordance retained)
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../../shell/TaskSheet";
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

// L12: TaskSheet now renders ArtifactSection which calls useNavigate internally.
// Mock here so existing tests (which don't wrap in Router) continue to pass.
vi.mock("../../components/ArtifactSection", () => ({
	ArtifactSection: () => null,
	useArtifactOpen: () => vi.fn(),
}));

// AF12: mock useTaskSessions so the new Sessions section doesn't fire a real fetch.
vi.mock("../../hooks/useTaskSessions", () => ({
	useTaskSessions: vi.fn(() => ({ data: { sessions: [] }, isLoading: false, error: null })),
}));

const MOCK_TASK: KanbanTask = {
	id: "task-sheet-001",
	title: "Build the feature",
	owner: "Dev Agent",
	state: "in_progress",
	betTag: "BET-001",
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
		// the thread is now rendered inline. L9: button now navigates to /conversations/:threadId.
		expect(screen.getByRole("button", { name: /open thread/i })).toBeInTheDocument();

		// The inline thread section renders with hostKind=task
		expect(screen.getByTestId("host-thread-section")).toBeInTheDocument();
	});

	it("uses the Hearth elevated shadow token for floating sheet depth", () => {
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

		expect(screen.getByTestId("task-sheet")).toHaveClass("shadow-[var(--shadow-elevated)]");
	});
});
