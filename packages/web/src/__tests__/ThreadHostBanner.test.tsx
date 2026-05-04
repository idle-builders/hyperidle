/**
 * L1a — `ThreadHostBanner` rendering tests.
 *
 * Approved-design contract: `plans/L1/design/approved.md` §2.1.
 * Plan §7.1.
 *
 * Red phase: the component throws "Not implemented"; every render
 * test surfaces the error.
 */

import { ThreadHostBanner } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const baseProps = {
	hostKind: "bet" as const,
	hostTitle: "Pricing overhaul",
	hostHref: "/work/bet/bet-1",
	blocking: false,
	resolved: false,
	pinned: false,
	participants: [
		{ id: "u-1", name: "Alex" },
		{ id: "u-2", name: "Bea" },
	],
};

describe("ThreadHostBanner (approved.md §2.1)", () => {
	it("renders the host attachment label", () => {
		render(<ThreadHostBanner {...baseProps} />);
		expect(screen.getByText(/pricing overhaul/i)).toBeInTheDocument();
	});

	it("shows a blocked StatusChip when blocking=true", () => {
		render(<ThreadHostBanner {...baseProps} blocking={true} />);
		expect(screen.getByText("BLOCKED")).toBeInTheDocument();
	});

	it("shows a resolved tag when resolved=true", () => {
		render(<ThreadHostBanner {...baseProps} resolved={true} />);
		expect(screen.getByText(/resolved/i)).toBeInTheDocument();
	});

	it("shows a pinned glyph when pinned=true (lucide pin, not emoji)", () => {
		const { container } = render(<ThreadHostBanner {...baseProps} pinned={true} />);
		// approved.md §2.1: never an emoji. Use the lucide `pin` SVG.
		expect(container.querySelector("svg")).not.toBeNull();
	});

	it("renders up to 3 participant avatars and overflow +N", () => {
		const many = [
			{ id: "u-1", name: "A" },
			{ id: "u-2", name: "B" },
			{ id: "u-3", name: "C" },
			{ id: "u-4", name: "D" },
			{ id: "u-5", name: "E" },
		];
		render(<ThreadHostBanner {...baseProps} participants={many} />);
		expect(screen.getByText(/\+2/)).toBeInTheDocument();
	});
});
