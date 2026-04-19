/**
 * J5 — Canvas capacity badge & over-capacity rendering.
 * - Capacity badge is visually prominent (N / C format).
 * - "Over capacity" text renders in error red.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasBet } from "../shell/Canvas";
import { Canvas } from "../shell/Canvas";

function committed(id: string): CanvasBet {
	return {
		id,
		title: `Bet ${id}`,
		product: "P",
		status: "committed",
		appetite: "2w",
	};
}

describe("Canvas — capacity badge prominence (J5)", () => {
	it("capacity badge uses prominent styling (not ghost) and shows N / C", () => {
		render(
			<Canvas
				bets={[committed("b1"), committed("b2")]}
				capacity={3}
				onMoveBet={vi.fn()}
			/>,
		);
		const badge = screen.getByTestId("canvas-capacity-badge");
		expect(badge).toBeInTheDocument();
		expect(badge.textContent).toMatch(/2\s*\/\s*3/);
		// Prominence: not a faded ghost badge anymore (J5 AC).
		expect(badge.className).not.toContain("badge-ghost");
	});

	it("'Over capacity' warning renders with error color when over capacity", () => {
		render(
			<Canvas
				bets={[committed("b1"), committed("b2"), committed("b3")]}
				capacity={2}
				onMoveBet={vi.fn()}
			/>,
		);
		const warn = screen.getByText("Over capacity");
		expect(warn).toBeInTheDocument();
		// error-red class applied
		expect(warn.className).toContain("text-error");
		// capacity badge also signals error when over
		const badge = screen.getByTestId("canvas-capacity-badge");
		expect(badge.className).toContain("badge-error");
	});

	it("capacity badge uses neutral/accent styling when within capacity", () => {
		render(
			<Canvas
				bets={[committed("b1")]}
				capacity={3}
				onMoveBet={vi.fn()}
			/>,
		);
		const badge = screen.getByTestId("canvas-capacity-badge");
		expect(badge.className).not.toContain("badge-error");
	});
});
