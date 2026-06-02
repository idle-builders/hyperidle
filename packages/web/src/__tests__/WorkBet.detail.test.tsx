/**
 * J5 — Bet detail page: breadcrumb, markdown body, sortable task table,
 * comment thread.
 *
 * L16: Updated to use overrideBet instead of route-param lookup against
 * inline MOCK_BETS. The pitch body is now rendered as L2 blocks, so the
 * assertion changed from `bet-pitch-body` (legacy <pre>) to `bet-pitch`
 * (the new <section>) and we check for styled block elements rather than
 * the raw testid.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MOCK_BETS } from "../pages/__fixtures__/work-bet-fixtures";
import { WorkBet } from "../pages/WorkBet";

function renderBet(overrideBet = MOCK_BETS.b1): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${overrideBet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={overrideBet} />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkBet — detail page (J5)", () => {
	it("renders breadcrumb Product → Team → Bet", () => {
		renderBet(MOCK_BETS.b1);
		const breadcrumb = screen.getByLabelText("Breadcrumb");
		expect(breadcrumb).toBeInTheDocument();
		const text = breadcrumb.textContent ?? "";
		// The three levels must appear in DOM order (product / team / bet).
		const productIdx = text.indexOf("Alpha");
		const teamIdx = text.indexOf("Alpha Core");
		// The leaf uses the bet id (so BetCard remains the unique source of
		// the title text) with an sr-only full-title expansion.
		const betIdx = text.indexOf("b1");
		expect(productIdx).toBeGreaterThanOrEqual(0);
		expect(teamIdx).toBeGreaterThanOrEqual(productIdx);
		expect(betIdx).toBeGreaterThan(teamIdx);
		// The current-page marker includes both the bet id and the full title
		// in the accessible name.
		const current = breadcrumb.querySelector('[aria-current="page"]');
		expect(current?.textContent).toContain("b1");
		expect(current?.textContent).toContain("User auth flow");
	});

	it("renders pitch body as L2 blocks (no legacy pre)", () => {
		renderBet(MOCK_BETS.b1);
		// The legacy bet-pitch-body <pre> is gone.
		expect(screen.queryByTestId("bet-pitch-body")).not.toBeInTheDocument();
		// The pitch section renders as L2 blocks.
		const pitchSection = document.querySelector("[data-testid='bet-pitch']");
		expect(pitchSection).toBeTruthy();
		// Content is present as block-rendered text (heading text from fixture pitch).
		expect(pitchSection?.textContent).toMatch(/problem/i);
	});

	/**
	 * @lore W3 AC-22: Table replaced by flat task rows. This test updated from
	 * "renders a task table" to verify the new flat-row layout (no <table> element).
	 */
	it("renders task rows as flat clickable divs (no table — W3 AC-22)", () => {
		renderBet(MOCK_BETS.b1);
		// W3 AC-22: no table element
		expect(screen.queryByRole("table")).not.toBeInTheDocument();
		// Task rows render as clickable divs with data-testid="task-row"
		const taskRows = document.querySelectorAll("[data-testid='task-row']");
		expect(taskRows.length).toBeGreaterThan(0);
		// Task titles are visible in the rows
		expect(screen.getByText("Implement login endpoint")).toBeInTheDocument();
		expect(screen.getByText("Design signup form")).toBeInTheDocument();
		expect(screen.getByText("JWT refresh logic")).toBeInTheDocument();
	});

	// @lore L18: The old "bet-comment-thread" (hardcoded fixture comments) is replaced
	// by HostThreadSection (live thread surface). The section renders in loading state
	// until useHostThread resolves; in tests without explicit mocking it shows the
	// loading skeleton.
	it("renders the discussion thread region (HostThreadSection replaces comment fixture)", () => {
		renderBet(MOCK_BETS.b1);
		// HostThreadSection renders loading or content depending on hook state.
		// Either testid proves the section is mounted.
		const loadingEl = screen.queryByTestId("host-thread-section-loading");
		const sectionEl = screen.queryByTestId("host-thread-section");
		expect(loadingEl ?? sectionEl).not.toBeNull();
	});
});
