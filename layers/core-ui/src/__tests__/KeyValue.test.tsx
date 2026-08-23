import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeyValue } from "../ds";

describe("KeyValue", () => {
	it("renders label and value text", () => {
		render(<KeyValue label="Status" value="Active" />);
		expect(screen.getByText("Status")).toBeInTheDocument();
		expect(screen.getByText("Active")).toBeInTheDocument();
	});

	it("renders inline layout by default with flex-row", () => {
		const { container } = render(<KeyValue label="Type" value="Bet" />);
		const wrapper = container.firstElementChild;
		expect(wrapper).toHaveClass("flex", "flex-row");
	});

	it("renders stacked layout with flex-col", () => {
		const { container } = render(<KeyValue label="Type" value="Bet" layout="stacked" />);
		const wrapper = container.firstElementChild;
		expect(wrapper).toHaveClass("flex", "flex-col");
	});

	it("label has uppercase styling and the label profile", () => {
		render(<KeyValue label="Owner" value="Alice" />);
		const label = screen.getByText("Owner");
		// K7: tracking-[0.05em] → tracking-[var(--tracking-caps)] per AESTHETICS.md
		// § Typography row "Letter-spacing for caps" (designer-call: +0.02em).
		// U7: font-heading replaced with font-[family-name:var(--font-mono)] for Hearth token parity.
		expect(label).toHaveClass("uppercase", "type-label");
	});

	it("label uses --text-tertiary for color", () => {
		render(<KeyValue label="Owner" value="Alice" />);
		const label = screen.getByText("Owner");
		expect(label.className).toContain("text-[var(--text-tertiary)]");
	});

	it("value uses --text-primary for color", () => {
		render(<KeyValue label="Owner" value="Alice" />);
		const value = screen.getByText("Alice");
		expect(value.className).toContain("text-[var(--text-primary)]");
	});

	it("value has copy profile styling", () => {
		render(<KeyValue label="Owner" value="Alice" />);
		const value = screen.getByText("Alice");
		expect(value).toHaveClass("type-copy");
	});
});
