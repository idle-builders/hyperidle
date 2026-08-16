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
		expect(
			screen.getByRole("heading", { level: 1, name: "Architecture Decision: Auth Strategy" }),
		).toBeInTheDocument();
	});

	it("renders item content", () => {
		renderPage("k1");
		expect(screen.getByText(/JWT-based authentication with refresh tokens/)).toBeInTheDocument();
	});

	it("renders source and does not echo raw timestamp string", () => {
		renderPage("k1");
		expect(screen.getByText("Architecture review session, Architect Agent")).toBeInTheDocument();
		// UI-037: the raw fixture timestamp "1d ago" must not appear verbatim (absoluteDateTime formats it).
		// Fixture k1 has timestamp "1d ago" (not ISO) — absoluteDateTime returns "—" (TIME_PLACEHOLDER).
		expect(screen.queryByText("1d ago")).not.toBeInTheDocument();
	});

	it("renders kind in the metadata aside", () => {
		// AD6: kind Tag removed from the header metadata bar. Kind still appears
		// in the metadata aside card (Kind row). Layer tag removed entirely.
		renderPage("k1");
		const aside = screen.getByTestId("knowledge-metadata-aside");
		// "belief" is the kind value for k1 — appears in the aside's Kind row
		expect(aside.textContent).toContain("belief");
	});

	it("renders fallback for unknown knowledge item", () => {
		renderPage("nonexistent");
		expect(
			screen.getByRole("heading", { level: 1, name: "Unknown Knowledge Item" }),
		).toBeInTheDocument();
	});
});
