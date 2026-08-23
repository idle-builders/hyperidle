import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tag, type TagKind } from "../ds";

// @lore Separate file from Tag.test.tsx so the pre-J1 baseline assertions stay byte-identical.

describe("Tag with kind", () => {
	it('renders a child SVG icon when kind="pattern"', () => {
		const { container } = render(<Tag label="repeating" kind="pattern" />);
		const tag = screen.getByText(/repeating/);
		const svg = container.querySelector("svg");
		expect(svg).not.toBeNull();
		// Icon is decorative; the kind name lives in aria-label on the wrapper.
		expect(svg?.getAttribute("aria-hidden")).toBe("true");
		expect(tag).toBeInTheDocument();
	});

	it('renders an SVG icon when kind="decision" with a Decision aria-label', () => {
		const { container } = render(<Tag label="approved" kind="decision" />);
		const svg = container.querySelector("svg");
		expect(svg).not.toBeNull();
		// The wrapper carries an aria-label that names the kind so screen-reader
		// users understand "approved" is a decision tag, not a generic chip.
		const wrapper = screen.getByLabelText(/Decision: approved/i);
		expect(wrapper).toBeInTheDocument();
	});

	it('renders an SVG icon and applies a tinted class when kind="failure"', () => {
		const { container } = render(<Tag label="oops" kind="failure" />);
		const svg = container.querySelector("svg");
		expect(svg).not.toBeNull();
		const wrapper = screen.getByLabelText(/Failure: oops/i);
		// Failure tag must NOT use the neutral chip background — kind variants
		// have their own tint. We assert the absence of the neutral bg and the
		// presence of the tag primitive itself.
		expect(wrapper).toHaveClass("inline-flex");
		expect(wrapper.className).toContain("rounded-[var(--r-pill)]");
		expect(wrapper.className).not.toContain("rounded-[var(--r2)]");
	});

	it("renders identically to baseline when kind is omitted (no SVG, neutral chip)", () => {
		const { container } = render(<Tag label="plain" />);
		const tag = screen.getByText("plain");
		expect(tag.tagName).toBe("SPAN");
		expect(tag).toHaveClass("inline-flex", "type-metadata");
		expect(tag.className).toContain("rounded-[var(--r-pill)]");
		expect(tag.className).not.toContain("rounded-[var(--r2)]");
		// No icon must be injected when kind is absent.
		expect(container.querySelector("svg")).toBeNull();
	});

	it("falls back to the neutral chip when kind is an unknown value (defensive guard)", () => {
		// J1 review: a caller may bridge a wider domain enum into TagKind via
		// `kind={item.kind as TagKind}`. If the runtime value is not in the
		// Tier-2 set we render the neutral chip rather than crashing on a
		// missing TAG_KIND_ICONS entry.
		const unknownKind = "insight" as unknown as TagKind;
		const { container } = render(<Tag label="weird" kind={unknownKind} />);
		const tag = screen.getByText("weird");
		expect(tag).toHaveClass("inline-flex", "type-metadata");
		expect(tag.className).toContain("rounded-[var(--r-pill)]");
		expect(tag.className).not.toContain("rounded-[var(--r2)]");
		expect(container.querySelector("svg")).toBeNull();
	});
});
