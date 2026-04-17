import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConversationsChat } from "../pages/ConversationsChat";

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<ConversationsChat />
		</MemoryRouter>,
	);
}

describe("ConversationsChat", () => {
	it("renders with test id", () => {
		renderPage();
		expect(screen.getByTestId("conversations-chat-page")).toBeInTheDocument();
	});

	it("renders thread list with chat threads", () => {
		renderPage();
		// "Sprint planning" appears in both ThreadRow and the chat header h2
		expect(screen.getAllByText("Sprint planning").length).toBeGreaterThanOrEqual(1);
		expect(screen.getByLabelText("Thread: Sprint planning")).toBeInTheDocument();
		expect(screen.getByLabelText("Thread: Bug report: cost tracking")).toBeInTheDocument();
	});

	it("renders messages for the selected thread", () => {
		renderPage();
		expect(screen.getByText("I've shaped three bets for the next cycle.")).toBeInTheDocument();
	});

	it("shows chat message input", () => {
		renderPage();
		expect(screen.getByLabelText("Chat message input")).toBeInTheDocument();
	});

	it("switches thread when a different thread is clicked", async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByLabelText("Thread: Bug report: cost tracking"));

		expect(screen.getByText("The weekly spend is miscalculated.")).toBeInTheDocument();
	});
});
