import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { KnowledgeDetail } from "../pages/KnowledgeDetail";

function renderPage(knowledgeId: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${knowledgeId}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeDetail — J7 factory scope treatment", () => {
	it("does NOT render an Edit button for a factory-scope item", () => {
		// k11 is a factory-scope item (Agent Autonomy Policy)
		renderPage("k11");
		expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
	});

	it("renders the 'Amendable under review' banner when a factory item needs_human", () => {
		// k12 is factory-scope with status=needs_human
		renderPage("k12");
		const banner = screen.getByTestId("factory-amendable-banner");
		expect(banner).toBeInTheDocument();
		expect(banner).toHaveClass("alert-info");
		expect(banner).toHaveTextContent(/Amendable under review/i);
	});

	it("does NOT render the banner for an active factory item", () => {
		renderPage("k11");
		expect(screen.queryByTestId("factory-amendable-banner")).not.toBeInTheDocument();
	});

	it("does NOT render the banner for a non-factory item even if needs_human", () => {
		// k6 is practice-scope with status=needs_human
		renderPage("k6");
		expect(screen.queryByTestId("factory-amendable-banner")).not.toBeInTheDocument();
	});
});
