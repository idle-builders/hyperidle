import { BetCard } from "@hyperidle/design-system";
/**
 * J5 — BetCard portfolio-mode props. Additive on top of the base BetCard:
 * a product-card variant that exposes lead agent avatar, active bet count,
 * shipped count, and a progress indicator.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("BetCard — portfolio mode (J5)", () => {
	const baseProps = {
		title: "HyperIdle Core",
		team: "HyperIdle",
		status: "active" as const,
		appetite: "—",
	};

	it("renders lead agent avatar when leadAvatar prop provided", () => {
		render(<BetCard {...baseProps} leadAvatar={{ name: "CEO", initials: "CE" }} />);
		expect(screen.getByLabelText("Lead agent: CEO")).toBeInTheDocument();
		expect(screen.getByText("CE")).toBeInTheDocument();
	});

	it("renders active bets count", () => {
		render(<BetCard {...baseProps} activeBets={4} />);
		expect(screen.getByText("4")).toBeInTheDocument();
		expect(screen.getByText(/active bets?/i)).toBeInTheDocument();
	});

	it("renders singular 'active bet' label for count of 1", () => {
		render(<BetCard {...baseProps} activeBets={1} />);
		expect(screen.getByText(/^active bet$/i)).toBeInTheDocument();
	});

	it("renders shipped count", () => {
		render(<BetCard {...baseProps} shipped={7} />);
		expect(screen.getByText("7")).toBeInTheDocument();
		expect(screen.getByText(/shipped/i)).toBeInTheDocument();
	});

	it("does not render portfolio fields when props are not provided", () => {
		render(<BetCard {...baseProps} />);
		expect(screen.queryByText(/active bets?/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/shipped/i)).not.toBeInTheDocument();
	});

	it("renders progress bar when progress provided", () => {
		render(<BetCard {...baseProps} progress={{ done: 3, total: 5 }} />);
		// Progress is a custom div bar, not a <progress> element
		expect(screen.getByText("3/5")).toBeInTheDocument();
	});
});
