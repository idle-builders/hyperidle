import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { KnowledgeDetail } from "../pages/KnowledgeDetail";

function renderPage(knowledgeId = "k1"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${knowledgeId}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeDetail", () => {
	it("renders with test id", () => {
		renderPage();
		expect(screen.getByTestId("knowledge-detail-page")).toBeInTheDocument();
	});

	it("renders item title for known item", () => {
		renderPage("k1");
		expect(screen.getByText("Architecture Decision: Auth Strategy")).toBeInTheDocument();
	});

	it("renders item content", () => {
		renderPage("k1");
		expect(screen.getByText(/JWT-based authentication with refresh tokens/)).toBeInTheDocument();
	});

	it("renders source and timestamp", () => {
		renderPage("k1");
		expect(screen.getByText("Architecture review session, Architect Agent")).toBeInTheDocument();
		// W3: timestamp appears in both metadata bar and metadata aside; accept multiple occurrences.
		expect(screen.getAllByText("1d ago").length).toBeGreaterThanOrEqual(1);
	});

	it("renders layer and kind tags", () => {
		renderPage("k1");
		// W3: layer and kind appear in both the metadata bar (Tag) and the metadata aside.
		// Use getAllByText to handle multiple occurrences — at least one must exist.
		expect(screen.getAllByText("company").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("belief").length).toBeGreaterThanOrEqual(1);
	});

	it("renders fallback for unknown knowledge item", () => {
		renderPage("nonexistent");
		expect(screen.getByText("Unknown Knowledge Item")).toBeInTheDocument();
	});
});
