import { KnowledgeRow } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("KnowledgeRow — J7 factory mode", () => {
	const defaultProps = {
		title: "Agent Autonomy Policy",
		layer: "L0" as const,
		kind: "decision" as const,
		status: "active" as const,
		timestamp: "1w ago",
	};

	/*
	 * @lore W2: Density tokens removed. Padding is now a literal Hearth value
	 * (py-[12px]) instead of var(--density-pad-y). factoryMode does not
	 * control row padding.
	 */
	it("uses Hearth default vertical padding (12px) regardless of factoryMode", () => {
		const { container: plain } = render(<KnowledgeRow {...defaultProps} />);
		const plainRow = plain.firstElementChild as HTMLElement;
		expect(plainRow.className).toContain("py-[12px]");
		expect(plainRow.className).not.toContain("py-[16px]");
		expect(plainRow.className).not.toContain("py-[8px]");
		expect(plainRow.className).not.toContain("var(--density");

		const { container: factory } = render(
			<KnowledgeRow {...defaultProps} factoryMode version="v2.1" />,
		);
		const factoryRow = factory.firstElementChild as HTMLElement;
		expect(factoryRow.className).toContain("py-[12px]");
		expect(factoryRow.className).not.toContain("py-[16px]");
	});

	it("applies bold font to the title in factory mode", () => {
		render(<KnowledgeRow {...defaultProps} factoryMode version="v2.1" />);
		const title = screen.getByLabelText(`Knowledge: ${defaultProps.title}`);
		// U8: font-heading removed (Hearth uses system-ui everywhere); factoryMode uses font-bold only.
		expect(title.className).toContain("font-bold");
		expect(title.className).not.toContain("font-heading");
		// Must NOT be serif — AC: "NOT serif"
		expect(title.className).not.toContain("font-serif");
	});

	it("renders a version pill in factory mode", () => {
		render(<KnowledgeRow {...defaultProps} factoryMode version="v2.1" />);
		const pill = screen.getByTestId("knowledge-version-pill");
		expect(pill).toHaveTextContent("v2.1");
		expect(pill).toHaveClass("inline-flex");
		expect(pill.className).toContain(
			"bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)]",
		);
	});

	it("does NOT render the version pill when factoryMode is omitted", () => {
		render(<KnowledgeRow {...defaultProps} />);
		expect(screen.queryByTestId("knowledge-version-pill")).not.toBeInTheDocument();
	});

	it("renders the canonical row composition (flex + Hearth literal spacing)", () => {
		// @lore W2: gap and px moved from density tokens to Hearth literal values.
		// gap-[12px] (--space-4), px-[24px] (--space-8) per density replacement table.
		const { container } = render(<KnowledgeRow {...defaultProps} />);
		const row = container.firstElementChild as HTMLElement;
		expect(row.className).toContain("flex");
		expect(row.className).toContain("items-center");
		expect(row.className).toContain("gap-[12px]");
		expect(row.className).toContain("px-[24px]");
	});
});
