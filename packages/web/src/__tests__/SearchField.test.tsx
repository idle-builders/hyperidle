import { SearchField } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("SearchField", () => {
	it("renders an input with placeholder", () => {
		render(<SearchField placeholder="Search..." />);
		expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
	});

	it("applies sizing classes to the input", () => {
		render(<SearchField placeholder="Search..." />);
		const input = screen.getByPlaceholderText("Search...");
		expect(input).toHaveClass("w-full", "h-[32px]");
		expect(input.className).toContain("bg-[var(--surface-container)]");
	});

	it("has rounded-[var(--r-default)] radius", () => {
		render(<SearchField placeholder="Search..." />);
		const input = screen.getByPlaceholderText("Search...");
		expect(input.className).toContain("rounded-[var(--r-default)]");
	});

	it("has visible border using --border-subtle token", () => {
		render(<SearchField placeholder="Search..." />);
		const input = screen.getByPlaceholderText("Search...");
		expect(input.className).toContain("border-[var(--border-subtle)]");
	});

	it("has focus border using --accent-primary token", () => {
		render(<SearchField placeholder="Search..." />);
		const input = screen.getByPlaceholderText("Search...");
		expect(input.className).toContain("focus:border-[var(--accent-primary)]");
	});

	it("has focus shadow using accent-primary-dim token", () => {
		render(<SearchField placeholder="Search..." />);
		const input = screen.getByPlaceholderText("Search...");
		expect(input.className).toContain("accent-primary-dim");
	});

	it("shows shortcut key hint when provided", () => {
		render(<SearchField shortcutKey="/" />);
		expect(screen.getByText("/")).toBeInTheDocument();
	});

	it("calls onChange when typing", async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<SearchField value="" onChange={handleChange} />);
		const input = screen.getByRole("textbox");
		await user.type(input, "hello");
		expect(handleChange).toHaveBeenCalled();
	});

	it("shows loading spinner when loading", () => {
		const { container } = render(<SearchField loading />);
		const spinner = container.querySelector(".animate-spin");
		expect(spinner).toBeInTheDocument();
	});

	it("does not show loading spinner when not loading", () => {
		const { container } = render(<SearchField />);
		const spinner = container.querySelector(".animate-spin");
		expect(spinner).not.toBeInTheDocument();
	});

	it("shows clear button when value is present", () => {
		render(<SearchField value="test" onChange={vi.fn()} />);
		expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
	});

	it("does not show clear button when value is empty", () => {
		render(<SearchField value="" onChange={vi.fn()} />);
		expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
	});

	it("calls onChange with empty string when clear is clicked", async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<SearchField value="test" onChange={handleChange} />);
		await user.click(screen.getByRole("button", { name: /clear/i }));
		expect(handleChange).toHaveBeenCalledWith("");
	});
});
