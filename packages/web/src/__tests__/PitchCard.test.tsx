import { PitchCard } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("PitchCard", () => {
	const defaultProps = {
		title: "AI-Powered Onboarding",
		hypothesis: "Reducing onboarding steps from 8 to 3 will increase activation by 40%",
		proposer: "Alice Chen",
		status: "shaped" as const,
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
		render(<PitchCard {...defaultProps} status="shaped" />);
		// shaped maps to paused
		expect(screen.getByText("PAUSED")).toBeInTheDocument();
	});

	it("renders appetite as KeyValue", () => {
		render(<PitchCard {...defaultProps} />);
		expect(screen.getByText("2 weeks")).toBeInTheDocument();
	});

	it("renders kind as Tag when provided", () => {
		render(<PitchCard {...defaultProps} kind="feature" />);
		expect(screen.getByText("feature")).toHaveClass("badge-neutral");
	});

	it("does not render kind Tag when omitted", () => {
		const { container } = render(<PitchCard {...defaultProps} />);
		// Only the StatusChip's badge-neutral (from paused status) should exist, no Tag for kind
		// @lore StatusChip for "paused" uses badge-neutral, so count is 1 (StatusChip) not 0
		const neutralBadges = container.querySelectorAll(".badge-neutral");
		expect(neutralBadges.length).toBe(1);
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

	it("renders committed status as HEALTHY chip", () => {
		render(<PitchCard {...defaultProps} status="committed" />);
		expect(screen.getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders killed status as ERROR chip", () => {
		render(<PitchCard {...defaultProps} status="killed" />);
		expect(screen.getByText("ERROR")).toBeInTheDocument();
	});

	it("composes at least 2 Tier 1 primitives (Tag + StatusChip + KeyValue)", () => {
		render(<PitchCard {...defaultProps} kind="exploration" />);
		// Tag for kind
		expect(screen.getByText("exploration")).toHaveClass("badge-neutral");
		// StatusChip
		expect(screen.getByText("PAUSED")).toHaveClass("badge");
		// KeyValue for appetite
		expect(screen.getByText("2 weeks")).toBeInTheDocument();
	});
});
