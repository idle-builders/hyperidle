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

describe("ConversationsReview — Reasoning block (J4)", () => {
	it("renders a collapsible Reasoning block before the artifact", () => {
		renderPage();
		const trigger = screen.getByRole("button", { name: /reasoning/i });
		expect(trigger).toBeInTheDocument();
		// Default collapsed: the ol is not rendered
		expect(screen.queryByRole("list", { name: /reasoning steps/i })).toBeNull();
	});

	it("expanding the Reasoning block shows numbered steps", async () => {
		const user = userEvent.setup();
		renderPage();
		await user.click(screen.getByRole("button", { name: /reasoning/i }));
		const list = screen.getByRole("list", { name: /reasoning steps/i });
		expect(list.tagName).toBe("OL");
		const items = screen.getAllByRole("listitem");
		expect(items.length).toBeGreaterThanOrEqual(3);
	});

	it("renders the artifact metadata strip", () => {
		renderPage();
		expect(screen.getByTestId("artifact-metadata-strip")).toBeInTheDocument();
	});
});

describe("ConversationsReview — single-key pre-fill + Enter confirm (J4)", () => {
	it("pressing 'a' pre-fills an approve verdict (not committed yet)", async () => {
		const user = userEvent.setup();
		renderPage();
		// Focus the review header first by clicking Approve
		await user.click(screen.getByRole("button", { name: "Approve" }));
		// Now simulate pressing 'a' again — should pre-fill approve pending.
		await user.keyboard("a");
		// A pending verdict label is rendered
		expect(screen.getByTestId("pending-verdict")).toHaveTextContent(/approve/i);
	});

	it("does not pre-fill a verdict while a text input is focused", async () => {
		const user = userEvent.setup();
		render(
			<MemoryRouter>
				<div>
					<input type="text" data-testid="input" aria-label="test input" />
					<ConversationsReview />
				</div>
			</MemoryRouter>,
		);
		await user.click(screen.getByTestId("input"));
		await user.keyboard("a");
		expect(screen.queryByTestId("pending-verdict")).toBeNull();
	});
});
