// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionLabel } from "../SectionLabel.js";

describe("SectionLabel", () => {
	it("renders as <h3> by default and shows the label text", () => {
		render(<SectionLabel label="Members" />);
		expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Members");
	});

	it("`as` controls the rendered heading level", () => {
		const { rerender } = render(<SectionLabel label="Overview" as="h2" />);
		expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();

		rerender(<SectionLabel label="Meta" as="h4" />);
		expect(screen.getByRole("heading", { level: 4 })).toBeInTheDocument();
	});

	it("renders `trailing` only when provided", () => {
		const { rerender } = render(<SectionLabel label="Members" />);
		expect(screen.queryByTestId("trailing-slot")).toBeNull();

		rerender(
			<SectionLabel
				label="Members"
				trailing={
					<button type="button" data-testid="trailing-slot">
						New
					</button>
				}
			/>,
		);
		expect(screen.getByTestId("trailing-slot")).toBeInTheDocument();
	});

	it("passes data-testid to the heading element", () => {
		render(<SectionLabel label="Members" data-testid="members-section" />);
		expect(screen.getByTestId("members-section")).toBeInTheDocument();
	});

	it("renders a ReactNode label (not just a string)", () => {
		render(<SectionLabel label={<span data-testid="node-label">Members</span>} />);
		expect(screen.getByTestId("node-label")).toBeInTheDocument();
	});
});
