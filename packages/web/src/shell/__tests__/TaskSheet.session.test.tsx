/**
 * L19 — TaskSheet session metadata tests (red phase).
 *
 * AC coverage:
 *  - KanbanTask with session metadata → session section rendered with outcome chip, tokens, jump-out link
 *  - KanbanTask without session metadata → session section not rendered
 *  - KanbanTask with malformed harness URL → jump-out link not rendered but outcome chip is
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../../shell/TaskSheet";
import { TaskSheet } from "../../shell/TaskSheet";

// Mock useHostThread so HostThreadSection renders without fetch calls.
vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: vi.fn(() => ({
		data: null,
		error: null,
		isLoading: false,
		refresh: vi.fn(),
	})),
}));

// Mock ArtifactSection (L12) which uses useNavigate internally.
vi.mock("../../components/ArtifactSection", () => ({
	ArtifactSection: () => null,
}));

// AF12: mock useTaskSessions so the new Sessions section doesn't fire a real fetch.
vi.mock("../../hooks/useTaskSessions", () => ({
	useTaskSessions: vi.fn(() => ({ data: { sessions: [] }, isLoading: false, error: null })),
}));

const BASE_TASK: KanbanTask = {
	id: "task-session-001",
	title: "Build the pipeline",
	owner: "Dev Agent",
	state: "in_progress",
};

function makeProps(taskOverrides: Partial<KanbanTask> = {}): Parameters<typeof TaskSheet>[0] {
	return {
		task: { ...BASE_TASK, ...taskOverrides },
		open: true,
		onClose: vi.fn(),
		resolveThreadId: vi.fn().mockResolvedValue("thread-001"),
		postRequest: vi.fn().mockResolvedValue(undefined),
		onNavigateToThread: vi.fn(),
	};
}

describe("TaskSheet — session metadata (L19)", () => {
	it("KanbanTask with session metadata → session section rendered with outcome chip, tokens, jump-out link", () => {
		render(
			<TaskSheet
				{...makeProps({
					latestSessionOutcome: "completed",
					latestSessionTokensInput: 1500,
					latestSessionTokensOutput: 2500,
					latestSessionHarnessUrl: "https://harness.example.com/session/xyz",
				})}
			/>,
		);

		// Session metadata section present
		const dialog = screen.getByRole("dialog");
		const sessionSection = dialog.querySelector("[data-testid='task-session-metadata']");
		expect(sessionSection).not.toBeNull();

		// Outcome chip: "completed" maps to "done" → renders "DONE" (in session metadata section)
		expect(sessionSection?.querySelector("[data-status='done']")).not.toBeNull();

		// Tokens: 1.5k in / 2.5k out
		expect(sessionSection?.textContent).toContain("1.5k in");
		expect(sessionSection?.textContent).toContain("2.5k out");

		// Jump-out link
		const link = screen.getByRole("link", { name: /open session in harness/i });
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "https://harness.example.com/session/xyz");
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noopener noreferrer");
	});

	it("KanbanTask without session metadata → session section not rendered", () => {
		render(
			<TaskSheet
				{...makeProps({
					latestSessionOutcome: undefined,
					latestSessionTokensInput: undefined,
					latestSessionTokensOutput: undefined,
					latestSessionHarnessUrl: undefined,
				})}
			/>,
		);

		// The session metadata section should not be rendered
		const dialog = screen.getByRole("dialog");
		expect(dialog.querySelector("[data-testid='task-session-metadata']")).toBeNull();

		// No jump-out link
		expect(
			screen.queryByRole("link", { name: /open session in harness/i }),
		).not.toBeInTheDocument();
	});

	it("KanbanTask with malformed harness URL → jump-out link not rendered but outcome chip is", () => {
		render(
			<TaskSheet
				{...makeProps({
					latestSessionOutcome: "stopped",
					latestSessionTokensInput: null,
					latestSessionTokensOutput: null,
					latestSessionHarnessUrl: "ftp://not-valid.com/session",
				})}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		const sessionSection = dialog.querySelector("[data-testid='task-session-metadata']");
		expect(sessionSection).not.toBeNull();

		// Outcome chip present: "stopped" → "paused" → "PAUSED"
		expect(sessionSection?.querySelector("[data-status='paused']")).not.toBeNull();

		// Jump-out link NOT rendered for ftp:// URL
		expect(
			screen.queryByRole("link", { name: /open session in harness/i }),
		).not.toBeInTheDocument();
	});
});
