/**
 * AI7 — SectionLabel DS component (RED phase).
 *
 * AC1: One section treatment — SectionLabel owns the uppercase-label style.
 * AC3: Primitive exported from DS; `as` controls heading element; slots work;
 *      `divider` toggles border; caps token present (not literal 0.06em).
 *
 * These tests FAIL until framework/design-system/src/SectionLabel.tsx is created
 * and exported from index.ts.
 */

// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionLabel } from "../SectionLabel.js";

describe("AI7 — SectionLabel component", () => {
	describe("Default element (as='h3')", () => {
		it("renders as <h3> by default", () => {
			render(<SectionLabel label="Members" />);
			const heading = screen.getByRole("heading", { level: 3 });
			expect(heading).toBeInTheDocument();
		});

		it("renders the label text", () => {
			render(<SectionLabel label="Members" />);
			expect(screen.getByText("Members")).toBeInTheDocument();
		});
	});

	describe("`as` prop controls heading level", () => {
		it("renders <h2> when as='h2'", () => {
			render(<SectionLabel label="Overview" as="h2" />);
			const heading = screen.getByRole("heading", { level: 2 });
			expect(heading).toBeInTheDocument();
		});

		it("renders <h3> when as='h3'", () => {
			render(<SectionLabel label="Details" as="h3" />);
			const heading = screen.getByRole("heading", { level: 3 });
			expect(heading).toBeInTheDocument();
		});

		it("renders <h4> when as='h4'", () => {
			render(<SectionLabel label="Meta" as="h4" />);
			const heading = screen.getByRole("heading", { level: 4 });
			expect(heading).toBeInTheDocument();
		});
	});

	describe("Caps token treatment (AC1 / AQ-007)", () => {
		it("label element has the uppercase class", () => {
			const { container } = render(<SectionLabel label="Members" />);
			const heading = container.querySelector("h3");
			expect(heading?.className).toContain("uppercase");
		});

		it("label carries tracking-[var(--tracking-caps-sm)] (token, NOT literal 0.06em)", () => {
			const { container } = render(<SectionLabel label="Members" />);
			const heading = container.querySelector("h3");
			// The token form must be used — no-hardcoded-tracking is error on DS src
			expect(heading?.className).toContain("tracking-[var(--tracking-caps-sm)]");
			// Literal form must NOT appear
			expect(heading?.className).not.toContain("tracking-[0.06em]");
		});

		it("label carries the 13px text size", () => {
			const { container } = render(<SectionLabel label="Members" />);
			const heading = container.querySelector("h3");
			expect(heading?.className).toContain("text-[13px]");
		});

		it("label carries font-[600]", () => {
			const { container } = render(<SectionLabel label="Members" />);
			const heading = container.querySelector("h3");
			expect(heading?.className).toContain("font-[600]");
		});

		it("label carries the tertiary text color", () => {
			const { container } = render(<SectionLabel label="Members" />);
			const heading = container.querySelector("h3");
			expect(heading?.className).toContain("text-[var(--text-tertiary)]");
		});
	});

	describe("Trailing slot (optional)", () => {
		it("omitting `trailing` renders no trailing node", () => {
			render(<SectionLabel label="Members" />);
			// Just the label text, no extra child
			expect(screen.queryByTestId("trailing-slot")).toBeNull();
		});

		it("passing `trailing` renders it in the same row", () => {
			render(
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
	});

	describe("Divider prop (optional, default false)", () => {
		it("no divider by default — no border-b class", () => {
			const { container } = render(<SectionLabel label="Members" />);
			const heading = container.querySelector("h3");
			// The outermost element should NOT have border-b when divider=false
			expect(heading?.className).not.toContain("border-b");
		});

		it("divider=true adds border-b and pb-[6px] classes", () => {
			const { container } = render(<SectionLabel label="Members" divider />);
			const heading = container.querySelector("h3");
			expect(heading?.className).toContain("border-b");
			expect(heading?.className).toContain("pb-[6px]");
		});

		it("divider=false (explicit) has no border-b", () => {
			const { container } = render(<SectionLabel label="Members" divider={false} />);
			const heading = container.querySelector("h3");
			expect(heading?.className).not.toContain("border-b");
		});
	});

	describe("Row layout classes", () => {
		it("outermost element is a flex row", () => {
			const { container } = render(<SectionLabel label="Members" />);
			const heading = container.querySelector("h3");
			expect(heading?.className).toContain("flex");
			expect(heading?.className).toContain("items-center");
		});

		it("keeps the label/content relation in the close range", () => {
			const { container } = render(<SectionLabel label="Members" />);
			const heading = container.querySelector("h3");
			const margin = /\bmb-\[(\d+)px\]/.exec(heading?.className ?? "");
			expect(Number(margin?.[1])).toBeGreaterThanOrEqual(6);
			expect(Number(margin?.[1])).toBeLessThanOrEqual(9);
		});
	});

	describe("data-testid passthrough", () => {
		it("passes data-testid to the heading element", () => {
			render(<SectionLabel label="Members" data-testid="members-section" />);
			expect(screen.getByTestId("members-section")).toBeInTheDocument();
		});
	});

	describe("data-ds-* marker (require-ds-attribute AC3)", () => {
		it("heading carries data-ds-component='SectionLabel'", () => {
			const { container } = render(<SectionLabel label="Members" />);
			const heading = container.querySelector("h3");
			expect(heading?.getAttribute("data-ds-component")).toBe("SectionLabel");
		});

		it("heading carries data-ds-tier='1'", () => {
			const { container } = render(<SectionLabel label="Members" />);
			const heading = container.querySelector("h3");
			expect(heading?.getAttribute("data-ds-tier")).toBe("1");
		});
	});

	describe("ReactNode label", () => {
		it("renders a ReactNode label (not just a string)", () => {
			render(<SectionLabel label={<span data-testid="node-label">Members</span>} />);
			expect(screen.getByTestId("node-label")).toBeInTheDocument();
		});
	});
});
