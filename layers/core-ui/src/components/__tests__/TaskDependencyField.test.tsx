/**
 * TaskDependencyField: search-and-pick, built on the shared `Combobox`.
 *
 * Covers:
 *  - type a title fragment, get matching results, pick one — the chip shows
 *    the TITLE, never the id (searching by title then showing a raw id is
 *    half a fix).
 *  - a pre-existing dependency (loaded with only an id, as the edit surface
 *    does) resolves and shows its title via the bulk lookup door.
 *  - remove works.
 *  - the picker never offers the task being edited or a task already picked.
 *  - full keyboard navigation: ArrowDown + Enter picks a result, Escape closes.
 *  - `disabled` makes the control AND the remove buttons genuinely inert.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { TaskDependencyField } from "../TaskDependencyField.js";

interface TaskRow {
	id: string;
	title: string;
}

function stubFetch(searchResults: TaskRow[], lookupRows: TaskRow[] = []): ReturnType<typeof vi.fn> {
	return vi.fn().mockImplementation((url: string) => {
		if (url.includes("ids=")) {
			return Promise.resolve(new Response(JSON.stringify(lookupRows), { status: 200 }));
		}
		return Promise.resolve(new Response(JSON.stringify(searchResults), { status: 200 }));
	});
}

/** Opens the picker's popover and types a query into its filter input. */
async function openAndType(query: string): Promise<void> {
	fireEvent.click(screen.getByRole("combobox"));
	const input = await screen.findByRole("textbox", { name: /search tasks by title/i });
	fireEvent.change(input, { target: { value: query } });
}

describe("TaskDependencyField — search picker", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("shows a visible label naming what the field is for", () => {
		fetchSpy.mockImplementation(stubFetch([]));
		render(<TaskDependencyField dependencies={[]} onChange={vi.fn()} />);

		expect(screen.getByText("Depends on (waits until these finish)")).toBeInTheDocument();
	});

	it("renders label, then selected chips, then the search control — never label in the middle", async () => {
		fetchSpy.mockImplementation(stubFetch([], [{ id: "task-old", title: "Existing dependency" }]));
		render(<TaskDependencyField dependencies={["task-old"]} onChange={vi.fn()} />);

		await screen.findByText("Existing dependency");

		const label = screen.getByText("Depends on (waits until these finish)");
		const chipList = screen.getByTestId("task-dependency-list");
		const trigger = screen.getByRole("combobox");

		// DOCUMENT_POSITION_FOLLOWING (4) means the argument comes AFTER the node.
		expect(label.compareDocumentPosition(chipList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(
			chipList.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();

		// The label still names the control for assistive tech.
		expect(label).toHaveAttribute("for", trigger.getAttribute("id"));
	});

	it("types a query, shows matching results by title, and picking one adds it as a chip showing the title", async () => {
		fetchSpy.mockImplementation(stubFetch([{ id: "task-xyz", title: "Ship the search picker" }]));
		const onChange = vi.fn();
		render(<TaskDependencyField dependencies={[]} onChange={onChange} />);

		await openAndType("search picker");

		const result = await screen.findByRole("option", { name: "Ship the search picker" });
		fireEvent.click(result);

		expect(onChange).toHaveBeenCalledWith(["task-xyz"]);
		// The id itself must never appear as the visible label.
		expect(screen.queryByText("task-xyz")).toBeNull();
		// Focus returns to the trigger, not BODY — so a person can pick several
		// dependencies in a row from the keyboard.
		expect(document.activeElement).toBe(screen.getByRole("combobox"));
	});

	it("resolves a pre-existing dependency (id only) to its title via the bulk lookup door", async () => {
		fetchSpy.mockImplementation(stubFetch([], [{ id: "task-old", title: "Existing dependency" }]));
		render(<TaskDependencyField dependencies={["task-old"]} onChange={vi.fn()} />);

		await waitFor(() => {
			expect(screen.getByText("Existing dependency")).toBeInTheDocument();
		});
		expect(screen.queryByText("task-old")).toBeNull();
	});

	it("removes a dependency via the chip's remove control", async () => {
		fetchSpy.mockImplementation(stubFetch([], [{ id: "task-old", title: "Existing dependency" }]));
		const onChange = vi.fn();
		render(<TaskDependencyField dependencies={["task-old"]} onChange={onChange} />);

		await screen.findByText("Existing dependency");
		fireEvent.click(screen.getByLabelText("Remove Existing dependency"));

		expect(onChange).toHaveBeenCalledWith([]);
	});

	it("does not offer the task being edited or a task already in the list", async () => {
		fetchSpy.mockImplementation(
			stubFetch([
				{ id: "task-self", title: "The task being edited" },
				{ id: "task-picked", title: "Already a dependency" },
				{ id: "task-fresh", title: "A fresh match" },
			]),
		);
		render(
			<TaskDependencyField
				dependencies={["task-picked"]}
				onChange={vi.fn()}
				currentTaskId="task-self"
			/>,
		);

		await openAndType("task");

		await screen.findByRole("option", { name: "A fresh match" });
		expect(screen.queryByRole("option", { name: "The task being edited" })).toBeNull();
		expect(screen.queryByRole("option", { name: "Already a dependency" })).toBeNull();
	});

	it("full keyboard navigation: ArrowDown + Enter picks a result, Escape closes", async () => {
		fetchSpy.mockImplementation(
			stubFetch([
				{ id: "task-a", title: "First match" },
				{ id: "task-b", title: "Second match" },
			]),
		);
		const onChange = vi.fn();
		render(<TaskDependencyField dependencies={[]} onChange={onChange} />);

		await openAndType("match");
		await screen.findByRole("option", { name: "Second match" });

		const input = screen.getByRole("textbox", { name: /search tasks by title/i });
		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onChange).toHaveBeenCalledWith(["task-b"]);

		// Re-open and confirm Escape closes the popover without picking anything.
		fireEvent.click(screen.getByRole("combobox"));
		const reopenedInput = await screen.findByRole("textbox", { name: /search tasks by title/i });
		fireEvent.keyDown(reopenedInput, { key: "Escape" });
		expect(screen.queryByRole("textbox", { name: /search tasks by title/i })).toBeNull();
		expect(onChange).toHaveBeenCalledTimes(1);
		// Escape returns focus to the trigger, not BODY.
		expect(document.activeElement).toBe(screen.getByRole("combobox"));
	});

	it("is genuinely inert while disabled — the remove control and the search trigger are not usable", async () => {
		fetchSpy.mockImplementation(stubFetch([], [{ id: "task-old", title: "Existing dependency" }]));
		const onChange = vi.fn();
		render(<TaskDependencyField dependencies={["task-old"]} onChange={onChange} disabled />);

		await screen.findByText("Existing dependency");
		const removeButton = screen.getByLabelText("Remove Existing dependency");
		expect(removeButton).toBeDisabled();

		fireEvent.click(removeButton);
		expect(onChange).not.toHaveBeenCalled();

		const trigger = screen.getByRole("combobox");
		expect(trigger).toBeDisabled();
		fireEvent.click(trigger);
		expect(screen.queryByRole("textbox", { name: /search tasks by title/i })).toBeNull();
	});
});
