import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@hyperidle/design-system";

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
});
