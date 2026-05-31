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
	 * @lore K11: padding moved from a factoryMode-conditional literal
	 * (py-[8px] / py-[16px]) to var(--density-pad-y) per density-audit.md
	 * § 3.2.2. The K9 ladder now drives row padding; factoryMode no longer
	 * controls it (otherwise factoryMode + comfortable would compound).
	 */
	it("consumes --density-pad-y for vertical padding regardless of factoryMode", () => {
		const { container: plain } = render(<KnowledgeRow {...defaultProps} />);
		const plainRow = plain.firstElementChild as HTMLElement;
		expect(plainRow.className).toContain("py-[var(--density-pad-y)]");
		expect(plainRow.className).not.toContain("py-[16px]");
		expect(plainRow.className).not.toContain("py-[8px]");

		const { container: factory } = render(
			<KnowledgeRow {...defaultProps} factoryMode version="v2.1" />,
		);
		const factoryRow = factory.firstElementChild as HTMLElement;
		expect(factoryRow.className).toContain("py-[var(--density-pad-y)]");
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

	it("renders the canonical row composition (flex + density-aware spacing)", () => {
		// @lore K11: gap and px moved from literal 8 px to density tokens per
		// density-audit.md § 3.2.2. The compositional structure (flex,
		// items-center) is unchanged.
		const { container } = render(<KnowledgeRow {...defaultProps} />);
		const row = container.firstElementChild as HTMLElement;
		expect(row.className).toContain("flex");
		expect(row.className).toContain("items-center");
		expect(row.className).toContain("gap-[var(--density-gap)]");
		expect(row.className).toContain("px-[var(--density-pad-x)]");
	});
});
