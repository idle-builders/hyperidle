import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkBet } from "../pages/WorkBet";

function renderPage(betId = "b1"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${betId}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet />} />
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
		renderPage("b1");
		expect(screen.getByText("User auth flow")).toBeInTheDocument();
		expect(screen.getByText("Tasks")).toBeInTheDocument();
	});

	it("renders task cards for the bet", () => {
		renderPage("b1");
		expect(screen.getByText("Implement login endpoint")).toBeInTheDocument();
		expect(screen.getByText("Design signup form")).toBeInTheDocument();
		expect(screen.getByText("JWT refresh logic")).toBeInTheDocument();
	});

	it("renders fallback for unknown bet", () => {
		renderPage("nonexistent");
		expect(screen.getByText("Unknown Bet")).toBeInTheDocument();
		expect(screen.getByText("No tasks yet")).toBeInTheDocument();
	});

	it("renders second bet with its tasks", () => {
		renderPage("b2");
		expect(screen.getByText("Dashboard redesign")).toBeInTheDocument();
		expect(screen.getByText("Wireframe layouts")).toBeInTheDocument();
	});
});
