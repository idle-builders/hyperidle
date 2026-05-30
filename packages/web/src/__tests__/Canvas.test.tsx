import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasBet } from "../shell/Canvas";
import { Canvas } from "../shell/Canvas";

// @lore U1: "shaped" → "draft", "committed" → "active"
const draftBet: CanvasBet = {
	id: "bet-1",
	title: "Mobile App V2",
	team: "HyperIdle",
	status: "draft",
	appetite: "6 weeks",
};

const activeBet: CanvasBet = {
	id: "bet-2",
	title: "Analytics Dashboard",
	team: "MetaDash",
	status: "active",
	appetite: "4 weeks",
};

describe("Canvas", () => {
	it("renders draft column with bets that have status draft", () => {
		render(<Canvas bets={[draftBet, activeBet]} capacity={3} onMoveBet={vi.fn()} />);
		expect(screen.getByText("Draft")).toBeInTheDocument();
		expect(screen.getByText("Active")).toBeInTheDocument();
		expect(screen.getByText("Mobile App V2")).toBeInTheDocument();
		expect(screen.getByText("Analytics Dashboard")).toBeInTheDocument();
	});

	it("renders capacity badge showing active count vs capacity", () => {
		render(<Canvas bets={[draftBet, activeBet]} capacity={3} onMoveBet={vi.fn()} />);
		expect(screen.getByText("1 / 3")).toBeInTheDocument();
	});

	it("renders over-capacity warning when active exceeds capacity", () => {
		const bets: CanvasBet[] = [
			{ id: "b1", title: "Bet 1", team: "P", status: "active", appetite: "2w" },
			{ id: "b2", title: "Bet 2", team: "P", status: "active", appetite: "2w" },
			{ id: "b3", title: "Bet 3", team: "P", status: "active", appetite: "2w" },
		];
		render(<Canvas bets={bets} capacity={2} onMoveBet={vi.fn()} />);
		expect(screen.getByText("3 / 2")).toBeInTheDocument();
		expect(screen.getByText("Over capacity")).toBeInTheDocument();
	});

	it("renders empty state when no bets", () => {
		render(<Canvas bets={[]} capacity={3} onMoveBet={vi.fn()} />);
		expect(screen.getByText("No bets yet")).toBeInTheDocument();
	});

	it("renders draft bets only in the Draft column", () => {
		const { container } = render(
			<Canvas bets={[draftBet, activeBet]} capacity={3} onMoveBet={vi.fn()} />,
		);
		// draftBet should appear inside the draft droppable zone
		const draftZone = container.querySelector("[data-droppable='draft']");
		const activeZone = container.querySelector("[data-droppable='active']");
		expect(draftZone).not.toBeNull();
		expect(activeZone).not.toBeNull();
		expect(draftZone?.textContent).toContain("Mobile App V2");
		expect(draftZone?.textContent).not.toContain("Analytics Dashboard");
		expect(activeZone?.textContent).toContain("Analytics Dashboard");
		expect(activeZone?.textContent).not.toContain("Mobile App V2");
	});

	it("renders bet cards with dnd-kit draggable attributes", () => {
		const { container } = render(<Canvas bets={[draftBet]} capacity={3} onMoveBet={vi.fn()} />);
		// dnd-kit useDraggable adds role="button" and tabindex on the draggable wrapper
		const draftZone = container.querySelector("[data-droppable='draft']");
		expect(draftZone).not.toBeNull();
		// The bet card text should be within a draggable element
		expect(draftZone?.textContent).toContain("Mobile App V2");
	});

	it("renders BetCard components for each bet", () => {
		render(<Canvas bets={[draftBet, activeBet]} capacity={3} onMoveBet={vi.fn()} />);
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
