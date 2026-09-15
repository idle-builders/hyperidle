/**
 * AD5 — Sidebar Conversations Blocking Badge (AC-4)
 *
 * Tests that the Sidebar renders a count badge on the Conversations section header
 * when conversationsBlockingCount > 0, and hides it when count is 0.
 *
 * Red phase: Sidebar does NOT yet accept a conversationsBlockingCount prop.
 * These tests will FAIL until the prop is added to Sidebar and the badge rendered.
 */

import { render as renderRaw, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "../shell/Sidebar";

// UI-080: Sidebar uses <Link> — requires router context.
function render(element: ReactElement): ReturnType<typeof renderRaw> {
	return renderRaw(<MemoryRouter>{element}</MemoryRouter>);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
	activeView: "conversations" as const,
	onViewChange: vi.fn(),
	threads: [],
	selectedThreadId: null,
	onSelectThread: vi.fn(),
	teams: [],
	activeTeamId: null,
	onSelectTeam: vi.fn(),
	onAssistantClick: vi.fn(),
	assistantOverlayOpen: false,
	onSettingsClick: vi.fn(),
	settingsOpen: false,
	onSearchClick: vi.fn(),
};

// ---------------------------------------------------------------------------
// AD5 — AC-4: Conversations blocking badge
// ---------------------------------------------------------------------------

describe("AD5 — AC-4: Sidebar conversations blocking badge", () => {
	it("renders badge with count when conversationsBlockingCount is 3", () => {
		render(<Sidebar {...defaultProps} conversationsBlockingCount={3} />);

		const badge = screen.getByTestId("conversations-blocking-badge");
		expect(badge).toBeInTheDocument();
		expect(badge).toHaveTextContent("3");
	});

	it("does NOT render badge when conversationsBlockingCount is 0", () => {
		render(<Sidebar {...defaultProps} conversationsBlockingCount={0} />);

		expect(screen.queryByTestId("conversations-blocking-badge")).not.toBeInTheDocument();
	});

	it("does NOT render badge when conversationsBlockingCount is undefined", () => {
		render(<Sidebar {...defaultProps} />);

		expect(screen.queryByTestId("conversations-blocking-badge")).not.toBeInTheDocument();
	});

	it("renders badge with count 1", () => {
		render(<Sidebar {...defaultProps} conversationsBlockingCount={1} />);

		const badge = screen.getByTestId("conversations-blocking-badge");
		expect(badge).toBeInTheDocument();
		expect(badge).toHaveTextContent("1");
	});

	it("renders badge with count 99 (not truncated)", () => {
		render(<Sidebar {...defaultProps} conversationsBlockingCount={99} />);

		const badge = screen.getByTestId("conversations-blocking-badge");
		expect(badge).toHaveTextContent("99");
	});

	it("renders '99+' for count 100", () => {
		render(<Sidebar {...defaultProps} conversationsBlockingCount={100} />);

		const badge = screen.getByTestId("conversations-blocking-badge");
		expect(badge).toHaveTextContent("99+");
	});

	it("renders '99+' for count 150", () => {
		render(<Sidebar {...defaultProps} conversationsBlockingCount={150} />);

		const badge = screen.getByTestId("conversations-blocking-badge");
		expect(badge).toHaveTextContent("99+");
	});

	it("badge is inside or adjacent to the Conversations section header area", () => {
		const { container } = render(<Sidebar {...defaultProps} conversationsBlockingCount={5} />);

		// The conversations section should contain the badge
		const convSectionArea = container
			.querySelector("[data-section='conversations'], [data-section-header='conversations']")
			?.closest("div, li, section");

		const badge = screen.getByTestId("conversations-blocking-badge");
		expect(badge).toBeInTheDocument();

		if (convSectionArea) {
			expect(convSectionArea.contains(badge)).toBe(true);
		}
	});

	it("only ONE conversations badge is rendered (no duplication)", () => {
		render(<Sidebar {...defaultProps} conversationsBlockingCount={5} />);

		const allBadges = screen.getAllByTestId("conversations-blocking-badge");
		expect(allBadges).toHaveLength(1);
	});

	it("accepts conversationsBlockingCount as an optional prop", () => {
		// Should render without error when prop is omitted
		expect(() => render(<Sidebar {...defaultProps} />)).not.toThrow();
	});

});

