/**
 * AC1 RED — WorkPortfolio verdict filter component tests.
 *
 * AC-7:  Outcome data visible in portfolio (BetCard verdict badge)
 * AC-8:  Portfolio filterable by verdict (multi-select verdict pills)
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkPortfolio } from "../WorkPortfolio";

// Bets fixture — mix of verdict statuses
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

vi.mock("../../hooks/useBets", () => ({
	useBets: () => ({
		bets: MOCK_BETS_WITH_OUTCOMES,
		loading: false,
		error: null,
		refresh: vi.fn(),
	}),
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

function renderPortfolio(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/work/portfolio"]}>
			<Routes>
				<Route path="/work/portfolio" element={<WorkPortfolio />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkPortfolio — Verdict filter pills (AC-8)", () => {
	it("AC-8: renders verdict filter pills (Validated, Refuted, Partial, Inconclusive, Not evaluated)", () => {
		renderPortfolio();
		expect(screen.getByTestId("verdict-filter-pills")).toBeInTheDocument();
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

		// Only "Refuted Bet" should be visible in the grid
		expect(screen.getByText("Refuted Bet")).toBeInTheDocument();
		expect(screen.queryByText("Validated Bet")).not.toBeInTheDocument();
		expect(screen.queryByText("Partial Bet")).not.toBeInTheDocument();
		expect(screen.queryByText("Not Evaluated Bet")).not.toBeInTheDocument();
	});

	it("AC-8: clicking 'Not evaluated' shows bets with null verdict", async () => {
		const user = userEvent.setup();
		renderPortfolio();

		await user.click(screen.getByRole("button", { name: /not evaluated/i }));

		// "Not Evaluated Bet" and "Active Bet" (both have null outcomeVerdict)
		expect(screen.getByText("Not Evaluated Bet")).toBeInTheDocument();
		expect(screen.getByText("Active Bet")).toBeInTheDocument();
		expect(screen.queryByText("Validated Bet")).not.toBeInTheDocument();
		expect(screen.queryByText("Refuted Bet")).not.toBeInTheDocument();
	});

	it("AC-8: multiple verdict pills can be active simultaneously (multi-select)", async () => {
		const user = userEvent.setup();
		renderPortfolio();

		// Select both Validated and Refuted
		await user.click(screen.getByRole("button", { name: /validated/i }));
		await user.click(screen.getByRole("button", { name: /refuted/i }));

		// Both Validated Bet and Refuted Bet should appear
		expect(screen.getByText("Validated Bet")).toBeInTheDocument();
		expect(screen.getByText("Refuted Bet")).toBeInTheDocument();
		// Partial should not appear
		expect(screen.queryByText("Partial Bet")).not.toBeInTheDocument();
	});

	it("AC-8: clicking active pill again deactivates it (toggle)", async () => {
		const user = userEvent.setup();
		renderPortfolio();

		// Select Validated
		await user.click(screen.getByRole("button", { name: /validated/i }));
		expect(screen.queryByText("Refuted Bet")).not.toBeInTheDocument();

		// Deselect Validated — should show all bets again
		await user.click(screen.getByRole("button", { name: /validated/i }));
		expect(screen.getByText("Refuted Bet")).toBeInTheDocument();
		expect(screen.getByText("Validated Bet")).toBeInTheDocument();
	});

	it("AC-7: BetCard shows verdict badge when outcomeVerdict is set", () => {
		renderPortfolio();
		// The BetCard for "Validated Bet" should show the verdict badge
		expect(screen.getByTestId("bet-card-verdict-badge-b1")).toBeInTheDocument();
	});

	it("AC-7: BetCard shows no verdict badge when outcomeVerdict is null", () => {
		renderPortfolio();
		// The BetCard for "Not Evaluated Bet" should NOT show the verdict badge
		expect(screen.queryByTestId("bet-card-verdict-badge-b4")).not.toBeInTheDocument();
	});
});
