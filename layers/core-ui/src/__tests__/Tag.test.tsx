import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tag, type TagKind } from "../ds";

describe("Tag", () => {
	it("renders the label text", () => {
		render(<Tag label="product" />);
		expect(screen.getByText("product")).toBeInTheDocument();
	});

	it("renders no icon and no kind aria-label when kind is omitted", () => {
		const { container } = render(<Tag label="plain" />);
		expect(screen.getByText("plain")).toBeInTheDocument();
		expect(container.querySelector("svg")).toBeNull();
	});

	it('renders a decorative icon when kind="pattern"', () => {
		const { container } = render(<Tag label="repeating" kind="pattern" />);
		expect(screen.getByText("repeating")).toBeInTheDocument();
		const svg = container.querySelector("svg");
		expect(svg?.getAttribute("aria-hidden")).toBe("true");
	});

	it('names the kind in sr-only text when kind="decision"', () => {
		render(<Tag label="approved" kind="decision" />);
		expect(screen.getByText("Decision:")).toBeInTheDocument();
		expect(screen.getByText("approved")).toBeInTheDocument();
	});

	it('names the kind in sr-only text when kind="failure"', () => {
		render(<Tag label="oops" kind="failure" />);
		expect(screen.getByText("Failure:")).toBeInTheDocument();
		expect(screen.getByText("oops")).toBeInTheDocument();
	});

	it("falls back to the plain tag (no icon, no kind label) for an unknown kind value", () => {
		// A caller may bridge a wider domain enum into TagKind via `kind={item.kind as TagKind}`.
		// A runtime value outside the Tier-2 set must not crash — it renders the plain tag.
		const unknownKind = "insight" as unknown as TagKind;
		const { container } = render(<Tag label="weird" kind={unknownKind} />);
		expect(screen.getByText("weird")).toBeInTheDocument();
		expect(container.querySelector("svg")).toBeNull();
	});
});
