/**
 * AG2 — WorkPortfolio verdict filter component tests (updated).
 *
 * AC-2 (AG2): Outcome-verdict filters appear ONLY when ≥1 bet has a recorded outcome.
 * AC-7 (original): Outcome data visible in portfolio (BetCard verdict badge).
 * AC-8 (original): Portfolio filterable by verdict (multi-select verdict pills).
 *
 * Split into two describe blocks:
 *   1. "no recorded outcomes" — the KEY RED test proving AC-2 bug fix.
 *   2. "with recorded outcomes" — existing pill/filter assertions, re-fixtured.
 *
 * @lore AG2: vi.mock must be at module scope (hoisted by vitest). Use a mutable
 * mockUseBets variable (same pattern as WorkPortfolio.test.tsx) so both describe
 * blocks can use different fixtures without re-declaring the mock.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../WorkPortfolio";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * All bets have null outcomeVerdict — young portfolio with no evaluated bets.
 * The AC-2 fix: verdict pills must NOT appear for this fixture.
 */
const MOCK_BETS_NO_OUTCOMES = [
	{
		id: "b1",
		title: "Active Bet Alpha",
		teamId: "t1",
		status: "active" as const,
		description: "An active bet",
		costAppetite: null,
		atRisk: false,
		outcomeVerdict: null,
	},
	{
		id: "b2",
		title: "Draft Bet Beta",
		teamId: "t2",
		status: "draft" as const,
		description: "A draft bet",
		costAppetite: null,
		atRisk: false,
		outcomeVerdict: null,
	},
	{
		id: "b3",
		title: "Active Bet Gamma",
		teamId: "t1",
		status: "active" as const,
		description: "Another active bet",
		costAppetite: null,
		atRisk: false,
		outcomeVerdict: null,
	},
];

/**
 * Mix of verdict statuses — ≥1 bet has a recorded outcome.
 * Verdict pills SHOULD appear for this fixture.
 */
const MOCK_BETS_WITH_OUTCOMES = [
	{
		id: "b1",
		title: "Validated Bet",
		teamId: "t1",
		status: "completed" as const,
		description: "A validated bet",
		costAppetite: null,
		atRisk: false,
		outcomeVerdict: "validated",
	},
	{
		id: "b2",
		title: "Refuted Bet",
		teamId: "t1",
		status: "killed" as const,
		description: "A refuted bet",
		costAppetite: null,
		atRisk: false,
		outcomeVerdict: "refuted",
	},
	{
		id: "b3",
		title: "Partial Bet",
		teamId: "t1",
		status: "completed" as const,
		description: "A partial bet",
		costAppetite: null,
		atRisk: false,
		outcomeVerdict: "partial",
	},
	{
		id: "b4",
		title: "Not Evaluated Bet",
		teamId: "t1",
		status: "completed" as const,
		description: "A not-evaluated bet",
		costAppetite: null,
		atRisk: false,
		outcomeVerdict: null,
	},
	{
		id: "b5",
		title: "Active Bet",
		teamId: "t2",
		status: "active" as const,
		description: "An active bet",
		costAppetite: null,
		atRisk: false,
		outcomeVerdict: null,
	},
];

// ─── Module-level mock (vitest hoists vi.mock) ────────────────────────────────

// Mutable reference — updated per describe block
const mockUseBets = vi.fn().mockReturnValue({
	bets: MOCK_BETS_NO_OUTCOMES,
	loading: false,
	error: null,
	refresh: vi.fn(),
});

vi.mock("../../hooks/useBets", () => ({
	useBets: (...args: unknown[]) => mockUseBets(...args),
}));

vi.mock("../../hooks/useTeams", () => ({
	useTeams: () => ({
		data: {
			teams: [
				{ id: "t1", name: "Alpha Core" },
				{ id: "t2", name: "Beta Surface" },
			],
		},
		loading: false,
		error: null,
	}),
}));

afterEach(() => {
	vi.clearAllMocks();
	// Reset to no-outcomes fixture (safe default)
	mockUseBets.mockReturnValue({
		bets: MOCK_BETS_NO_OUTCOMES,
		loading: false,
		error: null,
		refresh: vi.fn(),
	});
});

// ─── Render helper ────────────────────────────────────────────────────────────

