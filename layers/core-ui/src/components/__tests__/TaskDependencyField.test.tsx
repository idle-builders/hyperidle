/**
 * BA6 RED — TaskDependencyField: the search-and-pick door replaces the
 * paste-a-task-id field the maintainer rejected.
 *
 * Covers:
 *  - type a title fragment, get matching results, pick one — the chip shows
 *    the TITLE, never the id (searching by title then showing a raw id is
 *    half a fix).
 *  - a pre-existing dependency (loaded with only an id, as the edit surface
 *    does) resolves and shows its title via the bulk lookup door.
 *  - remove works.
 *  - the picker never offers the task being edited or a task already picked.
 *  - `disabled` makes the search input AND the remove control genuinely
 *    inert — not just handler-less, actually unusable.
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

describe("TaskDependencyField — BA6 search picker", () => {
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

	it("types a query, shows matching results by title, and picking one adds it as a chip showing the title", async () => {
		fetchSpy.mockImplementation(stubFetch([{ id: "task-xyz", title: "Ship the search picker" }]));
		const onChange = vi.fn();
		render(<TaskDependencyField dependencies={[]} onChange={onChange} />);

		fireEvent.change(screen.getByTestId("task-dependency-search"), {
			target: { value: "search picker" },
		});

		const result = await screen.findByText("Ship the search picker");
		fireEvent.click(result);

		expect(onChange).toHaveBeenCalledWith(["task-xyz"]);
		// The id itself must never appear as the visible label.
		expect(screen.queryByText("task-xyz")).toBeNull();
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
		fireEvent.click(screen.getByTestId("task-dependency-remove-task-old"));

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

		fireEvent.change(screen.getByTestId("task-dependency-search"), { target: { value: "task" } });

		await screen.findByText("A fresh match");
		expect(screen.queryByText("The task being edited")).toBeNull();
		expect(screen.queryByText("Already a dependency")).toBeNull();
	});

	it("is genuinely inert while disabled — the remove control is not focusable or clickable", async () => {
		fetchSpy.mockImplementation(stubFetch([], [{ id: "task-old", title: "Existing dependency" }]));
		const onChange = vi.fn();
		render(<TaskDependencyField dependencies={["task-old"]} onChange={onChange} disabled />);

		await screen.findByText("Existing dependency");
		const removeButton = screen.getByTestId("task-dependency-remove-task-old");
		expect(removeButton).toBeDisabled();

		fireEvent.click(removeButton);
		expect(onChange).not.toHaveBeenCalled();

		expect(screen.getByTestId("task-dependency-search")).toBeDisabled();
	});
});
