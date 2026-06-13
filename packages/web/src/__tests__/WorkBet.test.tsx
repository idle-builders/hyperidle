import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { FALLBACK_BET, MOCK_BETS } from "../pages/__fixtures__/work-bet-fixtures";
import { WorkBet } from "../pages/WorkBet";

// WorkBet now calls useBet for runtime data. Tests use overrideBet to
// inject fixture data without crossing the __fixtures__/ import boundary
// in production code.

function renderPage(overrideBet = MOCK_BETS.b1!): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${overrideBet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={overrideBet} />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("WorkBet", () => {
	it("renders with test id", () => {
		renderPage();
		expect(screen.getByTestId("work-bet-page")).toBeInTheDocument();
	});

	it("renders bet details for known bet", () => {
		renderPage(MOCK_BETS.b1);
		// AG4: bet title now appears in both breadcrumb and h1; use heading role
		expect(screen.getByRole("heading", { name: "User auth flow" })).toBeInTheDocument();
		expect(screen.getByText("Tasks")).toBeInTheDocument();
	});

	it("renders task cards for the bet", () => {
		renderPage(MOCK_BETS.b1);
		expect(screen.getByText("Implement login endpoint")).toBeInTheDocument();
		expect(screen.getByText("Design signup form")).toBeInTheDocument();
		expect(screen.getByText("JWT refresh logic")).toBeInTheDocument();
	});

	it("renders second bet with its tasks", () => {
		renderPage(MOCK_BETS.b2);
		// AG4: bet title in breadcrumb + heading; use heading role for specificity
		expect(screen.getByRole("heading", { name: "Dashboard redesign" })).toBeInTheDocument();
		expect(screen.getByText("Wireframe layouts")).toBeInTheDocument();
	});

	it("renders fallback bet data correctly", () => {
		renderPage(FALLBACK_BET);
		// AG4: "Unknown Bet" appears in breadcrumb + heading
		expect(screen.getByRole("heading", { name: "Unknown Bet" })).toBeInTheDocument();
		// AF16 T1: "No tasks yet" now appears in both the progress card and the
		// tasks section when total=0. Use getAllByText to allow multiple matches.
		expect(screen.getAllByText("No tasks yet").length).toBeGreaterThan(0);
	});
});
