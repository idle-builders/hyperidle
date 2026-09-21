/**
 * W3 — Knowledge Pages AC-33 through AC-38: Red phase tests.
 *
 * AC-33: Scope filter pills from data (not fixed Practices/Products/Factory).
 * AC-34: Sort controls visible in both Curated and Triage views.
 * AC-35: Knowledge rows show preview text; no status dots.
 * AC-36: "+ New" button in header.
 * AC-37: Curated/Triage tab switching.
 * AC-38: Content max-width 800px, centered.
 *
 * AC-39 through AC-46 tested `KnowledgeDetail` directly — moved to
 * `pages/__tests__/DocumentDetail.*.test.tsx` (BC4) when that page was
 * rewritten against `call("open_document"/"edit_document", …)`.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DocRow } from "../../ds";
import { KnowledgeList } from "../../pages/KnowledgeList";

// Mock API for KnowledgeList
vi.mock("../../hooks/useFetch", () => ({
	useFetch: (url: string | null) => {
		if (url && url.includes("/api/knowledge")) {
			return {
				data: {
					items: [
						{
							id: "k1",
							title: "Auth Strategy Decision",
							body: "We decided to use JWT.",
							topic: "Auth",
							status: "active",
							scopeKind: "Auth",
							updatedAt: "2026-01-01T10:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
						{
							id: "k2",
							title: "Infrastructure Guidelines",
							body: "Use Docker for all services.",
							topic: "Infrastructure",
							status: "draft",
							scopeKind: "Infrastructure",
							updatedAt: "2026-01-01T11:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
					],
				},
				loading: false,
				error: null,
				refresh: vi.fn(),
			};
		}
		return { data: null, loading: false, error: null, refresh: vi.fn() };
	},
}));

function renderKnowledgeList(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/knowledge"]}>
			<Routes>
				<Route path="/knowledge" element={<KnowledgeList />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// AC-33: Data-driven scope pills (not hardcoded)
// ---------------------------------------------------------------------------
describe("W3 AC-33 — Data-driven scope pills", () => {
	it("does NOT render hardcoded 'Practices' scope pill", () => {
		renderKnowledgeList();
		// Old hardcoded pills should be gone
		expect(screen.queryByRole("button", { name: /^practices$/i })).not.toBeInTheDocument();
	});

	it("does NOT render hardcoded 'Products' scope pill", () => {
		renderKnowledgeList();
		expect(screen.queryByRole("button", { name: /^products$/i })).not.toBeInTheDocument();
	});

	it("does NOT render hardcoded 'Factory' scope pill", () => {
		renderKnowledgeList();
		expect(screen.queryByRole("button", { name: /^factory$/i })).not.toBeInTheDocument();
	});

	it("renders 'All' pill first", () => {
		// AD6: scope pills use role="radio" (accessibility improvement) — query by testid.
		renderKnowledgeList();
		const allPill = screen.getByTestId("scope-pill-all");
		expect(allPill).toBeInTheDocument();
	});

	it("renders static scope pills (Shared, Team, Private)", () => {
		renderKnowledgeList();
		expect(screen.getByTestId("scope-pill-shared")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-team")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-private")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-34: Sort controls visible in both views
// ---------------------------------------------------------------------------
describe("W3 AC-34 — Sort controls always visible", () => {
	it("renders sort controls on the list page", () => {
		renderKnowledgeList();
		// Sort controls: Relevance, Recency, Frequency
		const sortBar = document.querySelector("[data-testid='knowledge-sort-bar']");
		expect(sortBar).not.toBeNull();
	});

	it("renders Recency sort option", () => {
		renderKnowledgeList();
		expect(screen.getByText(/recency/i)).toBeInTheDocument();
	});

	it("sort controls are visible in Curated tab", async () => {
		const user = userEvent.setup();
		renderKnowledgeList();
		// Switch to Curated tab
		const curatedTab = screen.getByRole("tab", { name: /curated/i });
		await user.click(curatedTab);
		// Sort controls still visible
		const sortBar = document.querySelector("[data-testid='knowledge-sort-bar']");
		expect(sortBar).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-35: Knowledge rows show preview; no status dots
// ---------------------------------------------------------------------------
describe("W3 AC-35 — DocRow preview and no status dots", () => {
	it("DocRow renders preview text when preview prop provided", () => {
		render(
			<DocRow
				id="k1"
				title="Auth Strategy Decision"
				status="active"
				timestamp="2026-01-01"
				preview="We decided to use JWT."
			/>,
		);
		expect(screen.getByText("We decided to use JWT.")).toBeInTheDocument();
	});

	it("DocRow does NOT render a status dot element", () => {
		const { container } = render(
			<DocRow id="k1" title="Auth Strategy Decision" status="active" timestamp="2026-01-01" />,
		);
		const dot = container.querySelector("[class*='status-dot'], [data-status-dot], .dot");
		expect(dot).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-36: "+ New" button in header
// ---------------------------------------------------------------------------
describe("W3 AC-36 — '+New' button in knowledge list header", () => {
	it("renders a '+ New' button in the knowledge list header", () => {
		renderKnowledgeList();
		const newBtn = screen.getByRole("button", { name: /\+\s*new|new knowledge/i });
		expect(newBtn).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-37: Curated/Triage tab switching
// ---------------------------------------------------------------------------
describe("W3 AC-37 — Curated/Triage tab switching", () => {
	it("renders Curated and Triage tabs", () => {
		renderKnowledgeList();
		expect(screen.getByRole("tab", { name: /curated/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /triage/i })).toBeInTheDocument();
	});

	it("clicking Curated tab switches view", async () => {
		const user = userEvent.setup();
		renderKnowledgeList();
		await user.click(screen.getByRole("tab", { name: /curated/i }));
		const curatedTab = screen.getByRole("tab", { name: /curated/i });
		expect(curatedTab).toHaveAttribute("aria-selected", "true");
	});
});

// ---------------------------------------------------------------------------
// AC-38: Knowledge list keeps its 800px scan lane
// ---------------------------------------------------------------------------
describe("W3 AC-38 — Knowledge list max-width 800px", () => {
	it("knowledge list keeps 800px measure without centering the scan lane", () => {
		renderKnowledgeList();
		// Check for max-width class pattern inside the page
		const page = document.querySelector("[data-testid='knowledge-list-page']");
		expect(page).not.toBeNull();
		// Content container inside page should have max-width
		const contentDiv = page?.querySelector("[class*='max-w-\\[800px\\]']");
		expect(contentDiv).not.toBeNull();
		expect(contentDiv?.className).not.toMatch(/mx-auto/);
	});
});
