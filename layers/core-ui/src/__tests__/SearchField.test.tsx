import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "../ds";

describe("SearchField", () => {
	it("renders an input with the given placeholder", () => {
		render(<SearchField placeholder="Search..." />);
		expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
	});

	it("shows the shortcut key hint when provided", () => {
		render(<SearchField shortcutKey="/" />);
		expect(screen.getByText("/")).toBeInTheDocument();
	});

	it("calls onChange when typing", async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<SearchField value="" onChange={handleChange} />);
		await user.type(screen.getByRole("textbox"), "hello");
		expect(handleChange).toHaveBeenCalled();
	});

	it("shows a loading spinner only while loading", () => {
		const { rerender } = render(<SearchField loading />);
		expect(screen.getByTestId("search-field-spinner")).toBeInTheDocument();

		rerender(<SearchField />);
		expect(screen.queryByTestId("search-field-spinner")).not.toBeInTheDocument();
	});

	it("shows a clear button only when a value is present, and clearing empties it", async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		const { rerender } = render(<SearchField value="test" onChange={handleChange} />);
		await user.click(screen.getByRole("button", { name: /clear/i }));
		expect(handleChange).toHaveBeenCalledWith("");

		rerender(<SearchField value="" onChange={handleChange} />);
		expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
	});
});
