/**
 * L7 — AvatarMenu kill-switch entry point (red phase).
 *
 * Pins AC1 from `docs/work-packages/TRACK-L.md` L7:
 *   "kill switch reachable from … the avatar menu in the top bar
 *    (always visible)".
 *
 *   - Avatar menu surfaces a "Pause Factory" item.
 *   - Clicking opens the KillSwitchDialog (or fires the open callback).
 *   - Visible regardless of route.
 *
 * These tests MUST fail today: AvatarMenu does not exist.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AvatarMenu } from "../components/AvatarMenu";

describe("L7 — AvatarMenu kill-switch entry", () => {
	it("renders a 'Pause Factory' menu item", async () => {
		const user = userEvent.setup();
		render(
			<AvatarMenu
				actor={{ id: "actor:ceo", name: "Jane", role: "CEO" }}
				onPauseFactory={vi.fn()}
				onOpenSettings={vi.fn()}
				onSignOut={vi.fn()}
			/>,
		);
		// Open the menu first.
		await user.click(screen.getByRole("button", { name: /avatar|profile|menu/i }));
		expect(screen.getByRole("menuitem", { name: /pause factory/i })).toBeInTheDocument();
	});

	it("clicking the Pause Factory item invokes onPauseFactory", async () => {
		const onPauseFactory = vi.fn();
		const user = userEvent.setup();
		render(
			<AvatarMenu
				actor={{ id: "actor:ceo", name: "Jane", role: "CEO" }}
				onPauseFactory={onPauseFactory}
				onOpenSettings={vi.fn()}
				onSignOut={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /avatar|profile|menu/i }));
		await user.click(screen.getByRole("menuitem", { name: /pause factory/i }));
		expect(onPauseFactory).toHaveBeenCalled();
	});

	it("Pause Factory item is styled as destructive (data attribute or class hint)", async () => {
		const user = userEvent.setup();
		render(
			<AvatarMenu
				actor={{ id: "actor:ceo", name: "Jane", role: "CEO" }}
				onPauseFactory={vi.fn()}
				onOpenSettings={vi.fn()}
				onSignOut={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /avatar|profile|menu/i }));
		const item = screen.getByRole("menuitem", { name: /pause factory/i });
		// Either an aria-attribute or a data-variant signals destructive intent.
		expect(
			item.getAttribute("data-variant") === "destructive" ||
				item.className.match(/text-error|destructive/),
		).toBeTruthy();
	});
});
