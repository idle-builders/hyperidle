import { EmptyState } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("EmptyState", () => {
	it("renders title and description as meaningful message", () => {
		render(
			<EmptyState
				title="No knowledge items yet"
				description="Agents will populate this as they learn."
			/>,
		);
		expect(screen.getByText("No knowledge items yet")).toBeInTheDocument();
		expect(screen.getByText("Agents will populate this as they learn.")).toBeInTheDocument();
	});

	it("uses a status role so assistive tech announces it", () => {
		render(<EmptyState title="Nothing needs attention" description="Triage is clear." />);
		const region = screen.getByRole("status");
		expect(region).toHaveTextContent("Nothing needs attention");
		expect(region).toHaveTextContent("Triage is clear.");
	});

	it("supports a testid for integration selectors", () => {
		render(
			<EmptyState
				title="No threads"
				description="Start a conversation to see it here."
				dataTestId="conv-empty"
			/>,
		);
		expect(screen.getByTestId("conv-empty")).toBeInTheDocument();
	});

	it("has warm card styling with surface-elevated background", () => {
		const { container } = render(
			<EmptyState title="No items" description="Nothing here." />,
		);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("bg-[var(--surface-elevated)]");
	});

	it("has --r-default radius for card shape", () => {
		const { container } = render(
			<EmptyState title="No items" description="Nothing here." />,
		);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("rounded-[var(--r-default)]");
	});

	it("has --shadow-subtle shadow for card depth", () => {
		const { container } = render(
			<EmptyState title="No items" description="Nothing here." />,
		);
		const outer = container.firstElementChild;
		expect(outer?.className).toContain("shadow-[var(--shadow-subtle)]");
	});
});
