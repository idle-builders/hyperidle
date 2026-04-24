import { Tag } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Tag", () => {
	it("renders label text", () => {
		render(<Tag label="product" />);
		expect(screen.getByText("product")).toBeInTheDocument();
	});

	it("applies neutral chip classes", () => {
		render(<Tag label="bet" />);
		const tag = screen.getByText("bet");
		expect(tag).toHaveClass("inline-flex", "rounded-[var(--r2)]", "text-[12px]");
		expect(tag.className).toContain("bg-[var(--surface-ghost)]");
		expect(tag.className).toContain("text-[var(--text-mid)]");
	});

	it("does not have border classes", () => {
		render(<Tag label="task" />);
		const tag = screen.getByText("task");
		expect(tag).toHaveClass("border-none");
	});

	it("renders as a span element", () => {
		render(<Tag label="pitch" />);
		const tag = screen.getByText("pitch");
		expect(tag.tagName).toBe("SPAN");
	});
});
