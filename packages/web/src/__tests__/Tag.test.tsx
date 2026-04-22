import { Tag } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Tag", () => {
	it("renders label text", () => {
		render(<Tag label="product" />);
		expect(screen.getByText("product")).toBeInTheDocument();
	});

	it("applies badge-neutral and badge-sm classes", () => {
		render(<Tag label="bet" />);
		const tag = screen.getByText("bet");
		expect(tag).toHaveClass("badge", "badge-neutral", "badge-sm");
	});

	it("does not have border classes", () => {
		render(<Tag label="task" />);
		const tag = screen.getByText("task");
		expect(tag).not.toHaveClass("badge-outline");
		expect(tag).not.toHaveClass("border");
	});

	it("renders as a span element", () => {
		render(<Tag label="pitch" />);
		const tag = screen.getByText("pitch");
		expect(tag.tagName).toBe("SPAN");
	});
});
