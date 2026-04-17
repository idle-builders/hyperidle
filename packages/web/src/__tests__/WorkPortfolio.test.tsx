import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkPortfolio } from "../pages/WorkPortfolio";

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkPortfolio />
		</MemoryRouter>,
	);
}

describe("WorkPortfolio", () => {
	it("renders with test id", () => {
		renderPage();
		expect(screen.getByTestId("work-portfolio-page")).toBeInTheDocument();
	});

	it("renders Portfolio Canvas heading", () => {
		renderPage();
		expect(screen.getByText("Portfolio Canvas")).toBeInTheDocument();
	});

	it("renders Shaped and Committed columns", () => {
		renderPage();
		expect(screen.getByText("Shaped")).toBeInTheDocument();
		expect(screen.getByText("Committed")).toBeInTheDocument();
	});

	it("renders bet cards in the canvas", () => {
		renderPage();
		expect(screen.getByText("User auth flow")).toBeInTheDocument();
		expect(screen.getByText("Dashboard redesign")).toBeInTheDocument();
		expect(screen.getByText("API rate limiting")).toBeInTheDocument();
	});

	it("shows capacity badge on committed column", () => {
		renderPage();
		expect(screen.getByText("2 / 4")).toBeInTheDocument();
	});
});
