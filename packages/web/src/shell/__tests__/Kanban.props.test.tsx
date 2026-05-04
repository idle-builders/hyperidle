/**
 * L15 step12 (write-tests) — Kanban prop surface after drag removal.
 *
 * Approved.md §7. Plan §6 task #13.
 *
 * Asserts:
 *   - `onMoveTask` is no longer part of `KanbanProps` (compile-time guard).
 *   - Kanban accepts and plumbs new per-task callbacks
 *     (`onOpenThread`, `onRequestStateChange`) through to TaskCard.
 *
 * @lore L15: fails today because Kanban still requires onMoveTask and does
 * not surface the new per-task callbacks. Plan T10 rewires the component.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../Kanban";
import { Kanban } from "../Kanban";

const tasks: KanbanTask[] = [
	{ id: "t1", title: "Setup CI", owner: "Agent A", state: "accepted" },
	{ id: "t2", title: "Build API", owner: "Agent B", state: "in_progress" },
];

describe("Kanban props (L15)", () => {
	it("renders without onMoveTask (drag is gone)", () => {
		render(<Kanban tasks={tasks} />);
		expect(screen.getByText("Setup CI")).toBeInTheDocument();
		expect(screen.getByText("Build API")).toBeInTheDocument();
	});

	it("rejects onMoveTask at compile time (drag wiring is gone)", () => {
		// @ts-expect-error onMoveTask is no longer a valid prop on KanbanProps.
		const Props = <Kanban tasks={tasks} onMoveTask={() => {}} />;
		void Props;
	});

	it("calls onOpenThread for the right task when its kebab → Open thread fires", async () => {
		const user = userEvent.setup();
		const onOpenThread = vi.fn();
		render(<Kanban tasks={tasks} onOpenThread={onOpenThread} onRequestStateChange={vi.fn()} />);
		// Open the kebab on the in-progress task.
		const kebabs = screen.getAllByRole("button", { name: /task actions|open menu|more/i });
		await user.click(kebabs[1] ?? kebabs[0]);
		await user.click(screen.getByRole("menuitem", { name: /open thread/i }));
		expect(onOpenThread).toHaveBeenCalled();
		expect(onOpenThread.mock.calls[0]?.[0]).toBeTruthy(); // taskId argument
	});

	it("calls onRequestStateChange(taskId, verb) when a request verb is clicked", async () => {
		const user = userEvent.setup();
		const onRequestStateChange = vi.fn();
		render(
			<Kanban tasks={tasks} onOpenThread={vi.fn()} onRequestStateChange={onRequestStateChange} />,
		);
		const kebabs = screen.getAllByRole("button", { name: /task actions|open menu|more/i });
		await user.click(kebabs[0]);
		await user.click(screen.getByRole("menuitem", { name: /^pause$/i }));
		expect(onRequestStateChange).toHaveBeenCalledWith(expect.any(String), "pause");
	});
});
