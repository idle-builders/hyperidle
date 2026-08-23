import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tag } from "../ds";

describe("Tag", () => {
	it("renders label text", () => {
		render(<Tag label="product" />);
		expect(screen.getByText("product")).toBeInTheDocument();
	});

	it("applies neutral chip classes with pill radius", () => {
		render(<Tag label="bet" />);
		const tag = screen.getByText("bet");
		expect(tag).toHaveClass("inline-flex", "type-metadata");
		expect(tag.className).toContain("rounded-[var(--r-pill)]");
		expect(tag.className).not.toContain("rounded-[var(--r2)]");
		expect(tag.className).toContain("text-[var(--text-secondary)]");
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
