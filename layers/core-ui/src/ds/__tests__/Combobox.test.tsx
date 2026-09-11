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

describe("Combobox — trigger accessible name", () => {
	// A `<span>` next to a `<button>` gives the button no accessible name at
	// all — every migrated picker regressed to name:"" this way. The fix is a
	// real `<label htmlFor>` pointing at the trigger's id.
	it("names the trigger from the label prop", () => {
		render(
			<Combobox options={[]} value="" onChange={vi.fn()} label="Owner agent" id="owner-agent" />,
		);
		expect(screen.getByRole("combobox", { name: "Owner agent" })).toBeInTheDocument();
	});

	it("associates the label to a generated id when the caller passes none", () => {
		render(<Combobox options={[]} value="" onChange={vi.fn()} label="Recipient" />);
		const trigger = screen.getByRole("combobox", { name: "Recipient" });
		const label = screen.getByText("Recipient");
		expect(label.getAttribute("for")).toBe(trigger.getAttribute("id"));
	});
});

describe("Combobox — stale highlight when options shrink", () => {
	const OPT_A = { id: "opt-a", label: "Alpha" };
	const OPT_B = { id: "opt-b", label: "Bravo" };
	const OPT_C = { id: "opt-c", label: "Charlie" };

	// Reproduction: a server-driven caller narrows `options` (e.g. a
	// dependent filter changes elsewhere) while the query text stays the
	// same. If the highlighted index survives the shrink unclamped,
	// aria-activedescendant names an option element that no longer exists.
	it("clamps aria-activedescendant to an existing option when options shrink without the query changing", () => {
		const { rerender } = render(
			<Combobox
				options={[OPT_A, OPT_B, OPT_C]}
				onChange={vi.fn()}
				onQueryChange={() => {}}
				placeholder="Search…"
				inputAriaLabel="Search"
			/>,
		);
		const input = openInput();

		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "ArrowDown" });
		const beforeShrink = input.getAttribute("aria-activedescendant");
		expect(beforeShrink).toMatch(/-opt-2$/);

		rerender(
			<Combobox
				options={[OPT_A, OPT_B]}
				onChange={vi.fn()}
				onQueryChange={() => {}}
				placeholder="Search…"
				inputAriaLabel="Search"
			/>,
		);

		const afterShrink = input.getAttribute("aria-activedescendant");
		expect(afterShrink).toMatch(/-opt-1$/);
		expect(afterShrink).not.toBeNull();
		expect(document.getElementById(afterShrink as string)).not.toBeNull();
	});
});

describe("Combobox — leading slot", () => {
	// RecipientPicker's rows lost their Avatar when migrated onto Combobox —
	// ComboboxOption gained an optional `leading` node so a caller can put it
	// back without Combobox knowing what an avatar is.
	it("renders an option's leading content before its label", () => {
		render(
			<Combobox
				options={[
					{
						id: "opt-a",
						label: "Alpha",
						leading: <span data-testid="opt-a-leading">AV</span>,
					},
				]}
				onChange={vi.fn()}
				placeholder="Search…"
				inputAriaLabel="Search"
			/>,
		);
		openInput();

		expect(screen.getByTestId("opt-a-leading")).toBeInTheDocument();
		expect(screen.getByText("Alpha")).toBeInTheDocument();
	});

	it("renders normally when an option has no leading content", () => {
		render(
			<Combobox
				options={[{ id: "opt-a", label: "Alpha" }]}
				onChange={vi.fn()}
				placeholder="Search…"
				inputAriaLabel="Search"
			/>,
		);
		openInput();

		expect(screen.getByText("Alpha")).toBeInTheDocument();
	});
});

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
