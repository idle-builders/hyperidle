/**
 * @lore U1: BetStatus simplified from 9 to 4 values.
 * shaped → draft, committed|in_progress → active, shipped → completed.
 * Tests updated to use new status values.
 */
import { PitchCard } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("PitchCard", () => {
	const defaultProps = {
		title: "AI-Powered Onboarding",
		hypothesis: "Reducing onboarding steps from 8 to 3 will increase activation by 40%",
		proposer: "Alice Chen",
		// @lore U1: "draft" replaces "shaped"
		status: "draft" as const,
		appetite: "2 weeks",
	};

	it("renders title text", () => {
		render(<PitchCard {...defaultProps} />);
		expect(screen.getByText("AI-Powered Onboarding")).toBeInTheDocument();
	});

	it("renders hypothesis text", () => {
		render(<PitchCard {...defaultProps} />);
		expect(screen.getByText(/Reducing onboarding steps/)).toBeInTheDocument();
	});

	it("renders proposer name", () => {
		render(<PitchCard {...defaultProps} />);
		expect(screen.getByText("Alice Chen")).toBeInTheDocument();
	});

	it("renders status as StatusChip via betStatusToStatus mapping", () => {
		// @lore U1: "draft" (formerly "shaped") maps to "paused"
		render(<PitchCard {...defaultProps} status="draft" />);
		expect(screen.getByText("PAUSED")).toBeInTheDocument();
	});

	it("renders appetite as KeyValue", () => {
		render(<PitchCard {...defaultProps} />);
		expect(screen.getByText("2 weeks")).toBeInTheDocument();
	});

	it("renders kind as Tag when provided", () => {
		render(<PitchCard {...defaultProps} kind="feature" />);
		const tag = screen.getByText("feature");
		expect(tag).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		expect(tag.className).toContain("text-secondary");
	});

	it("does not render kind Tag when omitted", () => {
		const { container } = render(<PitchCard {...defaultProps} />);
		// When kind is omitted, no neutral Tag is rendered (only the StatusChip).
		// Tags use rounded-[var(--r-pill)]; StatusChip uses rounded-full.
		const tags = Array.from(container.querySelectorAll("span")).filter((el) =>
			el.className.includes("rounded-[var(--r-pill)]"),
		);
		expect(tags.length).toBe(0);
	});

	it("renders actions slot content", () => {
		render(<PitchCard {...defaultProps} actions={<button type="button">Promote</button>} />);
		expect(screen.getByText("Promote")).toBeInTheDocument();
	});

	it("calls onClick when card is clicked", () => {
		const handleClick = vi.fn();
		render(<PitchCard {...defaultProps} onClick={handleClick} />);
		const card =
			screen.getByText("AI-Powered Onboarding").closest("[role='button'], button, [onClick]") ??
			screen.getByText("AI-Powered Onboarding").parentElement;
		card?.click();
		expect(handleClick).toHaveBeenCalledOnce();
	});

	it("renders active status as HEALTHY chip", () => {
		// @lore U1: "active" (formerly "committed"/"in_progress") maps to "healthy"
		render(<PitchCard {...defaultProps} status="active" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders killed status as ERROR chip", () => {
		render(<PitchCard {...defaultProps} status="killed" />);
		expect(screen.getByText("ERROR")).toBeInTheDocument();
	});

	it("composes at least 2 Tier 1 primitives (Tag + StatusChip + KeyValue)", () => {
		render(<PitchCard {...defaultProps} kind="exploration" />);
		// Tag for kind
		expect(screen.getByText("exploration")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		// StatusChip for status (draft → PAUSED)
		expect(screen.getByText("PAUSED")).toHaveClass("inline-flex", "rounded-full");
		// KeyValue for appetite
		expect(screen.getByText("2 weeks")).toBeInTheDocument();
	});
});
