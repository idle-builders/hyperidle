import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

	it("renders thread list with review items", () => {
		renderPage();
		expect(screen.getByText("Auth flow implementation")).toBeInTheDocument();
		expect(screen.getByText("Dashboard metrics update")).toBeInTheDocument();
	});

	it("renders ArtifactView for the selected review", () => {
		renderPage();
		// Default selection is the first review (text_diff)
		expect(screen.getByLabelText("Diff view")).toBeInTheDocument();
	});

	it("switches artifact when a different review is clicked", async () => {
		const user = userEvent.setup();
		renderPage();

		// Click the second review item
		const metricsReview = screen.getByText("Dashboard metrics update");
		await user.click(metricsReview);

		// Should now show data_metrics artifact
		expect(screen.getByLabelText("Data metrics")).toBeInTheDocument();
	});
});