function renderPortfolio(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/work/portfolio"]}>
			<Routes>
				<Route path="/work/portfolio" element={<WorkPortfolio />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ─── Block 1: No recorded outcomes (AC-2 core — the headline bug fix) ─────────

describe("WorkPortfolio — AC-2: no verdict pills when all outcomeVerdict null", () => {
	// mockUseBets defaults to MOCK_BETS_NO_OUTCOMES (set in module scope and afterEach)

	it("AC-2 (KEY): does NOT render verdict-filter-pills when all bets have null outcomeVerdict", () => {
		renderPortfolio();
		// This is the RED test — current code renders verdict pills whenever bets.length > 0.
		// After AG2 fix: verdict pills only appear when hasAnyRecordedOutcome === true.
		expect(screen.queryByTestId("verdict-filter-pills")).not.toBeInTheDocument();
	});

	it("AC-2: no verdict pill buttons rendered when no outcomes recorded", () => {
		renderPortfolio();
		expect(screen.queryByRole("button", { name: /validated/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /refuted/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /partial/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /inconclusive/i })).not.toBeInTheDocument();
		// "Not evaluated" verdict pill must not render; "New bet" button is expected
		expect(screen.queryByRole("button", { name: /^not evaluated$/i })).not.toBeInTheDocument();
	});

	it("AC-3 (status gate): status filter renders when ≥2 distinct status buckets exist", () => {
		// MOCK_BETS_NO_OUTCOMES has active + draft = 2 buckets
		renderPortfolio();
		expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^active$/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^draft$/i })).toBeInTheDocument();
	});

	it("AC-3 (team gate): team filter renders when ≥2 distinct team ids", () => {
		// MOCK_BETS_NO_OUTCOMES has t1 + t2 = 2 teams
		renderPortfolio();
		expect(screen.getByRole("button", { name: /alpha core/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /beta surface/i })).toBeInTheDocument();
	});
});

// ─── Block 2: With recorded outcomes (existing tests, re-fixtured) ────────────

describe("WorkPortfolio — Verdict filter pills (AC-8, with outcomes)", () => {
	// Switch fixture to with-outcomes for this block
	beforeEach(() => {
		mockUseBets.mockReturnValue({
			bets: MOCK_BETS_WITH_OUTCOMES,
			loading: false,
			error: null,
			refresh: vi.fn(),
		});
	});

	it("AC-2 inverse: renders verdict-filter-pills when ≥1 bet has recorded outcome", () => {
		renderPortfolio();
		expect(screen.getByTestId("verdict-filter-pills")).toBeInTheDocument();
	});

	it("AC-8: renders all five verdict pill options", () => {
		renderPortfolio();
		expect(screen.getByRole("button", { name: /validated/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /refuted/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /partial/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /inconclusive/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /not evaluated/i })).toBeInTheDocument();
	});

	it("AC-8: clicking 'Refuted' shows only refuted bets", async () => {
		const user = userEvent.setup();
		renderPortfolio();

		await user.click(screen.getByRole("button", { name: /refuted/i }));

		expect(screen.getByText("Refuted Bet")).toBeInTheDocument();
		expect(screen.queryByText("Validated Bet")).not.toBeInTheDocument();
		expect(screen.queryByText("Partial Bet")).not.toBeInTheDocument();
		expect(screen.queryByText("Not Evaluated Bet")).not.toBeInTheDocument();
	});

	it("AC-8: clicking 'Not evaluated' shows bets with null verdict", async () => {
		const user = userEvent.setup();
		renderPortfolio();

		await user.click(screen.getByRole("button", { name: /not evaluated/i }));

		expect(screen.getByText("Not Evaluated Bet")).toBeInTheDocument();
		expect(screen.getByText("Active Bet")).toBeInTheDocument();
		expect(screen.queryByText("Validated Bet")).not.toBeInTheDocument();
		expect(screen.queryByText("Refuted Bet")).not.toBeInTheDocument();
	});

	it("AC-8: multiple verdict pills can be active simultaneously (multi-select)", async () => {
		const user = userEvent.setup();
		renderPortfolio();

		await user.click(screen.getByRole("button", { name: /validated/i }));
		await user.click(screen.getByRole("button", { name: /refuted/i }));

		expect(screen.getByText("Validated Bet")).toBeInTheDocument();
		expect(screen.getByText("Refuted Bet")).toBeInTheDocument();
		expect(screen.queryByText("Partial Bet")).not.toBeInTheDocument();
	});

	it("AC-8: clicking active pill again deactivates it (toggle)", async () => {
		const user = userEvent.setup();
		renderPortfolio();

		await user.click(screen.getByRole("button", { name: /validated/i }));
		expect(screen.queryByText("Refuted Bet")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /validated/i }));
		expect(screen.getByText("Refuted Bet")).toBeInTheDocument();
		expect(screen.getByText("Validated Bet")).toBeInTheDocument();
	});

	it("AC-7: BetCard shows verdict badge when outcomeVerdict is set", () => {
		renderPortfolio();
		expect(screen.getByTestId("bet-card-verdict-badge-b1")).toBeInTheDocument();
	});

	it("AC-7: BetCard shows no verdict badge when outcomeVerdict is null", () => {
		renderPortfolio();
		expect(screen.queryByTestId("bet-card-verdict-badge-b4")).not.toBeInTheDocument();
	});
});
