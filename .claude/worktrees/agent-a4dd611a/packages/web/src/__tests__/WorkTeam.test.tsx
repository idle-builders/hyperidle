import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { WorkTeam } from "../pages/WorkTeam";

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<WorkTeam />
		</MemoryRouter>,
	);
}

describe("WorkTeam", () => {
	it("renders with test id", () => {
		renderPage();
		expect(screen.getByTestId("work-team-page")).toBeInTheDocument();
	});

	it("renders Team Board heading", () => {
		renderPage();
		expect(screen.getByText("Team Board")).toBeInTheDocument();
	});

	it("renders kanban columns", () => {
		renderPage();
		expect(screen.getByText("Hold")).toBeInTheDocument();
		expect(screen.getByText("In Progress")).toBeInTheDocument();
		expect(screen.getByText("Review")).toBeInTheDocument();
		expect(screen.getByText("Done")).toBeInTheDocument();
	});

	it("renders task cards in the kanban", () => {
		renderPage();
		expect(screen.getByText("Implement login endpoint")).toBeInTheDocument();
		expect(screen.getByText("Design signup form")).toBeInTheDocument();
	});

	it("opens pitch selector when button clicked", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByText("Select Pitches"));

		expect(screen.getByText("Select Pitch")).toBeInTheDocument();
		expect(screen.getByText("Mobile responsive layout")).toBeInTheDocument();
	});

	it("closes pitch selector when close button clicked", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByText("Select Pitches"));
		expect(screen.getByText("Select Pitch")).toBeInTheDocument();

		await user.click(screen.getByLabelText("Close pitch selector"));
		expect(screen.queryByText("Select Pitch")).not.toBeInTheDocument();
	});
});
