import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KnowledgeRow } from "@hyperidle/design-system";

describe("KnowledgeRow — J7 factory mode", () => {
	const defaultProps = {
		title: "Agent Autonomy Policy",
		layer: "L0" as const,
		kind: "decision" as const,
		status: "active" as const,
		timestamp: "1w ago",
	};

	it("uses the compact padding (py-2) when factoryMode is false/omitted", () => {
		const { container } = render(<KnowledgeRow {...defaultProps} />);
		const row = container.firstElementChild as HTMLElement;
		expect(row.className).toContain("py-2");
		expect(row.className).not.toContain("py-4");
	});

	it("uses taller padding (py-4) when factoryMode is true", () => {
		const { container } = render(<KnowledgeRow {...defaultProps} factoryMode version="v2.1" />);
		const row = container.firstElementChild as HTMLElement;
		expect(row.className).toContain("py-4");
	});

	it("applies bold Geist Mono font to the title in factory mode", () => {
		render(<KnowledgeRow {...defaultProps} factoryMode version="v2.1" />);
		const title = screen.getByLabelText(`Knowledge: ${defaultProps.title}`);
		// font-heading == Geist Mono, font-bold applied.
		expect(title.className).toContain("font-bold");
		expect(title.className).toContain("font-heading");
		// Must NOT be serif — AC: "NOT serif"
		expect(title.className).not.toContain("font-serif");
	});

	it("renders a version pill in factory mode", () => {
		render(<KnowledgeRow {...defaultProps} factoryMode version="v2.1" />);
		const pill = screen.getByTestId("knowledge-version-pill");
		expect(pill).toHaveTextContent("v2.1");
		expect(pill).toHaveClass("badge");
		expect(pill).toHaveClass("badge-neutral");
	});

	it("does NOT render the version pill when factoryMode is omitted", () => {
		render(<KnowledgeRow {...defaultProps} />);
		expect(screen.queryByTestId("knowledge-version-pill")).not.toBeInTheDocument();
	});

	it("renders identically to the original when factoryMode is false (regression)", () => {
		// Round-trip: omitting factoryMode must not alter existing class lists
		// relied on by the protected KnowledgeRow.test.tsx.
		const { container } = render(<KnowledgeRow {...defaultProps} />);
		const row = container.firstElementChild as HTMLElement;
		expect(row.className).toContain("flex");
		expect(row.className).toContain("items-center");
		expect(row.className).toContain("gap-2");
		expect(row.className).toContain("px-2");
	});
});
