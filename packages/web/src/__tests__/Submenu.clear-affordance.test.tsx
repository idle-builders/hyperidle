/**
 * L10 — `Submenu` inline `× Clear` affordance.
 *
 * Plan §3.2 + §3.7: Submenu accepts `onClearFilter` (optional). When the
 * `activeFilter` is non-default (i.e. `!== filters[0].id`) AND `onClearFilter`
 * is provided, an inline `× Clear` button is rendered as a sibling of the
 * tablist (NOT as a chip). When either condition fails, the button is not
 * rendered.
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

describe("Submenu — inline `× Clear` affordance (L10)", () => {
	it("does not render the clear button when activeFilter is the default ('all')", () => {
		render(
			<Submenu
				{...base}
				filters={[...conversationsFilters]}
				activeFilter="all"
				onFilterChange={vi.fn()}
				onClearFilter={vi.fn()}
			>
				content
			</Submenu>,
		);
		expect(screen.queryByTestId("submenu-filter-clear")).not.toBeInTheDocument();
	});

	it("renders the clear button when activeFilter is non-default ('blocking') AND onClearFilter is provided", () => {
		render(
			<Submenu
				{...base}
				filters={[...conversationsFilters]}
				activeFilter="blocking"
				onFilterChange={vi.fn()}
				onClearFilter={vi.fn()}
			>
				content
			</Submenu>,
		);
		const clearButton = screen.getByTestId("submenu-filter-clear");
		expect(clearButton).toBeInTheDocument();
		expect(clearButton).toHaveAccessibleName(/clear filter/i);
	});

	it("does NOT render the clear button when activeFilter is non-default but onClearFilter is omitted", () => {
		render(
			<Submenu
				{...base}
				filters={[...conversationsFilters]}
				activeFilter="async"
				onFilterChange={vi.fn()}
			>
				content
			</Submenu>,
		);
		expect(screen.queryByTestId("submenu-filter-clear")).not.toBeInTheDocument();
	});

	it("clicking the clear button invokes onClearFilter exactly once", async () => {
		const user = userEvent.setup();
		const onClearFilter = vi.fn();
		render(
			<Submenu
				{...base}
				filters={[...conversationsFilters]}
				activeFilter="blocking"
				onFilterChange={vi.fn()}
				onClearFilter={onClearFilter}
			>
				content
			</Submenu>,
		);
		await user.click(screen.getByTestId("submenu-filter-clear"));
		expect(onClearFilter).toHaveBeenCalledTimes(1);
	});

	it("clear button is a sibling of the tablist (NOT a tab inside it) — accessibility contract", () => {
		render(
			<Submenu
				{...base}
				filters={[...conversationsFilters]}
				activeFilter="blocking"
				onFilterChange={vi.fn()}
				onClearFilter={vi.fn()}
			>
				content
			</Submenu>,
		);
		const tablist = screen.getByRole("tablist");
		const clearButton = screen.getByTestId("submenu-filter-clear");
		expect(tablist).not.toContainElement(clearButton);
		// The tablist contains exactly the chip tabs — three of them for L10.
		expect(tablist.querySelectorAll('[role="tab"]').length).toBe(conversationsFilters.length);
	});
});
