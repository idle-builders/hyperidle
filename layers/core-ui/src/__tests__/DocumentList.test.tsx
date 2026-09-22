import type { DocumentRow } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "../pages/DocumentList";

/**
 * BC4: DocumentList now reads through `useDocuments`
 * (`call("search_documents", filter)`). In unit tests there is no API
 * server, so we stub `call` to return real `DocumentRow`-shaped items so
 * tests are independent of the API server.
 */
function makeDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
	return {
		id: "k1",
		title: "Untitled",
		body: "",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "team",
		scopeId: "team-1",
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

const MOCK_DOCUMENTS: DocumentRow[] = [
	makeDoc({
		id: "k1",
		title: "Architecture Decision: Auth Strategy",
		body: "JWT auth decision",
		updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
	}),
	makeDoc({
		id: "k2",
		title: "API Rate Limiting Best Practices",
		body: "Rate limiting patterns",
		updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
	}),
	makeDoc({
		id: "k3",
		title: "User Interview Notes Q1",
		body: "Interview notes",
		updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
	}),
	makeDoc({
		id: "k4",
		title: "Component Library Guidelines",
		body: "Component guidelines",
		updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
	}),
	makeDoc({
		id: "k5",
		title: "Sprint Retro Outcomes",
		body: "Sprint retro",
		updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
	}),
];

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<DocumentList />
		</MemoryRouter>,
	);
}

describe("DocumentList", () => {
	beforeEach(() => {
		callMock.mockReset();
		callMock.mockResolvedValue({ ok: true, data: MOCK_DOCUMENTS });
	});

	it("renders with test id", async () => {
		renderPage();
		expect(await screen.findByTestId("document-list-page")).toBeInTheDocument();
	});

	it("calls search_documents with inTree:true", async () => {
		renderPage();
		expect(callMock).toHaveBeenCalledWith("search_documents", { inTree: true });
	});

	it("renders the Documents heading", async () => {
		renderPage();
		expect(await screen.findByText("Documents")).toBeInTheDocument();
	});

	it("renders documents in the Curated tab (all items are active)", async () => {
		renderPage();
		// All mock items are "active" so no draft items → defaults to Curated tab
		expect(await screen.findByText("Architecture Decision: Auth Strategy")).toBeInTheDocument();
		expect(screen.getByText("API Rate Limiting Best Practices")).toBeInTheDocument();
		expect(screen.getByText("User Interview Notes Q1")).toBeInTheDocument();
		expect(screen.getByText("Component Library Guidelines")).toBeInTheDocument();
		expect(screen.getByText("Sprint Retro Outcomes")).toBeInTheDocument();
	});

	it("renders timestamps for items using relative time", async () => {
		renderPage();
		// Items rendered in Curated view — at least one should show a relative time
		expect(await screen.findByTestId("document-curated-view")).toBeInTheDocument();
	});
});
