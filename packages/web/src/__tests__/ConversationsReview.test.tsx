import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConversationsReview } from "../pages/ConversationsReview";

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<ConversationsReview />
		</MemoryRouter>,
	);
}

describe("ConversationsReview", () => {
	it("renders with test id", () => {
		renderPage();
		expect(screen.getByTestId("conversations-review-page")).toBeInTheDocument();
	});

	it("renders the review header with verdict toolbar", () => {
		renderPage();
		expect(screen.getByRole("toolbar", { name: /verdict/i })).toBeInTheDocument();
	});

	it("renders the proposer name in the review header", () => {
		renderPage();
		// Default selected review shows "Developer Agent" as proposer
		expect(screen.getByText("Developer Agent")).toBeInTheDocument();
	});

	it("renders ArtifactView for the selected review", () => {
		renderPage();
		// Default selection is the first review (text_diff)
		expect(screen.getByLabelText("Diff view")).toBeInTheDocument();
	});

	it("renders verdict buttons for all actions", () => {
		renderPage();
		expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
	});
});
