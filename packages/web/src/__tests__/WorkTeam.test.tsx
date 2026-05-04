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
		expect(screen.getByText("Planned")).toBeInTheDocument();
		expect(screen.getByText("Blocked")).toBeInTheDocument();
		expect(screen.getByText("In Progress")).toBeInTheDocument();
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

	it("composes Canvas (top) and Kanban (bottom) in DOM order", () => {
		// I4 P2: WorkTeam must show Canvas above the Kanban board.
		renderPage();
		const canvas = screen.getByTestId("work-team-canvas");
		const kanban = screen.getByTestId("work-team-kanban");
		expect(canvas).toBeInTheDocument();
		expect(kanban).toBeInTheDocument();
		const order = canvas.compareDocumentPosition(kanban);
		// Node.DOCUMENT_POSITION_FOLLOWING === 4 → kanban follows canvas
		expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});
