import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeyValue } from "@hyperidle/design-system";

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
		expect(label).toHaveClass("uppercase", "font-heading", "text-xs", "tracking-wider");
	});

	it("value has text-sm styling", () => {
		render(<KeyValue label="Owner" value="Alice" />);
		const value = screen.getByText("Alice");
		expect(value).toHaveClass("text-sm");
	});
});
