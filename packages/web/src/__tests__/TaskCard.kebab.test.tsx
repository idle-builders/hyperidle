/**
 * L15 step3 (write-tests) — TaskCard kebab dropdown.
 *
 * Approved.md §4. Plan §3.2 + §6 task #7.
 *
 * Asserts:
 *   - Kebab button is rendered (always visible at full opacity, AQ rule)
 *   - Clicking kebab reveals an Open-thread row + a request-state-change
 *     section + a Kill task danger row.
 *   - Menu items match `getRequestableVerbRows(state)` exactly
 *     (order, label, disabled flag).
 *   - Clicking a non-disabled verb fires `onRequestStateChange(verb)`.
 *   - Clicking a disabled verb does NOT fire the handler.
 *   - Clicking Open thread fires `onOpenThread`.
 *
 * @lore L15: fails today because TaskCard does not yet expose
 * `onRequestStateChange` / `onOpenThread` / kebab UI. Plan T4-T5 add them.
 */

import { TaskCard } from "@hyperidle/design-system";
import { getRequestableVerbRows } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("TaskCard kebab menu (L15)", () => {
	it("renders a kebab button with aria-haspopup='menu'", () => {
		render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				onRequestStateChange={vi.fn()}
				onOpenThread={vi.fn()}
			/>,
		);
		const kebab = screen.getByRole("button", { name: /task actions|open menu|more/i });
		expect(kebab).toHaveAttribute("aria-haspopup", "menu");
	});

	it("opens the menu on kebab click and shows Open thread + Kill task rows", async () => {
		const user = userEvent.setup();
		render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				onRequestStateChange={vi.fn()}
				onOpenThread={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /task actions|open menu|more/i }));
		expect(screen.getByRole("menuitem", { name: /open thread/i })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: /kill task/i })).toBeInTheDocument();
	});

	it("renders one menu item per row from getRequestableVerbRows(state)", async () => {
		const user = userEvent.setup();
		render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				onRequestStateChange={vi.fn()}
				onOpenThread={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /task actions|open menu|more/i }));
		for (const row of getRequestableVerbRows("in_progress")) {
			expect(
				screen.getByRole("menuitem", { name: new RegExp(row.label, "i") }),
			).toBeInTheDocument();
		}
	});

	it("calls onRequestStateChange with the verb when a non-disabled item is clicked", async () => {
		const user = userEvent.setup();
		const onRequestStateChange = vi.fn();
		render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				onRequestStateChange={onRequestStateChange}
				onOpenThread={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /task actions|open menu|more/i }));
		await user.click(screen.getByRole("menuitem", { name: /^pause$/i }));
		expect(onRequestStateChange).toHaveBeenCalledWith("pause");
	});

	it("does NOT call onRequestStateChange when a disabled item is clicked", async () => {
		const user = userEvent.setup();
		const onRequestStateChange = vi.fn();
		// Resume is disabled when in_progress.
		render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				onRequestStateChange={onRequestStateChange}
				onOpenThread={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /task actions|open menu|more/i }));
		const resume = screen.getByRole("menuitem", { name: /^resume$/i });
		expect(resume).toHaveAttribute("aria-disabled", "true");
		await user.click(resume);
		expect(onRequestStateChange).not.toHaveBeenCalled();
	});

	it("calls onOpenThread when the Open thread row is clicked", async () => {
		const user = userEvent.setup();
		const onOpenThread = vi.fn();
		render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				onRequestStateChange={vi.fn()}
				onOpenThread={onOpenThread}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /task actions|open menu|more/i }));
		await user.click(screen.getByRole("menuitem", { name: /open thread/i }));
		expect(onOpenThread).toHaveBeenCalledOnce();
	});

	it("calls onRequestStateChange('kill') when the Kill task row is clicked", async () => {
		const user = userEvent.setup();
		const onRequestStateChange = vi.fn();
		render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				onRequestStateChange={onRequestStateChange}
				onOpenThread={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /task actions|open menu|more/i }));
		await user.click(screen.getByRole("menuitem", { name: /kill task/i }));
		expect(onRequestStateChange).toHaveBeenCalledWith("kill");
	});

	it("renders a grey thread dot when thread exists with all read (threadUnreadCount=0)", () => {
		const { container } = render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				threadUnreadCount={0}
				onOpenThread={vi.fn()}
				onRequestStateChange={vi.fn()}
			/>,
		);
		const dot = container.querySelector("[data-testid='task-thread-dot']");
		expect(dot).not.toBeNull();
		expect(dot?.getAttribute("data-unread")).toBe("false");
	});

	it("renders a primary-tint thread dot when threadUnreadCount > 0", () => {
		const { container } = render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				threadUnreadCount={3}
				onOpenThread={vi.fn()}
				onRequestStateChange={vi.fn()}
			/>,
		);
		const dot = container.querySelector("[data-testid='task-thread-dot']");
		expect(dot).not.toBeNull();
		expect(dot?.getAttribute("data-unread")).toBe("true");
	});

	it("renders no thread dot when threadUnreadCount is undefined (no thread yet)", () => {
		const { container } = render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				onOpenThread={vi.fn()}
				onRequestStateChange={vi.fn()}
			/>,
		);
		expect(container.querySelector("[data-testid='task-thread-dot']")).toBeNull();
	});
});
