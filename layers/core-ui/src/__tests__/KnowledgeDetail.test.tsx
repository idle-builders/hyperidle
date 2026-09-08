import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../pages/KnowledgeDetail";

// Stub the knowledge API hook to return settled state immediately.
// In real usage the hook fetches from /api/knowledge/:id — in JSDOM tests
// apiFetch never resolves, leaving isLoading=true on the first render and
// causing the loading skeleton to display instead of the fallback.
// Returning isLoading=false simulates a completed fetch with no server data,
// which is the correct state for the fallback rendering tests to exercise.
vi.mock("../hooks/useKnowledgeItem.js", () => ({
	useKnowledgeItem: () => ({ data: null, error: null, isLoading: false }),
}));

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

	// @lore nested-knowledge-items AC6: "renders kind in the metadata aside" is
	// DELETED, not adapted — `kind` is retired vocabulary and the Kind row
	// itself no longer exists on the page (it always read as "Kind —" against
	// real API data, since the real schema has no `kind` column at all).

	it("renders fallback for unknown knowledge item", () => {
		renderPage("nonexistent");
		expect(
			screen.getByRole("heading", { level: 1, name: "Unknown Knowledge Item" }),
		).toBeInTheDocument();
	});
});
