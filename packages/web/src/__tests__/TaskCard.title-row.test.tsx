/**
 * L15 step7 (write-tests) — Conditional title-row click on unread.
 *
 * Approved.md §3 + §7. Plan §3.2 rule 2.
 *
 * The title row of a TaskCard becomes a button (role+tabindex+pointer)
 * ONLY when threadUnreadCount > 0. Otherwise no role, no tabindex,
 * default cursor.
 *
 * @lore L15: fails today because TaskCard does not yet add the role/tabindex
 * conditional. Plan T5 wires it.
 */

import { TaskCard } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("TaskCard title row (L15)", () => {
	it("title row has role='button' + tabIndex=0 when threadUnreadCount > 0", () => {
		render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				threadUnreadCount={2}
				onOpenThread={vi.fn()}
				onRequestStateChange={vi.fn()}
			/>,
		);
		const titleButton = screen.getByRole("button", { name: "Implement login" });
		expect(titleButton).toHaveAttribute("tabindex", "0");
	});

	it("title row has NO role and NO tabindex when threadUnreadCount === 0", () => {
		render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				threadUnreadCount={0}
				onOpenThread={vi.fn()}
				onRequestStateChange={vi.fn()}
			/>,
		);
		expect(screen.queryByRole("button", { name: "Implement login" })).toBeNull();
	});

	it("title row has NO role and NO tabindex when threadUnreadCount is undefined", () => {
		render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				onOpenThread={vi.fn()}
				onRequestStateChange={vi.fn()}
			/>,
		);
		expect(screen.queryByRole("button", { name: "Implement login" })).toBeNull();
	});

	it("title row click fires onOpenThread when unread > 0", async () => {
		const user = userEvent.setup();
		const onOpenThread = vi.fn();
		render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				threadUnreadCount={2}
				onOpenThread={onOpenThread}
				onRequestStateChange={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Implement login" }));
		expect(onOpenThread).toHaveBeenCalledOnce();
	});

	it("Enter on title row fires onOpenThread when unread > 0", async () => {
		const user = userEvent.setup();
		const onOpenThread = vi.fn();
		render(
			<TaskCard
				title="Implement login"
				owner="Agent A"
				state="in_progress"
				threadUnreadCount={2}
				onOpenThread={onOpenThread}
				onRequestStateChange={vi.fn()}
			/>,
		);
		const titleButton = screen.getByRole("button", { name: "Implement login" });
		titleButton.focus();
		await user.keyboard("{Enter}");
		expect(onOpenThread).toHaveBeenCalled();
	});
});
