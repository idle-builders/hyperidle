import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../pages/KnowledgeDetail";

// Same rationale as KnowledgeDetail.test.tsx: the API hook starts with
// isLoading=true in JSDOM tests (apiFetch never resolves synchronously),
// so the loading skeleton fires before fixture data can render. Settle it.
vi.mock("../hooks/useKnowledgeItem.js", () => ({
	useKnowledgeItem: () => ({ data: null, error: null, isLoading: false }),
}));

function renderPage(knowledgeId: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${knowledgeId}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeDetail — J7 related items sidebar", () => {
	it("renders a related-items sidebar", () => {
		renderPage("k1");
		expect(screen.getByTestId("knowledge-backlinks-card")).toBeInTheDocument();
	});

	it("lists related items by title", () => {
		// k1 is related to k2 and k7 via shared Architecture topic
		renderPage("k1");
		const sidebar = screen.getByTestId("knowledge-backlinks-card");
		const links = within(sidebar).getAllByTestId("related-item");
		expect(links.length).toBeGreaterThanOrEqual(1);
		// k1 explicitly lists k2 as a related item
		expect(within(sidebar).getByText("API Rate Limiting Best Practices")).toBeInTheDocument();
	});

	it("renders a friendly empty-state when there are no related items", () => {
		// An item with no related items shows an empty-state message.
		renderPage("k10");
		const sidebar = screen.getByTestId("knowledge-backlinks-card");
		expect(within(sidebar).getByText(/No backlinks/i)).toBeInTheDocument();
	});
});
