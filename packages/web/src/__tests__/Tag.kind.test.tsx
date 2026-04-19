import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tag } from "../components/Tag";

// J1 — Tag kind variant tests. Live in a separate file from Tag.test.tsx so
// the original baseline assertions stay byte-for-byte unchanged (acceptance
// criterion: existing Tag tests pass with no modification).

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
		// have their own tint. We assert the absence of badge-neutral and the
		// presence of the badge primitive itself.
		expect(wrapper).toHaveClass("badge");
		expect(wrapper).not.toHaveClass("badge-neutral");
	});

	it("renders identically to baseline when kind is omitted (no SVG, neutral chip)", () => {
		const { container } = render(<Tag label="plain" />);
		const tag = screen.getByText("plain");
		expect(tag.tagName).toBe("SPAN");
		expect(tag).toHaveClass("badge", "badge-neutral", "badge-sm");
		// No icon must be injected when kind is absent.
		expect(container.querySelector("svg")).toBeNull();
	});
});
