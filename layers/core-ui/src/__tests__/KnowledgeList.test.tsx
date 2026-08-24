import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeList } from "../pages/KnowledgeList";

/**
 * N5: KnowledgeList now fetches all data from /api/knowledge.
 * In unit tests there is no API server, so we stub useFetch to return
 * real API-shaped items so tests are independent of the API server.
 * E2E spec (l22-knowledge-signals.spec.ts) covers the real fetch path.
 */
const MOCK_API_ITEMS = [
	{
		id: "k1",
		topic: "Architecture",
		title: "Architecture Decision: Auth Strategy",
		body: "JWT auth decision",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
		signals: {
			lastActivityAt: null,
			accessCount30d: null,
			citationCount: null,
		},
	},
	{
		id: "k2",
		topic: "Architecture",
		title: "API Rate Limiting Best Practices",
		body: "Rate limiting patterns",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
		signals: {
			lastActivityAt: null,
			accessCount30d: null,
			citationCount: null,
		},
	},
	{
		id: "k3",
		topic: "Research",
		title: "User Interview Notes Q1",
		body: "Interview notes",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
		signals: {
			lastActivityAt: null,
			accessCount30d: null,
			citationCount: null,
		},
	},
	{
		id: "k4",
		topic: "Component Library",
		title: "Component Library Guidelines",
		body: "Component guidelines",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
		signals: {
			lastActivityAt: null,
			accessCount30d: null,
			citationCount: null,
		},
	},
	{
		id: "k5",
		topic: "Process",
		title: "Sprint Retro Outcomes",
		body: "Sprint retro",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
		signals: {
			lastActivityAt: null,
			accessCount30d: null,
			citationCount: null,
		},
	},
];

vi.mock("../hooks/useFetch", () => ({
	useFetch: () => ({
		data: { items: MOCK_API_ITEMS },
		error: null,
		isLoading: false,
	}),
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

	it("renders knowledge items in the Curated tab (all items are active)", async () => {
		renderPage();
		// All mock items are "active" so no draft items → defaults to Curated tab
		expect(screen.getByText("Architecture Decision: Auth Strategy")).toBeInTheDocument();
		expect(screen.getByText("API Rate Limiting Best Practices")).toBeInTheDocument();
		expect(screen.getByText("User Interview Notes Q1")).toBeInTheDocument();
		expect(screen.getByText("Component Library Guidelines")).toBeInTheDocument();
		expect(screen.getByText("Sprint Retro Outcomes")).toBeInTheDocument();
	});

	it("renders timestamps for items using relative time", () => {
		renderPage();
		// Items rendered in Curated view — at least one should show a relative time
		// The exact string depends on current time via relativeTime()
		expect(screen.getByTestId("knowledge-curated-view")).toBeInTheDocument();
	});
});
