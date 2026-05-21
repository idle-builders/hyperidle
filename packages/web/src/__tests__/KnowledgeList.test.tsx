import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeList } from "../pages/KnowledgeList";

// L22 / O3: KnowledgeList now fetches from /api/knowledge for triage items.
// In unit tests there is no API server, so we stub useFetch to return
// the not-loading / no-data state so the mock-data fallback renders.
// @lore L22: mocking useFetch here keeps these unit tests independent of
// the API while the E2E spec (l22-knowledge-signals.spec.ts) covers the
// real fetch path via page.route() intercepts.
vi.mock("../hooks/useFetch", () => ({
	useFetch: () => ({ data: null, error: null, isLoading: false }),
}));

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<KnowledgeList />
		</MemoryRouter>,
	);
}

describe("KnowledgeList", () => {
	it("renders with test id", () => {
		renderPage();
		expect(screen.getByTestId("knowledge-list-page")).toBeInTheDocument();
	});

	it("renders Knowledge Base heading", () => {
		renderPage();
		expect(screen.getByText("Knowledge Base")).toBeInTheDocument();
	});

	it("renders knowledge items", () => {
		renderPage();
		expect(screen.getByText("Architecture Decision: Auth Strategy")).toBeInTheDocument();
		expect(screen.getByText("API Rate Limiting Best Practices")).toBeInTheDocument();
		expect(screen.getByText("User Interview Notes Q1")).toBeInTheDocument();
		expect(screen.getByText("Component Library Guidelines")).toBeInTheDocument();
		expect(screen.getByText("Sprint Retro Outcomes")).toBeInTheDocument();
	});

	it("renders timestamps for items", () => {
		renderPage();
		expect(screen.getByText("1d ago")).toBeInTheDocument();
		expect(screen.getByText("2d ago")).toBeInTheDocument();
	});
});
