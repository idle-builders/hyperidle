/**
 * L10 — `Submenu` keyboard tab order across the chip row.
 *
 * Approved §7 (Behavior table): Tab / Shift-Tab order across the chip row is
 *   `All` → `Blocking` → `Async` → `× Clear` (when present) → first child.
 *
 * This resolves adversary W5: a previous version had no test for keyboard
 * order, allowing regressions where the clear button could end up before the
 * tabs in DOM order or get tabbed-into the tablist itself.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Submenu } from "../shell/Submenu";

const conversationsFilters = [
	{ id: "all", label: "All" },
	{ id: "blocking", label: "Blocking" },
	{ id: "async", label: "Async" },
] as const;

const base = {
	title: "Conversations",
	collapsed: false,
	onToggleCollapse: vi.fn(),
};

describe("Submenu — keyboard order across chip row (L10)", () => {
	it("Tab order: All → Blocking → Async → × Clear → first child", async () => {
		const user = userEvent.setup();
		render(
			<Submenu
				{...base}
				filters={[...conversationsFilters]}
				activeFilter="blocking"
				onFilterChange={vi.fn()}
				onClearFilter={vi.fn()}
			>
				<button type="button" data-testid="first-child">
					First child
				</button>
			</Submenu>,
		);

		// Start focus from the document body so the first Tab lands on the
		// first focusable element inside the shell. The collapse button on the
		// title bar comes first; Tab past it.
		const allTab = screen.getByRole("tab", { name: "All" });
		allTab.focus();
		expect(document.activeElement).toBe(allTab);

		await user.tab();
		expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Blocking" }));

		await user.tab();
		expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Async" }));

		await user.tab();
		expect(document.activeElement).toBe(screen.getByTestId("submenu-filter-clear"));

		await user.tab();
		expect(document.activeElement).toBe(screen.getByTestId("first-child"));
	});

	it("when activeFilter='all', the clear button is omitted from the tab order", async () => {
		const user = userEvent.setup();
		render(
			<Submenu
				{...base}
				filters={[...conversationsFilters]}
				activeFilter="all"
				onFilterChange={vi.fn()}
				onClearFilter={vi.fn()}
			>
				<button type="button" data-testid="first-child">
					First child
				</button>
			</Submenu>,
		);

		screen.getByRole("tab", { name: "Async" }).focus();
		await user.tab();
		// Skips the (unmounted) clear button and lands on the first child.
		expect(document.activeElement).toBe(screen.getByTestId("first-child"));
	});
});
