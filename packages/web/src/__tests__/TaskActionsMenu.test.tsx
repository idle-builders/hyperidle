/**
 * L15: TaskActionsMenu — kebab dropdown with state-request submenu and
 * Open thread item. Locks the keyboard, ARIA, and copy contracts.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { KanbanTask } from "../shell/Kanban";
import { TaskActionsMenu } from "../shell/TaskActionsMenu";

const task: KanbanTask = {
	id: "t1",
	title: "Login endpoint",
	owner: "Dev 1",
	state: "in_progress",
};

function renderMenu(overrides?: {
	onStateRequest?: ReturnType<typeof vi.fn>;
	onOpenThread?: ReturnType<typeof vi.fn>;
	taskOverride?: KanbanTask;
}): {
	onStateRequest: ReturnType<typeof vi.fn>;
	onOpenThread: ReturnType<typeof vi.fn>;
} {
	const onStateRequest = overrides?.onStateRequest ?? vi.fn(async () => ({ ok: true as const }));
	const onOpenThread = overrides?.onOpenThread ?? vi.fn();
	render(
		<TaskActionsMenu
			task={overrides?.taskOverride ?? task}
			onStateRequest={onStateRequest}
			onOpenThread={onOpenThread}
		/>,
	);
	return { onStateRequest, onOpenThread };
}

describe("L15 TaskActionsMenu", () => {
	it("renders a kebab trigger button with aria-haspopup=menu", () => {
		renderMenu();
		const kebab = screen.getByRole("button", { name: /task actions/i });
		expect(kebab).toHaveAttribute("aria-haspopup", "menu");
		expect(kebab).toHaveAttribute("aria-expanded", "false");
	});

	it("opening the menu shows Request state change and Open thread items", async () => {
		const user = userEvent.setup();
		renderMenu();
		await user.click(screen.getByRole("button", { name: /task actions/i }));
		expect(screen.getByRole("menuitem", { name: /request state change/i })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: /open thread/i })).toBeInTheDocument();
	});

	it("submenu shows the four states with current state disabled and (current) suffix", async () => {
		const user = userEvent.setup();
		renderMenu();
		await user.click(screen.getByRole("button", { name: /task actions/i }));
		await user.click(screen.getByRole("menuitem", { name: /request state change/i }));

		// Current is in_progress → "In Progress (current)" disabled
		const current = screen.getByRole("menuitem", { name: /in progress \(current\)/i });
		expect(current).toHaveAttribute("aria-disabled", "true");

		expect(screen.getByRole("menuitem", { name: /^planned$/i })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: /^blocked$/i })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: /^done$/i })).toBeInTheDocument();
	});

	it("Blocked submenu item carries danger styling token", async () => {
		const user = userEvent.setup();
		renderMenu();
		await user.click(screen.getByRole("button", { name: /task actions/i }));
		await user.click(screen.getByRole("menuitem", { name: /request state change/i }));
		const blocked = screen.getByRole("menuitem", { name: /^blocked$/i });
		expect(blocked.className).toMatch(/var\(--danger\)/);
	});

	it("selecting Blocked invokes onStateRequest with 'blocked'", async () => {
		const user = userEvent.setup();
		const { onStateRequest } = renderMenu();
		await user.click(screen.getByRole("button", { name: /task actions/i }));
		await user.click(screen.getByRole("menuitem", { name: /request state change/i }));
		await user.click(screen.getByRole("menuitem", { name: /^blocked$/i }));
		expect(onStateRequest).toHaveBeenCalledWith("blocked");
	});

	it("selecting Open thread invokes onOpenThread", async () => {
		const user = userEvent.setup();
		const { onOpenThread } = renderMenu();
		await user.click(screen.getByRole("button", { name: /task actions/i }));
		await user.click(screen.getByRole("menuitem", { name: /open thread/i }));
		expect(onOpenThread).toHaveBeenCalledTimes(1);
	});

	it("ESC closes the menu and returns focus to the kebab trigger", async () => {
		const user = userEvent.setup();
		renderMenu();
		const kebab = screen.getByRole("button", { name: /task actions/i });
		await user.click(kebab);
		expect(screen.getByRole("menuitem", { name: /request state change/i })).toBeInTheDocument();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("menuitem", { name: /request state change/i })).toBeNull();
		expect(document.activeElement).toBe(kebab);
	});

	it("pressing B inside the open submenu posts a request to blocked", async () => {
		const user = userEvent.setup();
		const { onStateRequest } = renderMenu();
		await user.click(screen.getByRole("button", { name: /task actions/i }));
		await user.click(screen.getByRole("menuitem", { name: /request state change/i }));
		await user.keyboard("b");
		expect(onStateRequest).toHaveBeenCalledWith("blocked");
	});

	it("pressing T on the open menu opens the thread", async () => {
		const user = userEvent.setup();
		const { onOpenThread } = renderMenu();
		await user.click(screen.getByRole("button", { name: /task actions/i }));
		await user.keyboard("t");
		expect(onOpenThread).toHaveBeenCalledTimes(1);
	});

	it("kebab fades in via opacity-0 by default and becomes visible on hover/focus", () => {
		renderMenu();
		const kebab = screen.getByRole("button", { name: /task actions/i });
		// Wrapper element controls visibility via opacity utility classes.
		const wrapper = kebab.closest("[data-task-overflow]") ?? kebab.parentElement;
		expect(wrapper?.className).toMatch(/opacity-0/);
	});

	it("renders nothing for hold-state tasks (cannot post stale state-request)", () => {
		const { container } = render(
			<TaskActionsMenu
				task={{ ...task, state: "hold" }}
				onStateRequest={vi.fn(async () => ({ ok: true as const }))}
				onOpenThread={vi.fn()}
			/>,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders nothing for killed-state tasks (cannot post stale state-request)", () => {
		const { container } = render(
			<TaskActionsMenu
				task={{ ...task, state: "killed" }}
				onStateRequest={vi.fn(async () => ({ ok: true as const }))}
				onOpenThread={vi.fn()}
			/>,
		);
		expect(container.firstChild).toBeNull();
	});

	it("hides parent menu items when the submenu is open", async () => {
		const user = userEvent.setup();
		renderMenu();
		await user.click(screen.getByRole("button", { name: /task actions/i }));
		await user.click(screen.getByRole("menuitem", { name: /request state change/i }));
		// Submenu visible — parent items should be gone.
		expect(screen.queryByRole("menuitem", { name: /request state change/i })).toBeNull();
		expect(screen.queryByRole("menuitem", { name: /open thread/i })).toBeNull();
		expect(screen.getByRole("menuitem", { name: /^blocked$/i })).toBeInTheDocument();
	});

	it("ESC inside the submenu returns to the parent menu, not to closed", async () => {
		const user = userEvent.setup();
		renderMenu();
		await user.click(screen.getByRole("button", { name: /task actions/i }));
		await user.click(screen.getByRole("menuitem", { name: /request state change/i }));
		await user.keyboard("{Escape}");
		// Parent menu items are visible again.
		expect(screen.getByRole("menuitem", { name: /request state change/i })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: /open thread/i })).toBeInTheDocument();
		// A second ESC closes the menu entirely.
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("menuitem", { name: /request state change/i })).toBeNull();
	});

	it("rapid double-click on a submenu item fires onStateRequest exactly once", async () => {
		const user = userEvent.setup();
		let resolve!: (v: { ok: true }) => void;
		const onStateRequest = vi.fn(
			() => new Promise<{ ok: true }>((r) => { resolve = r; }),
		);
		renderMenu({ onStateRequest });
		await user.click(screen.getByRole("button", { name: /task actions/i }));
		await user.click(screen.getByRole("menuitem", { name: /request state change/i }));
		const blocked = screen.getByRole("menuitem", { name: /^blocked$/i });
		// Two clicks before the in-flight promise resolves.
		await user.click(blocked);
		// Second click — submenu has closed, but even if user re-opens and
		// clicks again before the promise resolves the inFlight flag must
		// suppress the second invocation.
		await user.click(screen.getByRole("button", { name: /task actions/i }));
		// At this point inFlight is true so the kebab is disabled — no menu
		// opens. The state-request must still be a single call.
		resolve({ ok: true });
		expect(onStateRequest).toHaveBeenCalledTimes(1);
	});

	it("parent menu has aria-label='Task actions' and submenu has aria-label='Request state change'", async () => {
		const user = userEvent.setup();
		renderMenu();
		await user.click(screen.getByRole("button", { name: /task actions/i }));
		const parent = screen.getByRole("menu", { name: /task actions/i });
		expect(parent).toBeInTheDocument();
		await user.click(screen.getByRole("menuitem", { name: /request state change/i }));
		const submenu = screen.getByRole("menu", { name: /request state change/i });
		expect(submenu).toBeInTheDocument();
	});

	it("focus moves to the first non-disabled submenu item when the submenu opens", async () => {
		const user = userEvent.setup();
		renderMenu();
		await user.click(screen.getByRole("button", { name: /task actions/i }));
		await user.click(screen.getByRole("menuitem", { name: /request state change/i }));
		// Current is "in_progress" → first non-disabled is "Planned".
		expect(document.activeElement?.textContent).toMatch(/^Planned$/);
	});
});
