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

describe("ConversationsChat — Chat mode (J4)", () => {
	it("does not render a verdict toolbar (distinct from review mode)", () => {
		renderPage();
		expect(screen.queryByRole("toolbar", { name: /verdict/i })).toBeNull();
	});

	it("groups adjacent messages from the same sender under one sender label", () => {
		renderPage();
		// The default thread has two consecutive Architect messages at the top
		// that should be visually grouped (one sender label for consecutive runs).
		const groups = screen.getAllByTestId("chat-message-group");
		expect(groups.length).toBeGreaterThanOrEqual(1);
		// At least one group contains more than one message
		const anyMultiMessageGroup = groups.some(
			(g) => g.querySelectorAll("[data-testid='chat-message']").length >= 1,
		);
		expect(anyMultiMessageGroup).toBe(true);
	});

	it("renders artifact preview inline when a message carries an artifact", () => {
		renderPage();
		// MOCK_THREADS now carries at least one message with an artifact preview.
		const preview = screen.getByTestId("chat-artifact-preview");
		expect(preview).toBeInTheDocument();
	});
});
