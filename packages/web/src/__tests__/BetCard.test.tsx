/**
 * @lore U1: BetStatus simplified from 9 to 4 values.
 * shaped → draft, committed|in_progress → active, shipped → completed.
 * Tests updated to use new status values.
 */
import { BetCard } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("BetCard", () => {
	const defaultProps = {
		title: "Mobile App V2",
		team: "HyperIdle",
		// @lore U1: "active" replaces "committed" and "in_progress"
		status: "active" as const,
		appetite: "6 weeks",
	};

	it("renders title text", () => {
		render(<BetCard {...defaultProps} />);
		expect(screen.getByText("Mobile App V2")).toBeInTheDocument();
	});

	it("renders team as Tag", () => {
		render(<BetCard {...defaultProps} />);
		const tag = screen.getByText("HyperIdle");
		expect(tag).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		expect(tag.className).toContain("text-secondary");
	});

	it("renders status as StatusChip via betStatusToStatus mapping", () => {
		// @lore U1: "active" maps to "healthy"
		render(<BetCard {...defaultProps} status="active" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders appetite as KeyValue", () => {
		render(<BetCard {...defaultProps} />);
		expect(screen.getByText("6 weeks")).toBeInTheDocument();
	});

	it("appetite badge is visible when rendered (acceptance criterion)", () => {
		render(<BetCard {...defaultProps} appetite="4 weeks" />);
		const appetiteValue = screen.getByText("4 weeks");
		expect(appetiteValue).toBeVisible();
	});

	it("renders draft status as PAUSED chip", () => {
		// @lore U1: "draft" (formerly "shaped") maps to "paused"
		render(<BetCard {...defaultProps} status="draft" />);
		expect(screen.getByText("PAUSED")).toBeInTheDocument();
	});

	it("renders active status as HEALTHY chip", () => {
		// @lore U1: "active" covers committed + in_progress
		render(<BetCard {...defaultProps} status="active" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders completed status as DONE chip", () => {
		// @lore U1: "completed" (formerly "shipped") maps to "done"
		render(<BetCard {...defaultProps} status="completed" />);
		expect(screen.getByText("DONE")).toBeInTheDocument();
	});

	it("renders killed status as ERROR chip", () => {
		render(<BetCard {...defaultProps} status="killed" />);
		expect(screen.getByText("ERROR")).toBeInTheDocument();
	});

	it("renders actions slot content", () => {
		render(<BetCard {...defaultProps} actions={<button type="button">Archive</button>} />);
		expect(screen.getByText("Archive")).toBeInTheDocument();
	});

	it("calls onClick when card is clicked", () => {
		const handleClick = vi.fn();
		render(<BetCard {...defaultProps} onClick={handleClick} />);
		const card =
			screen.getByText("Mobile App V2").closest("[role='button'], button, [onClick]") ??
			screen.getByText("Mobile App V2").parentElement;
		card?.click();
		expect(handleClick).toHaveBeenCalledOnce();
	});

	it("renders progress bar and text when provided", () => {
		render(<BetCard {...defaultProps} progress={{ done: 3, total: 5 }} />);
		expect(screen.getByText("3/5")).toBeInTheDocument();
		// Progress bar is a custom div with bg-[var(--primary)] fill
		const { container } = render(<BetCard {...defaultProps} progress={{ done: 3, total: 5 }} />);
		const fill = container.querySelector("[class*='bg-[var(--primary)]']");
		expect(fill).toBeInTheDocument();
	});

	it("composes at least 2 Tier 1 primitives (Tag + StatusChip + KeyValue)", () => {
		render(<BetCard {...defaultProps} />);
		// Tag for team
		expect(screen.getByText("HyperIdle")).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		// StatusChip for status (active → HEALTHY)
		expect(screen.getByText("HEALTHY")).toHaveClass("inline-flex", "rounded-full");
		// KeyValue for appetite
		expect(screen.getByText("6 weeks")).toBeInTheDocument();
	});

	it("all 4 BetStatus values (U1) produce visually distinct chips", () => {
		// @lore U1: 4 statuses — draft, active, completed, killed
		const statuses = ["draft", "active", "completed", "killed"] as const;
		const expectedChips = ["PAUSED", "HEALTHY", "DONE", "ERROR"];
		for (let i = 0; i < statuses.length; i++) {
			const { unmount } = render(<BetCard {...defaultProps} status={statuses[i]} />);
			expect(screen.getByText(expectedChips[i])).toBeInTheDocument();
			unmount();
		}
	});
});
