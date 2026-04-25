import { KeyValue } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

	it("label has uppercase styling and font-heading", () => {
		render(<KeyValue label="Owner" value="Alice" />);
		const label = screen.getByText("Owner");
		// K7: tracking-[0.05em] → tracking-[var(--tracking-caps)] per AESTHETICS.md
		// § Typography row "Letter-spacing for caps" (designer-call: +0.02em).
		expect(label).toHaveClass(
			"uppercase",
			"font-heading",
			"text-[11px]",
			"tracking-[var(--tracking-caps)]",
			"font-medium",
		);
	});

	it("value has text-[14px] styling", () => {
		render(<KeyValue label="Owner" value="Alice" />);
		const value = screen.getByText("Alice");
		expect(value).toHaveClass("text-[14px]");
	});
});
