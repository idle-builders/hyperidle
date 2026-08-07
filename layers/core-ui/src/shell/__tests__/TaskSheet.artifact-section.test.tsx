/**
 * L12 — TaskSheet: ArtifactSection mount tests.
 *
 * AC coverage:
 *  - ArtifactSection mounts with filter={axis:"task", taskId}, layout="single", limit=1
 *  - no heading (so renders null when empty)
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

// AF12: mock useTaskSessions so the new Sessions section doesn't fire a real fetch.
vi.mock("../../hooks/useTaskSessions", () => ({
	useTaskSessions: vi.fn(() => ({ data: { sessions: [] }, isLoading: false, error: null })),
}));

// Mock ArtifactSection to capture props.
// useArtifactOpen must also be exported since TaskSheet calls it.
vi.mock("../../components/ArtifactSection", () => ({
	ArtifactSection: ({
		filter,
		layout,
		limit,
		heading,
	}: {
		filter: { axis: string; taskId?: string };
		layout: string;
		limit?: number;
		heading?: string;
	}) => (
		<div
			data-testid="artifact-section"
			data-filter-axis={filter.axis}
			data-filter-task-id={filter.axis === "task" ? filter.taskId : ""}
			data-layout={layout}
			data-limit={limit !== undefined ? String(limit) : "none"}
			data-heading={heading ?? ""}
		>
			ArtifactSection
		</div>
	),
	useArtifactOpen: () => vi.fn(),
}));

const MOCK_TASK: KanbanTask = {
	id: "task-l12-sheet",
	title: "Task sheet test",
	owner: "Dev Agent",
	state: "in_progress",
	betTag: "BET-L12",
};

function renderSheet(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<TaskSheet
				task={MOCK_TASK}
				open
				onClose={vi.fn()}
				resolveThreadId={vi.fn()}
				postRequest={vi.fn()}
				onNavigateToThread={vi.fn()}
			/>
		</MemoryRouter>,
	);
}

describe("TaskSheet ArtifactSection mount (L12)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("mounts ArtifactSection with task filter, single layout, and limit 1", () => {
		renderSheet();

		const section = screen.getByTestId("artifact-section");
		expect(section).toBeInTheDocument();
		expect(section).toHaveAttribute("data-filter-axis", "task");
		expect(section).toHaveAttribute("data-filter-task-id", "task-l12-sheet");
		expect(section).toHaveAttribute("data-layout", "single");
		expect(section).toHaveAttribute("data-limit", "1");
	});

	it("does not pass a heading to ArtifactSection (null-on-empty pattern)", () => {
		renderSheet();

		const section = screen.getByTestId("artifact-section");
		expect(section).toHaveAttribute("data-heading", "");
	});
});
