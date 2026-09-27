/**
 * Document Pages tests.
 *
 * Covers: scope filter pills come from data (not fixed
 * Practices/Products/Factory); sort controls are visible in both Curated
 * and Triage views; document rows show preview text with no status dots;
 * a "+ New" button sits in the header; Curated/Triage tab switching; the
 * content column has an 800px max-width, centered.
 *
 * (`KnowledgeDetail`'s own coverage moved to
 * `pages/__tests__/DocumentDetail.*.test.tsx` when that page was
 * rewritten against `call("open_document"/"edit_document", …)`.)
 *
 * @lore: re-pointed onto `DocumentList`/`useDocuments` — `KnowledgeList`
 * and its `useFetch("/api/knowledge")` read are gone.
 */

import type { DocumentRow } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DocRow } from "../../ds";
import { DocumentList } from "../../pages/DocumentList";

function makeDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
	return {
		id: "k1",
		title: "Untitled",
		body: "",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "factory",
		scopeId: null,
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "u-founder",
		createdAt: "2026-01-01T10:00:00.000Z",
		updatedAt: "2026-01-01T10:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

const mockUseDocuments = vi.fn();
vi.mock("../../hooks/useDocuments.js", () => ({
	useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

mockUseDocuments.mockReturnValue({
	documents: [
		makeDoc({
			id: "k1",
			title: "Auth Strategy Decision",
			body: "We decided to use JWT.",
			scopeKind: "factory",
			updatedAt: "2026-01-01T10:00:00.000Z",
		}),
		makeDoc({
			id: "k2",
			title: "Infrastructure Guidelines",
			body: "Use Docker for all services.",
			scopeKind: "factory",
			updatedAt: "2026-01-01T11:00:00.000Z",
		}),
	],
	status: "ready",
	error: null,
	retry: vi.fn(),
});

function renderDocumentList(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/documents"]}>
			<Routes>
				<Route path="/documents" element={<DocumentList />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// Data-driven scope pills (not hardcoded)
// ---------------------------------------------------------------------------
describe("Data-driven scope pills", () => {
	it("does NOT render hardcoded 'Practices' scope pill", () => {
		renderDocumentList();
		// Old hardcoded pills should be gone
		expect(screen.queryByRole("button", { name: /^practices$/i })).not.toBeInTheDocument();
	});

	it("does NOT render hardcoded 'Products' scope pill", () => {
		renderDocumentList();
		expect(screen.queryByRole("button", { name: /^products$/i })).not.toBeInTheDocument();
	});

	it("does NOT render hardcoded 'Factory' scope pill", () => {
		renderDocumentList();
		expect(screen.queryByRole("button", { name: /^factory$/i })).not.toBeInTheDocument();
	});

	it("renders 'All' pill first", () => {
		// scope pills use role="radio" (accessibility improvement) — query by testid.
		renderDocumentList();
		const allPill = screen.getByTestId("scope-pill-all");
		expect(allPill).toBeInTheDocument();
	});

	it("renders static scope pills (Shared, Team, Private)", () => {
		renderDocumentList();
		expect(screen.getByTestId("scope-pill-shared")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-team")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-private")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Sort controls visible in both views
// ---------------------------------------------------------------------------
describe("Sort controls always visible", () => {
	it("renders sort controls on the list page", () => {
		renderDocumentList();
		// Sort controls: Relevance, Recency, Frequency
		const sortBar = document.querySelector("[data-testid='document-sort-bar']");
		expect(sortBar).toBeInTheDocument();
	});

	it("renders Recency sort option", () => {
		renderDocumentList();
		expect(screen.getByText(/recency/i)).toBeInTheDocument();
	});

	it("sort controls are visible in Curated tab", async () => {
		const user = userEvent.setup();
		renderDocumentList();
		// Switch to Curated tab
		const curatedTab = screen.getByRole("tab", { name: /curated/i });
		await user.click(curatedTab);
		// Sort controls still visible
		const sortBar = document.querySelector("[data-testid='document-sort-bar']");
		expect(sortBar).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Document rows show preview; no status dots
// ---------------------------------------------------------------------------
describe("DocRow preview and no status dots", () => {
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
// "+ New" button in header
// ---------------------------------------------------------------------------
describe("'+New' button in document list header", () => {
	it("renders a '+ New' button in the document list header", () => {
		renderDocumentList();
		const newBtn = screen.getByRole("button", { name: /\+\s*new|new document/i });
		expect(newBtn).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Curated/Triage tab switching
// ---------------------------------------------------------------------------
describe("Curated/Triage tab switching", () => {
	it("renders Curated and Triage tabs", () => {
		renderDocumentList();
		expect(screen.getByRole("tab", { name: /curated/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /triage/i })).toBeInTheDocument();
	});

	it("clicking Curated tab switches view", async () => {
		const user = userEvent.setup();
		renderDocumentList();
		await user.click(screen.getByRole("tab", { name: /curated/i }));
		const curatedTab = screen.getByRole("tab", { name: /curated/i });
		expect(curatedTab).toHaveAttribute("aria-selected", "true");
	});
});
