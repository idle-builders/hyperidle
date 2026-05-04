/**
 * L15: toast text is mirrored into a role=status aria-live=polite region
 * for screen readers (per plan §4.4 / §4.5.4).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../shell/Kanban";
import { Kanban } from "../shell/Kanban";

const tasks: KanbanTask[] = [
	{ id: "t1", title: "Login endpoint", owner: "Dev 1", state: "in_progress" },
];

describe("L15 Kanban — toast a11y", () => {
	it("renders an aria-live polite region inside Kanban", () => {
		const { container } = render(
			<Kanban
				tasks={tasks}
				onTaskStateRequest={vi.fn(async () => ({ ok: true as const }))}
				onOpenTaskThread={vi.fn()}
			/>,
		);
		const live = container.querySelector('[role="status"][aria-live="polite"]');
		expect(live).not.toBeNull();
	});

	it("mirrors success toast text into the aria-live region", async () => {
		const onTaskStateRequest = vi.fn(async () => ({ ok: true as const }));
		const { container } = render(
			<Kanban
				tasks={tasks}
				onTaskStateRequest={onTaskStateRequest}
				onOpenTaskThread={vi.fn()}
			/>,
		);
		const user = userEvent.setup();
		const taskCard = screen.getByText("Login endpoint").closest(
			"[data-ds-component='TaskCard']",
		);
		const kebab = taskCard?.querySelector(
			"[aria-label='Task actions'], [aria-label*='actions']",
		) as HTMLElement | null;
		if (kebab) await user.click(kebab);
		await user.click(screen.getByRole("menuitem", { name: /request state change/i }));
		await user.click(screen.getByRole("menuitem", { name: /^blocked$/i }));

		await waitFor(() => {
			const live = container.querySelector('[role="status"][aria-live="polite"]');
			expect(live?.textContent ?? "").toMatch(/Posted to thread/i);
		});
	});
});
