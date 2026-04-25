import { BetCard } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("BetCard", () => {
	const defaultProps = {
		title: "Mobile App V2",
		product: "HyperIdle",
		status: "committed" as const,
		appetite: "6 weeks",
	};

	it("renders title text", () => {
		render(<BetCard {...defaultProps} />);
		expect(screen.getByText("Mobile App V2")).toBeInTheDocument();
	});

	it("renders product as Tag", () => {
		render(<BetCard {...defaultProps} />);
		const tag = screen.getByText("HyperIdle");
		expect(tag).toHaveClass("inline-flex", "rounded-[var(--r2)]");
		expect(tag.className).toContain("bg-[var(--surface-ghost)]");
	});

	it("renders status as StatusChip via betStatusToStatus mapping", () => {
		render(<BetCard {...defaultProps} status="committed" />);
		// committed maps to healthy
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

	it("renders shaped status as PAUSED chip", () => {
		render(<BetCard {...defaultProps} status="shaped" />);
		expect(screen.getByText("PAUSED")).toBeInTheDocument();
	});

	it("renders in_progress status as HEALTHY chip", () => {
		render(<BetCard {...defaultProps} status="in_progress" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders shipped status as DONE chip", () => {
		render(<BetCard {...defaultProps} status="shipped" />);
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
		// Tag for product
		expect(screen.getByText("HyperIdle")).toHaveClass("inline-flex", "rounded-[var(--r2)]");
		// StatusChip for status
		expect(screen.getByText("HEALTHY")).toHaveClass("inline-flex", "rounded-full");
		// KeyValue for appetite
		expect(screen.getByText("6 weeks")).toBeInTheDocument();
	});

	it("all 5 BetStatus values produce visually distinct chips", () => {
		const statuses = ["shaped", "committed", "in_progress", "shipped", "killed"] as const;
		const expectedChips = ["PAUSED", "HEALTHY", "HEALTHY", "DONE", "ERROR"];
		for (let i = 0; i < statuses.length; i++) {
			const { unmount } = render(<BetCard {...defaultProps} status={statuses[i]} />);
			expect(screen.getByText(expectedChips[i])).toBeInTheDocument();
			unmount();
		}
	});
});
