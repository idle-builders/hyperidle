/**
 * Combobox: keyboard handling must only ever act on visible, current
 * options — never on stale results a slow caller (e.g. `useTaskSearch`'s
 * debounce) is still holding while a new query's request is in flight.
 *
 * Reproduction (from the field): type "dep" → [Depot cleanup, Deploy api];
 * change to "deploy" and press Enter immediately, before the fetch for
 * "deploy" resolves. The loading row is showing and no option is visible,
 * yet Enter used to commit `filtered[highlight]` from the previous query's
 * results — recording the wrong dependency.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Combobox } from "../Combobox.js";

const STALE_DEPOT = { id: "t-depot", label: "Depot cleanup" };
const STALE_DEPLOY = { id: "t-deploy", label: "Deploy api" };
const STALE_OPTIONS = [STALE_DEPOT, STALE_DEPLOY];

function openInput(): HTMLElement {
	fireEvent.click(screen.getByRole("combobox"));
	return screen.getByRole("textbox", { name: /search/i });
}

describe("Combobox — loading/error inertness (server-driven mode)", () => {
	it("ArrowDown + Enter do nothing while the loading row is showing", () => {
		const onChange = vi.fn();
		render(
			<Combobox
				options={STALE_OPTIONS}
				onChange={onChange}
				onQueryChange={() => {}}
				loading
				placeholder="Search tasks by title…"
				inputAriaLabel="Search tasks by title"
			/>,
		);

		const input = openInput();
		// The loading row is showing; no option rows are rendered.
		expect(screen.queryAllByRole("option")).toHaveLength(0);

		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onChange).not.toHaveBeenCalled();
	});

	it("ArrowDown + Enter do nothing while the error row is showing", () => {
		const onChange = vi.fn();
		render(
			<Combobox
				options={STALE_OPTIONS}
				onChange={onChange}
				onQueryChange={() => {}}
				error="Something went wrong. Please try again."
				placeholder="Search tasks by title…"
				inputAriaLabel="Search tasks by title"
			/>,
		);

		const input = openInput();
		expect(screen.queryAllByRole("option")).toHaveLength(0);

		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onChange).not.toHaveBeenCalled();
	});

	it("omits aria-activedescendant while loading, even though the input has focus", () => {
		render(
			<Combobox
				options={STALE_OPTIONS}
				onChange={vi.fn()}
				onQueryChange={() => {}}
				loading
				placeholder="Search tasks by title…"
				inputAriaLabel="Search tasks by title"
			/>,
		);

		const input = openInput();
		expect(input).not.toHaveAttribute("aria-activedescendant");
	});

	it("recovers once loading clears — ArrowDown + Enter pick the now-visible option", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<Combobox
				options={STALE_OPTIONS}
				onChange={onChange}
				onQueryChange={() => {}}
				loading
				placeholder="Search tasks by title…"
				inputAriaLabel="Search tasks by title"
			/>,
		);
		const input = openInput();

		rerender(
			<Combobox
				options={[STALE_DEPLOY]}
				onChange={onChange}
				onQueryChange={() => {}}
				placeholder="Search tasks by title…"
				inputAriaLabel="Search tasks by title"
			/>,
		);

		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onChange).toHaveBeenCalledWith("t-deploy");
	});

	it("clamps the highlight so ArrowDown with zero visible options can't go to -1", () => {
		render(
			<Combobox
				options={[]}
				onChange={vi.fn()}
				onQueryChange={() => {}}
				emptyMessage="No matching tasks"
				placeholder="Search tasks by title…"
				inputAriaLabel="Search tasks by title"
			/>,
		);
		const input = openInput();

		fireEvent.keyDown(input, { key: "ArrowDown" });
		expect(input).not.toHaveAttribute("aria-activedescendant");
	});
});
