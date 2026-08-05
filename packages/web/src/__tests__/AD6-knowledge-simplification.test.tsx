/**
 * AD6 — Knowledge Cleanup & Scope Simplification: failing tests (red phase).
 *
 * Tests assert the NEW behavior. They will fail against current implementation
 * and pass once the implementation is complete.
 *
 * AC coverage:
 * 1. Static scope pills (All/Shared/Team/Private) always render in KnowledgeList
 * 2. "Shared" filter shows factory+product+practice items
 * 3. "Private" filter shows only user-scoped items
 * 4. Kind badge NOT rendered in list rows
 * 5. Archive button calls POST /api/knowledge/:id/archive
 * 6. Archive success navigates to /knowledge
 * 7. Archive failure shows error message
 * 8. Create page has 3-pill scope picker (not 7-item dropdown)
 * 9. Create page has no kind selector
 * 10. Team pill is disabled when no team context
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeCreate } from "../pages/KnowledgeCreate";
import { KnowledgeDetail } from "../pages/KnowledgeDetail";
import { KnowledgeList } from "../pages/KnowledgeList";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

// Mock BodyEditor — TipTap does not work in JSDOM
vi.mock("@hyperidle/design-system", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/design-system")>();
	return {
		...original,
		BodyEditor: ({
			initialContent,
			onChange,
			editable,
		}: {
			initialContent: string;
			onChange: (md: string) => void;
			editable?: boolean;
		}) => (
			<div data-testid="mock-body-editor" data-editable={editable !== false ? "true" : "false"}>
				<textarea
					data-testid="body-editor-textarea"
					defaultValue={initialContent}
					onChange={(e) => onChange(e.target.value)}
					aria-label="Body editor"
				/>
			</div>
		),
	};
});

// Mock HostThreadSection so KnowledgeDetail renders without fetch complexity
vi.mock("../shell/HostThreadSection", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

// Mock useHostThread — called directly in KnowledgeDetail (not only inside HostThreadSection)
vi.mock("../hooks/useHostThread.js", () => ({
	useHostThread: () => ({ data: null, isLoading: false, error: null }),
}));

// Mock useKnowledgeItem — KnowledgeDetail uses this to fetch live data
vi.mock("../hooks/useKnowledgeItem.js", () => ({
	useKnowledgeItem: () => ({ data: null, isLoading: false, error: null }),
}));

// Mock useAutoSave — KnowledgeDetail uses this for auto-save on edit
vi.mock("../hooks/useAutoSave.js", () => ({
	useAutoSave: () => ({ status: "idle", save: vi.fn() }),
}));

// Mock useCurrentUser
vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "user-1", name: "Test User" } }),
}));

// Mock apiFetch
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

// Mock useFetch for KnowledgeList
const mockUseFetch = vi.fn();
vi.mock("../hooks/useFetch", () => ({
	useFetch: (...args: unknown[]) => mockUseFetch(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
	id: string,
	status: string,
	scopeKind: string,
	title?: string,
): Record<string, unknown> {
	return {
		id,
		topic: "Architecture",
		title: title ?? `Item ${id}`,
		body: `body of ${id}`,
		format: "markdown",
		status,
		version: 1,
		updatedBy: "agent",
		scopeKind,
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-02T00:00:00Z",
		kind: "decision",
		signals: {
			lastActivityAt: null,
			accessCount30d: null,
			citationCount: null,
			relevanceScore: null,
			attentionScore: null,
		},
	};
}

function renderList(path = "/knowledge"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<KnowledgeList />
		</MemoryRouter>,
	);
}

function renderDetail(knowledgeId: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${knowledgeId}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
				<Route path="/knowledge" element={<div data-testid="knowledge-list-page" />} />
			</Routes>
		</MemoryRouter>,
	);
}

function renderCreate(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/knowledge/new"]}>
			<Routes>
				<Route path="/knowledge/new" element={<KnowledgeCreate />} />
				<Route path="/knowledge" element={<div data-testid="knowledge-list-page" />} />
				<Route path="/knowledge/:id" element={<div data-testid="knowledge-detail-page" />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// 1. Static scope pills (All/Shared/Team/Private) always render
// ---------------------------------------------------------------------------

describe("AD6 — KnowledgeList static scope pills", () => {
	beforeEach(() => {
		// Items with various scopeKinds
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("k1", "active", "factory", "Factory item"),
					makeItem("k2", "active", "user", "Private item"),
					makeItem("k3", "active", "team", "Team item"),
				],
			},
			error: null,
			isLoading: false,
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders exactly 4 scope pills: All, Shared, Team, Private", () => {
		renderList();
		const pills = screen.getByTestId("knowledge-scope-pills");
		// Must contain exactly these 4 pills
		expect(within(pills).getByTestId("scope-pill-all")).toBeInTheDocument();
		expect(within(pills).getByTestId("scope-pill-shared")).toBeInTheDocument();
		expect(within(pills).getByTestId("scope-pill-team")).toBeInTheDocument();
		expect(within(pills).getByTestId("scope-pill-private")).toBeInTheDocument();
	});

	it("scope pills are static — render regardless of which scopeKinds appear in items", () => {
		// Even with an empty dataset, all 4 pills render
		mockUseFetch.mockReturnValue({
			data: { items: [makeItem("k1", "active", "factory")] },
			error: null,
			isLoading: false,
		});
		renderList();
		const pills = screen.getByTestId("knowledge-scope-pills");
		expect(within(pills).getByTestId("scope-pill-all")).toBeInTheDocument();
		expect(within(pills).getByTestId("scope-pill-shared")).toBeInTheDocument();
		expect(within(pills).getByTestId("scope-pill-team")).toBeInTheDocument();
		expect(within(pills).getByTestId("scope-pill-private")).toBeInTheDocument();
	});

	it("All pill is active by default (no scope filter applied)", () => {
		renderList();
		const allPill = screen.getByTestId("scope-pill-all");
		expect(allPill).toHaveAttribute("data-active", "true");
		expect(screen.getByTestId("scope-pill-shared")).toHaveAttribute("data-active", "false");
		expect(screen.getByTestId("scope-pill-team")).toHaveAttribute("data-active", "false");
		expect(screen.getByTestId("scope-pill-private")).toHaveAttribute("data-active", "false");
	});
});

// ---------------------------------------------------------------------------
// 2. "Shared" filter shows factory+practice items (not product — moved to Team)
// ---------------------------------------------------------------------------

describe("AD6 — KnowledgeList Shared scope filter", () => {
	const MIXED_ITEMS = [
		makeItem("k-factory", "active", "factory", "Factory knowledge"),
		makeItem("k-product", "active", "product", "Product knowledge"),
		makeItem("k-practice", "active", "practice", "Practice knowledge"),
		makeItem("k-team", "active", "team", "Team knowledge"),
		makeItem("k-user", "active", "user", "Private knowledge"),
	];

	beforeEach(() => {
		mockUseFetch.mockReturnValue({
			data: { items: MIXED_ITEMS },
			error: null,
			isLoading: false,
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("clicking Shared shows factory+practice items (product moved to Team pill)", async () => {
		// @lore AE1: "product" scope moved from Shared to Team pill. Shared now only
		// includes factory and practice. Product-scoped knowledge appears under Team.
		const user = userEvent.setup();
		renderList();

		// Switch to Curated tab to see curated items
		await user.click(screen.getByRole("tab", { name: /curated/i }));

		await user.click(screen.getByTestId("scope-pill-shared"));

		const curatedView = screen.getByTestId("knowledge-curated-view");
		expect(within(curatedView).getByText("Factory knowledge")).toBeInTheDocument();
		expect(within(curatedView).getByText("Practice knowledge")).toBeInTheDocument();
		// Product, Team, and Private should be hidden under Shared
		expect(within(curatedView).queryByText("Product knowledge")).not.toBeInTheDocument();
		expect(within(curatedView).queryByText("Team knowledge")).not.toBeInTheDocument();
		expect(within(curatedView).queryByText("Private knowledge")).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// 3. "Private" filter shows only user-scoped items
// ---------------------------------------------------------------------------

describe("AD6 — KnowledgeList Private scope filter", () => {
	const MIXED_ITEMS = [
		makeItem("k-factory", "active", "factory", "Factory knowledge"),
		makeItem("k-user", "active", "user", "My private note"),
	];

	beforeEach(() => {
		mockUseFetch.mockReturnValue({
			data: { items: MIXED_ITEMS },
			error: null,
			isLoading: false,
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("clicking Private shows only user-scoped items", async () => {
		const user = userEvent.setup();
		renderList();

		await user.click(screen.getByRole("tab", { name: /curated/i }));
		await user.click(screen.getByTestId("scope-pill-private"));

		const curatedView = screen.getByTestId("knowledge-curated-view");
		expect(within(curatedView).getByText("My private note")).toBeInTheDocument();
		expect(within(curatedView).queryByText("Factory knowledge")).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// 4. Kind badge NOT rendered in list rows
// ---------------------------------------------------------------------------

describe("AD6 — KnowledgeList kind badge removed from rows", () => {
	beforeEach(() => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					{
						...makeItem("k1", "active", "factory", "A decision item"),
						kind: "decision",
					},
					{
						...makeItem("k2", "draft", "factory", "A pattern item"),
						kind: "pattern",
					},
				],
			},
			error: null,
			isLoading: false,
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("curated view rows do NOT show kind badge", async () => {
		const user = userEvent.setup();
		renderList();
		await user.click(screen.getByRole("tab", { name: /curated/i }));

		const curatedView = await screen.findByTestId("knowledge-curated-view");
		const kindBadges = within(curatedView).queryAllByTestId("kind-badge");
		expect(kindBadges).toHaveLength(0);
	});

	it("triage view rows do NOT show kind badge", async () => {
		const user = userEvent.setup();
		renderList();
		await user.click(screen.getByRole("tab", { name: /triage/i }));

		const triageView = await screen.findByTestId("knowledge-triage-view");
		const kindBadges = within(triageView).queryAllByTestId("kind-badge");
		expect(kindBadges).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 5. Archive button calls POST /api/knowledge/:id/archive
// ---------------------------------------------------------------------------

describe("AD6 — KnowledgeDetail archive action", () => {
	let apiFetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../services/api-fetch.js");
		apiFetchSpy = vi.mocked(apiFetch);
		apiFetchSpy.mockReset();
		// Default: GET returns 404 (falls back to fixture data)
		apiFetchSpy.mockResolvedValue(new Response("Not Found", { status: 404 }));
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("Archive option appears in the overflow menu", async () => {
		const user = userEvent.setup();
		renderDetail("k1");

		// Open overflow menu
		await user.click(screen.getByRole("button", { name: /more options/i }));

		expect(screen.getByRole("menuitem", { name: /archive/i })).toBeInTheDocument();
	});

	it("Archive calls POST /api/knowledge/:id/archive", async () => {
		apiFetchSpy.mockImplementation((url: string) => {
			if (url.includes("/archive")) {
				return Promise.resolve(new Response("{}", { status: 200 }));
			}
			return Promise.resolve(new Response("Not Found", { status: 404 }));
		});

		const user = userEvent.setup();
		renderDetail("k1");

		await user.click(screen.getByRole("button", { name: /more options/i }));
		await user.click(screen.getByRole("menuitem", { name: /archive/i }));

		await waitFor(() => {
			expect(apiFetchSpy).toHaveBeenCalledWith(
				expect.stringContaining("/archive"),
				expect.objectContaining({ method: "POST" }),
			);
		});
	});
});

// ---------------------------------------------------------------------------
// 6. Archive success navigates to /knowledge
// ---------------------------------------------------------------------------

describe("AD6 — KnowledgeDetail archive navigation on success", () => {
	let apiFetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../services/api-fetch.js");
		apiFetchSpy = vi.mocked(apiFetch);
		apiFetchSpy.mockReset();
		apiFetchSpy.mockImplementation((url: string) => {
			if (url.includes("/archive")) {
				return Promise.resolve(new Response("{}", { status: 200 }));
			}
			return Promise.resolve(new Response("Not Found", { status: 404 }));
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("navigates to /knowledge after successful archive", async () => {
		const user = userEvent.setup();
		renderDetail("k1");

		await user.click(screen.getByRole("button", { name: /more options/i }));
		await user.click(screen.getByRole("menuitem", { name: /archive/i }));

		// After successful archive, should navigate to /knowledge list page
		await waitFor(() => {
			expect(screen.getByTestId("knowledge-list-page")).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// 7. Archive failure shows error message
// ---------------------------------------------------------------------------

describe("AD6 — KnowledgeDetail archive failure shows error", () => {
	let apiFetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../services/api-fetch.js");
		apiFetchSpy = vi.mocked(apiFetch);
		apiFetchSpy.mockReset();
		apiFetchSpy.mockImplementation((url: string) => {
			if (url.includes("/archive")) {
				return Promise.resolve(
					new Response(JSON.stringify({ error: "Archive failed" }), { status: 500 }),
				);
			}
			return Promise.resolve(new Response("Not Found", { status: 404 }));
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("shows an error message when archive request fails", async () => {
		const user = userEvent.setup();
		renderDetail("k1");

		await user.click(screen.getByRole("button", { name: /more options/i }));
		await user.click(screen.getByRole("menuitem", { name: /archive/i }));

		await waitFor(() => {
			expect(screen.getByTestId("archive-error")).toBeInTheDocument();
		});
	});

	it("stays on the detail page when archive fails (no navigation)", async () => {
		const user = userEvent.setup();
		renderDetail("k1");

		await user.click(screen.getByRole("button", { name: /more options/i }));
		await user.click(screen.getByRole("menuitem", { name: /archive/i }));

		await waitFor(() => {
			expect(screen.getByTestId("archive-error")).toBeInTheDocument();
		});
		// Detail page is still present
		expect(screen.getByTestId("knowledge-detail-page")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// 8. Create page has 3-pill scope picker (not a dropdown)
// ---------------------------------------------------------------------------

describe("AD6 — KnowledgeCreate 3-pill scope picker", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders 3 scope pills: Shared, Team, Private", () => {
		renderCreate();

		expect(screen.getByTestId("scope-pill-create-shared")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-create-team")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-create-private")).toBeInTheDocument();
	});

	it("does NOT render a scope dropdown (select element) for scope selection", () => {
		renderCreate();

		// The old SCOPE_KINDS select had aria-label "Scope kind"
		expect(screen.queryByRole("combobox", { name: /scope kind/i })).not.toBeInTheDocument();
	});

	it("Shared pill is active by default", () => {
		renderCreate();

		const sharedPill = screen.getByTestId("scope-pill-create-shared");
		expect(sharedPill).toHaveAttribute("data-active", "true");
		expect(screen.getByTestId("scope-pill-create-team")).toHaveAttribute("data-active", "false");
		expect(screen.getByTestId("scope-pill-create-private")).toHaveAttribute("data-active", "false");
	});

	it("clicking Private pill makes it active", async () => {
		const user = userEvent.setup();
		renderCreate();

		await user.click(screen.getByTestId("scope-pill-create-private"));

		expect(screen.getByTestId("scope-pill-create-private")).toHaveAttribute("data-active", "true");
		expect(screen.getByTestId("scope-pill-create-shared")).toHaveAttribute("data-active", "false");
	});
});

// ---------------------------------------------------------------------------
// 9. Create page has no kind selector
// ---------------------------------------------------------------------------

describe("AD6 — KnowledgeCreate no kind selector", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("does NOT render a kind selector", () => {
		renderCreate();

		// The old kind select had aria-label "Knowledge kind"
		expect(screen.queryByRole("combobox", { name: /knowledge kind/i })).not.toBeInTheDocument();
	});

	it("does NOT render kind-related labels", () => {
		renderCreate();

		// The old kind section had an uppercase "Kind" label
		const metadataCard = screen.getByTestId("knowledge-create-metadata");
		expect(within(metadataCard).queryByText("Kind")).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// 10. Team pill is disabled when no team context
// ---------------------------------------------------------------------------

describe("AD6 — KnowledgeCreate Team pill disabled without team", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("Team pill is disabled when user has no teamId", () => {
		// useCurrentUser mock returns { id: "user-1", name: "Test User" } (no teamId)
		renderCreate();

		const teamPill = screen.getByTestId("scope-pill-create-team");
		expect(teamPill).toBeDisabled();
	});

	it("clicking disabled Team pill does not make it active", async () => {
		const user = userEvent.setup();
		renderCreate();

		const teamPill = screen.getByTestId("scope-pill-create-team");
		// Try to click the disabled button
		await user.click(teamPill).catch(() => {
			// Expected: disabled buttons may throw on click in some setups
		});

		// Team pill should still not be active
		expect(teamPill).toHaveAttribute("data-active", "false");
	});
});

// ---------------------------------------------------------------------------
// 11. Flag NOT in overflow menu (removed)
// ---------------------------------------------------------------------------

describe("AD6 — KnowledgeDetail Flag removed from overflow menu", () => {
	let apiFetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../services/api-fetch.js");
		apiFetchSpy = vi.mocked(apiFetch);
		apiFetchSpy.mockReset();
		apiFetchSpy.mockResolvedValue(new Response("Not Found", { status: 404 }));
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("Flag is NOT present in the overflow menu", async () => {
		const user = userEvent.setup();
		renderDetail("k1");

		await user.click(screen.getByRole("button", { name: /more options/i }));

		expect(screen.queryByRole("menuitem", { name: /flag/i })).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// 12. scope-labels utility exports correct constants
// ---------------------------------------------------------------------------

describe("AD6 — scope-labels utility", () => {
	it("SCOPE_PILL_OPTIONS has exactly 4 items with correct labels", async () => {
		const { SCOPE_PILL_OPTIONS } = await import("../utils/scope-labels");
		expect(SCOPE_PILL_OPTIONS).toHaveLength(4);
		const labels = SCOPE_PILL_OPTIONS.map((o) => o.label);
		expect(labels).toContain("All");
		expect(labels).toContain("Shared");
		expect(labels).toContain("Team");
		expect(labels).toContain("Private");
	});

	it("SCOPE_CREATE_OPTIONS includes core buckets plus Role", async () => {
		const { SCOPE_CREATE_OPTIONS } = await import("../utils/scope-labels");
		expect(SCOPE_CREATE_OPTIONS).toHaveLength(4);
		const labels = SCOPE_CREATE_OPTIONS.map((o) => o.label);
		expect(labels).toContain("Shared");
		expect(labels).toContain("Team");
		expect(labels).toContain("Private");
		expect(labels).toContain("Role");
		// AU26 F2 (founder ruling): the Filesystem scope is gone.
		expect(labels).not.toContain("Filesystem");
	});

	it("Shared option maps to factory scopeKind", async () => {
		const { SCOPE_CREATE_OPTIONS } = await import("../utils/scope-labels");
		const shared = SCOPE_CREATE_OPTIONS.find((o) => o.label === "Shared");
		expect(shared?.scopeKind).toBe("factory");
	});

	it("Private option maps to user scopeKind", async () => {
		const { SCOPE_CREATE_OPTIONS } = await import("../utils/scope-labels");
		const priv = SCOPE_CREATE_OPTIONS.find((o) => o.label === "Private");
		expect(priv?.scopeKind).toBe("user");
	});

	it("Team option maps to team scopeKind", async () => {
		const { SCOPE_CREATE_OPTIONS } = await import("../utils/scope-labels");
		const team = SCOPE_CREATE_OPTIONS.find((o) => o.label === "Team");
		expect(team?.scopeKind).toBe("team");
	});

	it("Role option maps to the practice scopeKind", async () => {
		const { SCOPE_CREATE_OPTIONS } = await import("../utils/scope-labels");
		expect(SCOPE_CREATE_OPTIONS.find((o) => o.label === "Role")?.scopeKind).toBe("practice");
		expect(SCOPE_CREATE_OPTIONS.find((o) => o.label === "Filesystem")).toBeUndefined();
	});

	it("scopeKindToLabel returns Shared for factory", async () => {
		const { scopeKindToLabel } = await import("../utils/scope-labels");
		expect(scopeKindToLabel("factory")).toBe("Shared");
	});

	it("scopeKindToLabel returns Team for product", async () => {
		// @lore AE1: Changed from "Shared" to "Team" — product scope renamed in U1.
		const { scopeKindToLabel } = await import("../utils/scope-labels");
		expect(scopeKindToLabel("product")).toBe("Team");
	});

	it("scopeKindToLabel returns Shared for practice", async () => {
		const { scopeKindToLabel } = await import("../utils/scope-labels");
		expect(scopeKindToLabel("practice")).toBe("Shared");
	});

	it("scopeKindToLabel returns Team for team", async () => {
		const { scopeKindToLabel } = await import("../utils/scope-labels");
		expect(scopeKindToLabel("team")).toBe("Team");
	});

	it("scopeKindToLabel returns Private for user", async () => {
		const { scopeKindToLabel } = await import("../utils/scope-labels");
		expect(scopeKindToLabel("user")).toBe("Private");
	});
});
