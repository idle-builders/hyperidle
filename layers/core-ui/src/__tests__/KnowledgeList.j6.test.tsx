import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeList } from "../pages/KnowledgeList";

/**
 * N5: KnowledgeList j6 tests updated to use real API-shaped data.
 * The scope indicator still reads from the URL param (J6 AC preserved).
 * Tab default logic now uses status === "draft" (was "needs_human").
 * Scope-based item filtering is removed — the O2 schema has no scope column.
 * Curation suggestions are suppressed (no /api/knowledge/suggestions endpoint yet).
 */

/** API items that include a draft item — Triage should be default tab. */
const ITEMS_WITH_DRAFT = [
	{
		id: "k1",
		topic: "Architecture",
		title: "Auth Strategy",
		body: "Auth",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-02T00:00:00Z",
		signals: {
			lastActivityAt: null,
			accessCount30d: null,
			citationCount: null,
		},
	},
	{
		id: "k2",
		topic: "Process",
		title: "Review Queue Triage Heuristics",
		body: "Triage heuristics",
		format: "markdown",
		status: "draft",
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-03T05:00:00Z",
		signals: {
			lastActivityAt: null,
			accessCount30d: null,
			citationCount: null,
		},
	},
	{
		id: "k3",
		topic: "Architecture",
		title: "Legacy Service Mesh Pattern",
		body: "Legacy mesh",
		format: "markdown",
		status: "archived",
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		signals: {
			lastActivityAt: null,
			accessCount30d: null,
			citationCount: null,
		},
	},
];

/** API items with no draft — Curated should be default tab. */
const ITEMS_NO_DRAFT = [
	{
		id: "k4",
		topic: "Architecture",
		title: "Validated Auth Decision",
		body: "Auth",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-02T00:00:00Z",
		signals: {
			lastActivityAt: null,
			accessCount30d: null,
			citationCount: null,
		},
	},
	{
		id: "k5",
		topic: "Research",
		title: "User Research Summary",
		body: "Research summary",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		signals: {
			lastActivityAt: null,
			accessCount30d: null,
			citationCount: null,
		},
	},
];

// Mock module — each test configures the return value via mockReturnValue
const mockUseFetch = vi.fn();
vi.mock("../hooks/useFetch", () => ({
	useFetch: (...args: unknown[]) => mockUseFetch(...args),
}));

function renderAt(path: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<KnowledgeList />
		</MemoryRouter>,
	);
}

describe("KnowledgeList — J6 scope + tabs + triage", () => {
	beforeEach(() => {
		// Default: items with a draft item so Triage is default
		mockUseFetch.mockReturnValue({
			data: { items: ITEMS_WITH_DRAFT },
			error: null,
			isLoading: false,
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("defaults to the practice scope when no ?scope= is provided", () => {
		renderAt("/knowledge");
		expect(screen.getByTestId("knowledge-scope-indicator")).toHaveTextContent("practice");
	});

	it("reads scope from the URL search param", () => {
		renderAt("/knowledge?scope=product");
		expect(screen.getByTestId("knowledge-scope-indicator")).toHaveTextContent("product");
	});

	it("falls back to practice when scope param is invalid", () => {
		renderAt("/knowledge?scope=bogus");
		expect(screen.getByTestId("knowledge-scope-indicator")).toHaveTextContent("practice");
	});

	it("defaults to the Triage tab when any item has status 'draft'", async () => {
		renderAt("/knowledge");
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: "Triage" })).toHaveAttribute("aria-selected", "true");
		});
		expect(screen.getByTestId("knowledge-triage-view")).toBeInTheDocument();
	});

	it("renders draft items in the Triage view", async () => {
		renderAt("/knowledge");
		const view = await screen.findByTestId("knowledge-triage-view");
		expect(within(view).getByText("Review Queue Triage Heuristics")).toBeInTheDocument();
	});

	it("switches to Curated on tab click", async () => {
		const user = userEvent.setup();
		renderAt("/knowledge");
		await user.click(screen.getByRole("tab", { name: "Curated" }));
		expect(screen.getByRole("tab", { name: "Curated" })).toHaveAttribute("aria-selected", "true");
		expect(screen.getByTestId("knowledge-curated-view")).toBeInTheDocument();
	});

	it("Curated view renders topic group headers with item counts", async () => {
		const user = userEvent.setup();
		renderAt("/knowledge");
		await user.click(screen.getByRole("tab", { name: "Curated" }));
		const curated = await screen.findByTestId("knowledge-curated-view");
		// ITEMS_WITH_DRAFT: only k1 is "active" in "Architecture" topic
		const architectureHeader = within(curated).getByTestId("topic-group-Architecture");
		expect(within(architectureHeader).getByText("Architecture")).toBeInTheDocument();
		// UI-044: singular "1 item" not "1 items"
		expect(within(architectureHeader).getByLabelText("1 item")).toBeInTheDocument();
	});

	it("defaults to Curated tab when no items have status 'draft'", async () => {
		mockUseFetch.mockReturnValue({
			data: { items: ITEMS_NO_DRAFT },
			error: null,
			isLoading: false,
		});
		renderAt("/knowledge");
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: "Curated" })).toHaveAttribute("aria-selected", "true");
		});
	});

	it("shows empty triage state when there are no draft items", async () => {
		mockUseFetch.mockReturnValue({
			data: { items: ITEMS_NO_DRAFT },
			error: null,
			isLoading: false,
		});
		const user = userEvent.setup();
		renderAt("/knowledge");
		// Switch to triage manually
		await user.click(screen.getByRole("tab", { name: "Triage" }));
		expect(await screen.findByTestId("knowledge-triage-empty")).toBeInTheDocument();
	});

	it("shows empty curated state when no active items exist", async () => {
		// @lore visual-parity: tabs are hidden in systemEmpty state (items.length === 0).
		// No tab bar is shown — only the EmptyState component.
		mockUseFetch.mockReturnValue({
			data: { items: [] },
			error: null,
			isLoading: false,
		});
		renderAt("/knowledge");
		// Tabs are hidden in systemEmpty state
		await waitFor(() => {
			expect(screen.queryByRole("tab", { name: "Curated" })).not.toBeInTheDocument();
		});
		expect(await screen.findByTestId("knowledge-curated-empty")).toBeInTheDocument();
	});
});
