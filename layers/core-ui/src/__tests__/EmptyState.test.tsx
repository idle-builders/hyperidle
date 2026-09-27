import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "../ds";

describe("EmptyState", () => {
	it("renders title and description as a meaningful message", () => {
		render(
			<EmptyState
				title="No documents yet"
				description="Agents will populate this as they learn."
			/>,
		);
		expect(screen.getByText("No documents yet")).toBeInTheDocument();
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

	it("renders a provided icon", () => {
		render(<EmptyState title="T" description="D" icon={<svg data-testid="test-icon" />} />);
		expect(screen.getByTestId("test-icon")).toBeInTheDocument();
	});

	it("renders an action slot when provided", () => {
		render(
			<EmptyState title="T" description="D" action={<button type="button">Click me</button>} />,
		);
		expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
	});

	describe("compact — renders inline, same content and interaction contract", () => {
		it("renders title and description", () => {
			render(<EmptyState compact title="No discussions" description="Start one." />);
			expect(screen.getByText("No discussions")).toBeInTheDocument();
			expect(screen.getByText("Start one.")).toBeInTheDocument();
		});

		it("still exposes role=status and the message", () => {
			render(<EmptyState compact title="No activity yet" description="Nothing happened." />);
			const region = screen.getByRole("status");
			expect(region).toHaveTextContent("No activity yet");
			expect(region).toHaveTextContent("Nothing happened.");
		});

		it("renders an action slot", () => {
			render(
				<EmptyState
					compact
					title="T"
					description="D"
					action={
						<button type="button" onClick={() => undefined}>
							Add one
						</button>
					}
				/>,
			);
			expect(screen.getByRole("button", { name: "Add one" })).toBeInTheDocument();
		});
	});
});
