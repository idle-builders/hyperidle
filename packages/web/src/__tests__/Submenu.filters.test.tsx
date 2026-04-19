import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Submenu } from "../shell/Submenu";

/**
 * J2: Submenu gains an optional `count` bubble in the header and an optional
 * segmented filter row driven by `filters` + `activeFilter` + `onFilterChange`.
 * The header switches to `font-mono` to match synthesis row 04.
 */
describe("Submenu — count bubble + filters (J2)", () => {
	const base = {
		title: "Conversations",
		collapsed: false,
		onToggleCollapse: vi.fn(),
	};

	it("renders a count bubble next to the title when `count` is provided", () => {
		render(
			<Submenu {...base} count={3}>
				content
			</Submenu>,
		);
		// The bubble renders the numeric count near the title.
		expect(screen.getByText("3")).toBeInTheDocument();
	});

	it("renders segmented filter buttons as tabs with the active one aria-selected", () => {
		render(
			<Submenu
				{...base}
				filters={[
					{ id: "all", label: "All" },
					{ id: "needs-review", label: "Needs review" },
				]}
				activeFilter="all"
				onFilterChange={vi.fn()}
			>
				content
			</Submenu>,
		);
		const allTab = screen.getByRole("tab", { name: "All" });
		const nrTab = screen.getByRole("tab", { name: "Needs review" });
		expect(allTab).toHaveAttribute("aria-selected", "true");
		expect(nrTab).toHaveAttribute("aria-selected", "false");
	});

	it("calls onFilterChange with the new id when a filter tab is clicked", async () => {
		const user = userEvent.setup();
		const onFilterChange = vi.fn();
		render(
			<Submenu
				{...base}
				filters={[
					{ id: "all", label: "All" },
					{ id: "needs-review", label: "Needs review" },
				]}
				activeFilter="all"
				onFilterChange={onFilterChange}
			>
				content
			</Submenu>,
		);
		await user.click(screen.getByRole("tab", { name: "Needs review" }));
		expect(onFilterChange).toHaveBeenCalledWith("needs-review");
	});

	it("renders no tablist when `filters` is undefined or empty", () => {
		render(<Submenu {...base}>content</Submenu>);
		expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
		render(
			<Submenu {...base} filters={[]} activeFilter="all" onFilterChange={vi.fn()}>
				content
			</Submenu>,
		);
		expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
	});

	it("title uses the mono header style (synthesis row 04)", () => {
		render(
			<Submenu {...base} count={1}>
				content
			</Submenu>,
		);
		const titleEl = screen.getByText(base.title);
		expect(titleEl.className).toMatch(/font-mono/);
	});
});
