/**
 * L1a — `ThreadHostBanner` rendering tests.
 *
 * Red phase: the component throws "Not implemented"; every render
 * test surfaces the error.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThreadHostBanner } from "../ds";

const baseProps = {
	hostKind: "team" as const,
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

	describe("agent presence dots", () => {
		it("shows a presence dot labeled with the agent's status when active or in error", () => {
			const { rerender } = render(
				<ThreadHostBanner
					{...baseProps}
					participants={[{ id: "agent-1", name: "Aria", isAgent: true, operationalStatus: "active" }]}
				/>,
			);
			expect(screen.getByLabelText(/Aria.*active/i)).toBeInTheDocument();

			rerender(
				<ThreadHostBanner
					{...baseProps}
					participants={[{ id: "agent-1", name: "Aria", isAgent: true, operationalStatus: "error" }]}
				/>,
			);
			expect(screen.getByLabelText(/Aria.*error/i)).toBeInTheDocument();
		});

		it("shows no presence dot for an idle agent, a human, or a status-less participant", () => {
			const { rerender } = render(
				<ThreadHostBanner
					{...baseProps}
					participants={[{ id: "agent-1", name: "Aria", isAgent: true, operationalStatus: "idle" }]}
				/>,
			);
			expect(screen.queryByLabelText(/Aria.*idle/i)).toBeNull();

			rerender(
				<ThreadHostBanner {...baseProps} participants={[{ id: "u-founder", name: "Alice", isAgent: false }]} />,
			);
			expect(screen.queryByLabelText(/Alice.*active/i)).toBeNull();
			expect(screen.queryByLabelText(/Alice.*error/i)).toBeNull();

			rerender(
				<ThreadHostBanner {...baseProps} participants={[{ id: "agent-1", name: "Aria" }]} />,
			);
			expect(screen.queryByLabelText(/Aria.*active/i)).toBeNull();
			expect(screen.queryByLabelText(/Aria.*error/i)).toBeNull();
		});
	});
});
