/**
 * L19 — TaskSheet session metadata tests (red phase).
 *
 * AC coverage:
 *  - KanbanTask with session metadata → session section rendered with outcome chip, cost, tokens, jump-out link
 *  - KanbanTask without session metadata → session section not rendered
 *  - KanbanTask with malformed harness URL → jump-out link not rendered but outcome chip is
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../../shell/Kanban";
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

const BASE_TASK: KanbanTask = {
	id: "task-session-001",
	title: "Build the pipeline",
	owner: "Dev Agent",
	state: "in_progress",
	cost: "$5.00",
};

function makeProps(
	taskOverrides: Partial<KanbanTask> = {},
): Parameters<typeof TaskSheet>[0] {
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
	it("KanbanTask with session metadata → session section rendered with outcome chip, cost, tokens, jump-out link", () => {
		render(
			<TaskSheet
				{...makeProps({
					latestSessionOutcome: "completed",
					latestSessionCost: 420, // $4.20
					latestSessionTokensInput: 1500,
					latestSessionTokensOutput: 2500,
					latestSessionHarnessUrl: "https://harness.example.com/session/xyz",
				})}
			/>,
		);

		// Outcome chip: "completed" maps to "done" → renders "DONE"
		expect(screen.getByText(/done/i)).toBeInTheDocument();

		// Cost: $4.20 rendered as "$4.20"
		expect(screen.getByText(/\$4\.20/)).toBeInTheDocument();

		// Tokens: 1.5k in / 2.5k out
		expect(screen.getByText(/1\.5k in \/ 2\.5k out/i)).toBeInTheDocument();

		// Jump-out link
		const link = screen.getByRole("link", { name: /open in harness/i });
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
					latestSessionCost: undefined,
					latestSessionTokensInput: undefined,
					latestSessionTokensOutput: undefined,
					latestSessionHarnessUrl: undefined,
				})}
			/>,
		);

		// No jump-out link
		expect(screen.queryByRole("link", { name: /open in harness/i })).not.toBeInTheDocument();

		// No cost in session format ("$X.XX" in the session section — task cost "$5.00" exists
		// from the task card, but session cost is separate)
		// The session metadata div is not rendered
		const dialog = screen.getByRole("dialog");
		// The session metadata section uses a data-testid
		expect(dialog.querySelector("[data-testid='task-session-metadata']")).toBeNull();
	});

	it("KanbanTask with malformed harness URL → jump-out link not rendered but outcome chip is", () => {
		render(
			<TaskSheet
				{...makeProps({
					latestSessionOutcome: "stopped",
					latestSessionCost: null,
					latestSessionTokensInput: null,
					latestSessionTokensOutput: null,
					latestSessionHarnessUrl: "ftp://not-valid.com/session",
				})}
			/>,
		);

		// Outcome chip present: "stopped" → "paused" → "PAUSED"
		expect(screen.getByText(/paused/i)).toBeInTheDocument();

		// Jump-out link NOT rendered for ftp:// URL
		expect(screen.queryByRole("link", { name: /open in harness/i })).not.toBeInTheDocument();
	});
});
