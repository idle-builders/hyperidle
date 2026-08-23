/**
 * @lore U1: BetStatus simplified from 9 to 4 values.
 * shaped → draft, committed|in_progress → active, shipped → completed.
 * Tests updated to use new status values.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BetCard } from "../ds";

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

	it("does not render team name as a Tag pill (visual-parity-audit D-05: screen mockups show no tag row)", () => {
		// The team prop is accepted but the Tag row was removed because screen mockups
		// don't show a tag chip on bet cards. The team context lives in portfolio filters.
		render(<BetCard {...defaultProps} />);
		// "HyperIdle" should not appear as a pill element — it may appear in sr context
		// but not as an explicit Tag chip inside the card face.
		const tagEl = screen.queryByText("HyperIdle");
		if (tagEl) {
			// If rendered, must NOT be a Tag pill
			expect(tagEl.className).not.toContain("rounded-[var(--r-pill)]");
		}
	});

	it("renders status as human-readable badge label", () => {
		// visual-parity-audit: status now renders as user-facing label, not StatusChip technical term
		render(<BetCard {...defaultProps} status="active" />);
		expect(screen.getByText("Active")).toBeInTheDocument();
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

	it("renders draft status as 'Draft' badge", () => {
		// visual-parity-audit: human-readable label, not technical StatusChip term
		render(<BetCard {...defaultProps} status="draft" />);
		expect(screen.getByText("Draft")).toBeInTheDocument();
	});

	it("renders active status as 'Active' badge", () => {
		// visual-parity-audit: human-readable label
		render(<BetCard {...defaultProps} status="active" />);
		expect(screen.getByText("Active")).toBeInTheDocument();
	});

	it("renders completed status as 'Completed' badge", () => {
		// visual-parity-audit: human-readable label
		render(<BetCard {...defaultProps} status="completed" />);
		expect(screen.getByText("Completed")).toBeInTheDocument();
	});

	it("renders killed status as 'Killed' badge", () => {
		// visual-parity-audit: human-readable label
		render(<BetCard {...defaultProps} status="killed" />);
		expect(screen.getByText("Killed")).toBeInTheDocument();
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
		(card as HTMLElement | null)?.click();
		expect(handleClick).toHaveBeenCalledOnce();
	});

	it("renders progress bar and text when provided", () => {
		render(<BetCard {...defaultProps} progress={{ done: 3, total: 5 }} />);
		expect(screen.getByText("3/5")).toBeInTheDocument();
		// visual-parity-audit: progress fill uses accent-primary (active status) via inline style
		const { container } = render(<BetCard {...defaultProps} progress={{ done: 3, total: 5 }} />);
		const progressBar = container.querySelector("[role='progressbar']");
		expect(progressBar).toBeInTheDocument();
		const fill = progressBar?.firstElementChild as HTMLElement | null;
		expect(fill).toBeInTheDocument();
	});

	it("composes KeyValue and status badge (visual-parity-audit: Tag row removed per D-05)", () => {
		// visual-parity-audit: status is now a simple pill badge, not StatusChip.
		// Tag row removed — screen mockups show no team tag on bet cards.
		render(<BetCard {...defaultProps} />);
		// Status badge — human-readable label
		expect(screen.getByText("Active")).toBeInTheDocument();
		// KeyValue for appetite
		expect(screen.getByText("6 weeks")).toBeInTheDocument();
	});

	it("all 4 BetStatus values (U1) render human-readable badge labels", () => {
		// visual-parity-audit: user-facing labels instead of StatusChip technical terms
		const statuses = ["draft", "active", "completed", "killed"] as const;
		const expectedLabels = ["Draft", "Active", "Completed", "Killed"];
		for (let i = 0; i < statuses.length; i++) {
			const { unmount } = render(<BetCard {...defaultProps} status={statuses[i]!} />);
			expect(screen.getByText(expectedLabels[i]!)).toBeInTheDocument();
			unmount();
		}
	});
});
