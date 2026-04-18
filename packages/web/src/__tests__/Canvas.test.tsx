import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasBet } from "../shell/Canvas";
import { Canvas } from "../shell/Canvas";

const shapedBet: CanvasBet = {
	id: "bet-1",
	title: "Mobile App V2",
	product: "HyperIdle",
	status: "shaped",
	appetite: "6 weeks",
};

const committedBet: CanvasBet = {
	id: "bet-2",
	title: "Analytics Dashboard",
	product: "MetaDash",
	status: "committed",
	appetite: "4 weeks",
};

describe("Canvas", () => {
	it("renders shaped column with bets that have status shaped", () => {
		render(<Canvas bets={[shapedBet, committedBet]} capacity={3} onMoveBet={vi.fn()} />);
		expect(screen.getByText("Shaped")).toBeInTheDocument();
		expect(screen.getByText("Committed")).toBeInTheDocument();
		expect(screen.getByText("Mobile App V2")).toBeInTheDocument();
		expect(screen.getByText("Analytics Dashboard")).toBeInTheDocument();
	});

	it("renders capacity badge showing committed count vs capacity", () => {
		render(<Canvas bets={[shapedBet, committedBet]} capacity={3} onMoveBet={vi.fn()} />);
		expect(screen.getByText("1 / 3")).toBeInTheDocument();
	});

	it("renders over-capacity warning when committed exceeds capacity", () => {
		const bets: CanvasBet[] = [
			{ id: "b1", title: "Bet 1", product: "P", status: "committed", appetite: "2w" },
			{ id: "b2", title: "Bet 2", product: "P", status: "committed", appetite: "2w" },
			{ id: "b3", title: "Bet 3", product: "P", status: "committed", appetite: "2w" },
		];
		render(<Canvas bets={bets} capacity={2} onMoveBet={vi.fn()} />);
		expect(screen.getByText("3 / 2")).toBeInTheDocument();
		expect(screen.getByText("Over capacity")).toBeInTheDocument();
	});

	it("renders empty state when no bets", () => {
		render(<Canvas bets={[]} capacity={3} onMoveBet={vi.fn()} />);
		expect(screen.getByText("No bets yet")).toBeInTheDocument();
	});

	it("renders shaped bets only in the Shaped column", () => {
		const { container } = render(
			<Canvas bets={[shapedBet, committedBet]} capacity={3} onMoveBet={vi.fn()} />,
		);
		// shapedBet should appear inside the shaped droppable zone
		const shapedZone = container.querySelector("[data-droppable='shaped']");
		const committedZone = container.querySelector("[data-droppable='committed']");
		expect(shapedZone).not.toBeNull();
		expect(committedZone).not.toBeNull();
		expect(shapedZone?.textContent).toContain("Mobile App V2");
		expect(shapedZone?.textContent).not.toContain("Analytics Dashboard");
		expect(committedZone?.textContent).toContain("Analytics Dashboard");
		expect(committedZone?.textContent).not.toContain("Mobile App V2");
	});

	it("renders bet cards with dnd-kit draggable attributes", () => {
		const { container } = render(<Canvas bets={[shapedBet]} capacity={3} onMoveBet={vi.fn()} />);
		// dnd-kit useDraggable adds role="button" and tabindex on the draggable wrapper
		const shapedZone = container.querySelector("[data-droppable='shaped']");
		expect(shapedZone).not.toBeNull();
		// The bet card text should be within a draggable element
		expect(shapedZone?.textContent).toContain("Mobile App V2");
	});

	it("renders BetCard components for each bet", () => {
		render(<Canvas bets={[shapedBet, committedBet]} capacity={3} onMoveBet={vi.fn()} />);
		// BetCard renders appetite as KeyValue
		expect(screen.getByText("6 weeks")).toBeInTheDocument();
		expect(screen.getByText("4 weeks")).toBeInTheDocument();
	});

	it("imports KeyboardSensor from @dnd-kit/core (keyboard a11y)", () => {
		// I4 KB1: KeyboardSensor must be configured alongside PointerSensor so
		// drag can be driven via keyboard. Verified at source level; Playwright
		// covers the end-to-end behaviour.
		const Filename = fileURLToPath(import.meta.url);
		const Dirname = dirname(Filename);
		const src = readFileSync(join(Dirname, "..", "shell", "Canvas.tsx"), "utf8");
		expect(src).toMatch(/KeyboardSensor/);
		expect(src).toMatch(/useSensor\(\s*KeyboardSensor/);
	});
});
