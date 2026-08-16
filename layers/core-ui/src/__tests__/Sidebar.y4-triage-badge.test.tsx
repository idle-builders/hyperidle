/**
 * Y4 — Knowledge Triage Improvements: Sidebar badge tests (red phase).
 *
 * Covers:
 * - knowledgeTriageCount prop renders badge on knowledge section
 * - Badge hidden when count is 0
 * - Badge shows exact count for 1-99
 * - Badge shows "99+" for counts >= 100
 * - data-testid="knowledge-triage-badge" on the badge element
 *
 * All tests in this file should FAIL until implementation is complete.
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
	activeView: "knowledge" as const,
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
// Sidebar badge rendering
// ---------------------------------------------------------------------------

describe("Y4 — Sidebar knowledge triage badge", () => {
	it("renders badge with count when knowledgeTriageCount is 3", () => {
		render(<Sidebar {...defaultProps} knowledgeTriageCount={3} />);

		const badge = screen.getByTestId("knowledge-triage-badge");
		expect(badge).toBeInTheDocument();
		expect(badge).toHaveTextContent("3");
	});

	it("does NOT render badge when knowledgeTriageCount is 0", () => {
		render(<Sidebar {...defaultProps} knowledgeTriageCount={0} />);

		expect(screen.queryByTestId("knowledge-triage-badge")).not.toBeInTheDocument();
	});

	it("does NOT render badge when knowledgeTriageCount is undefined", () => {
		render(<Sidebar {...defaultProps} />);

		expect(screen.queryByTestId("knowledge-triage-badge")).not.toBeInTheDocument();
	});

	it("renders badge with count 1", () => {
		render(<Sidebar {...defaultProps} knowledgeTriageCount={1} />);

		const badge = screen.getByTestId("knowledge-triage-badge");
		expect(badge).toBeInTheDocument();
		expect(badge).toHaveTextContent("1");
	});

	it("renders badge with count 99 (not truncated)", () => {
		render(<Sidebar {...defaultProps} knowledgeTriageCount={99} />);

		const badge = screen.getByTestId("knowledge-triage-badge");
		expect(badge).toHaveTextContent("99");
	});

	it("renders '99+' for count 100", () => {
		render(<Sidebar {...defaultProps} knowledgeTriageCount={100} />);

		const badge = screen.getByTestId("knowledge-triage-badge");
		expect(badge).toHaveTextContent("99+");
	});

	it("renders '99+' for count 999", () => {
		render(<Sidebar {...defaultProps} knowledgeTriageCount={999} />);

		const badge = screen.getByTestId("knowledge-triage-badge");
		expect(badge).toHaveTextContent("99+");
	});

	it("badge is visually inside or adjacent to the Knowledge section header", () => {
		const { container } = render(<Sidebar {...defaultProps} knowledgeTriageCount={5} />);

		// The knowledge section should contain the badge
		const knowledgeSectionArea = container
			.querySelector("[data-section='knowledge'], [data-section-header='knowledge']")
			?.closest("div, li, section");

		// The badge should be in the DOM near the knowledge section
		const badge = screen.getByTestId("knowledge-triage-badge");
		expect(badge).toBeInTheDocument();

		// The badge should be within the same container as the knowledge section
		if (knowledgeSectionArea) {
			expect(knowledgeSectionArea.contains(badge)).toBe(true);
		}
	});

	it("badge is not visible for conversations or work views", () => {
		// Badge should be near knowledge section only — not conversations or work headers
		render(<Sidebar {...defaultProps} knowledgeTriageCount={5} />);

		const badge = screen.getByTestId("knowledge-triage-badge");
		// Confirm the knowledge section header link exists (UI-080: links, not buttons)
		screen.getByRole("link", { name: /knowledge/i });

		// The badge should be in the same area as the knowledge button
		expect(badge).toBeInTheDocument();
		// Make sure there's only ONE badge (not one per section)
		const allBadges = screen.getAllByTestId("knowledge-triage-badge");
		expect(allBadges).toHaveLength(1);
	});

	it("accepts knowledgeTriageCount as an optional prop (does not require it)", () => {
		// Should render without error when prop is omitted
		expect(() => render(<Sidebar {...defaultProps} />)).not.toThrow();
	});
});
