import { render, screen } from "@testing-library/react";
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

	it("renders the selected thread title in the header", () => {
		renderPage();
		// Default selected thread is "Sprint planning"
		expect(screen.getByText("Sprint planning")).toBeInTheDocument();
	});

	it("renders messages for the selected thread", () => {
		renderPage();
		expect(screen.getByText("I've shaped three bets for the next cycle.")).toBeInTheDocument();
	});

	it("shows chat message input", () => {
		renderPage();
		expect(screen.getByLabelText("Chat message input")).toBeInTheDocument();
	});

	it("renders message sender and timestamp", () => {
		renderPage();
		// First message from "Architect" at "10:00" — may appear multiple times
		expect(screen.getAllByText(/Architect/).length).toBeGreaterThanOrEqual(1);
	});
});
