/**
 * L10 — `Submenu` chips inert during error state.
 *
 * Plan §1 Q7 + approved §5.5: when `filtersDisabled === true`, every chip
 * AND the inline clear button must render with `aria-disabled="true"` +
 * `opacity-50` + `pointer-events: none`. We verify the aria semantics and
 * that clicking does not invoke the change handler.
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

describe("Submenu — disabled chips (L10)", () => {
	it("every chip carries aria-disabled='true' when filtersDisabled is true", () => {
		render(
			<Submenu
				{...base}
				filters={[...conversationsFilters]}
				activeFilter="all"
				onFilterChange={vi.fn()}
				filtersDisabled={true}
			>
				content
			</Submenu>,
		);
		for (const f of conversationsFilters) {
			const chip = screen.getByRole("tab", { name: f.label });
			expect(chip).toHaveAttribute("aria-disabled", "true");
		}
	});

	it("clicking a disabled chip does not invoke onFilterChange", async () => {
		const user = userEvent.setup();
		const onFilterChange = vi.fn();
		render(
			<Submenu
				{...base}
				filters={[...conversationsFilters]}
				activeFilter="all"
				onFilterChange={onFilterChange}
				filtersDisabled={true}
			>
				content
			</Submenu>,
		);
		await user.click(screen.getByRole("tab", { name: "Blocking" }));
		expect(onFilterChange).not.toHaveBeenCalled();
	});

	it("inline clear button (when present) is also aria-disabled and inert", async () => {
		const user = userEvent.setup();
		const onClearFilter = vi.fn();
		render(
			<Submenu
				{...base}
				filters={[...conversationsFilters]}
				activeFilter="blocking"
				onFilterChange={vi.fn()}
				onClearFilter={onClearFilter}
				filtersDisabled={true}
			>
				content
			</Submenu>,
		);
		const clearButton = screen.getByTestId("submenu-filter-clear");
		expect(clearButton).toHaveAttribute("aria-disabled", "true");
		await user.click(clearButton);
		expect(onClearFilter).not.toHaveBeenCalled();
	});

	it("default behavior is unchanged when filtersDisabled is false / omitted", async () => {
		const user = userEvent.setup();
		const onFilterChange = vi.fn();
		render(
			<Submenu
				{...base}
				filters={[...conversationsFilters]}
				activeFilter="all"
				onFilterChange={onFilterChange}
			>
				content
			</Submenu>,
		);
		await user.click(screen.getByRole("tab", { name: "Blocking" }));
		expect(onFilterChange).toHaveBeenCalledWith("blocking");
	});
});
