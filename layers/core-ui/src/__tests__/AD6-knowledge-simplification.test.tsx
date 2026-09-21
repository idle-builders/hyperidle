/**
 * AD6 — Knowledge Cleanup & Scope Simplification: failing tests (red phase).
 *
 * Tests assert the NEW behavior. They will fail against current implementation
 * and pass once the implementation is complete.
 *
 * AC coverage:
 * 1. Static scope pills (All/Shared/Team/Private) always render in KnowledgeList
 * 2. "Shared" filter shows factory items (product/practice retired as
 *    scope values — Shared is factory alone now)
 * 3. "Private" filter shows only user-scoped items
 * 4. Kind badge NOT rendered in list rows
 * 8. Create page has 3-pill scope picker (not 7-item dropdown)
 * 9. Create page has no kind selector
 * 10. Team pill is disabled when no team context
 *
 * Items 5-7 (Archive) and 11 (Flag removed) tested `KnowledgeDetail`
 * directly — moved to `pages/__tests__/DocumentDetail.dialogs.test.tsx`
 * (BC4) when that page was rewritten against `call("edit_document", …)`.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentCreate } from "../pages/DocumentCreate";
import { KnowledgeList } from "../pages/KnowledgeList";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

// Mock BodyEditor — TipTap does not work in JSDOM
vi.mock("../ds", async (importOriginal) => {
	const original = await importOriginal<typeof import("../ds")>();
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

// Mock useCurrentUser
vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "user-1", name: "Test User" } }),
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

function renderCreate(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/documents/new"]}>
			<Routes>
				<Route path="/documents/new" element={<DocumentCreate />} />
				<Route path="/documents" element={<div data-testid="knowledge-list-page" />} />
				<Route path="/documents/:id" element={<div data-testid="document-detail-page" />} />
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
// 2. "Shared" filter shows factory items only
// ---------------------------------------------------------------------------

// @lore nested-knowledge-items: product/practice retired as scope values —
// SCOPE_PILL_OPTIONS collapsed from {factory,practice}/{team,product} to a
// direct 1:1 with the 3 real scope kinds. This test now locks that: Shared
// shows factory only.
describe("AD6 — KnowledgeList Shared scope filter", () => {
	const MIXED_ITEMS = [
		makeItem("k-factory", "active", "factory", "Factory knowledge"),
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

	it("clicking Shared shows factory items only", async () => {
		const user = userEvent.setup();
		renderList();

		// Switch to Curated tab to see curated items
		await user.click(screen.getByRole("tab", { name: /curated/i }));

		await user.click(screen.getByTestId("scope-pill-shared"));

		const curatedView = screen.getByTestId("knowledge-curated-view");
		expect(within(curatedView).getByText("Factory knowledge")).toBeInTheDocument();
		// Team and Private should be hidden under Shared
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

// AD6's items 5, 6, 7 (Archive button/navigation/failure) and 11 (Flag
// removed) tested `KnowledgeDetail` directly — moved to
// `pages/__tests__/DocumentDetail.dialogs.test.tsx` (BC4), which now
// exercises the same archive behavior through `call("edit_document", …)`.

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

// AD6 item 11 (Flag removed from overflow menu) tested `KnowledgeDetail`
// directly — the overflow menu no longer has a Flag item at all
// (architecture.md); nothing left to pin here.

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

	// @lore nested-knowledge-items: the Role option (scopeKind: "practice") is
	// gone with the practice scope value — role-scoped patterns are now tree
	// children under the Practices root, not a scope pick.
	it("SCOPE_CREATE_OPTIONS includes exactly the 3 real scope kinds", async () => {
		const { SCOPE_CREATE_OPTIONS } = await import("../utils/scope-labels");
		expect(SCOPE_CREATE_OPTIONS).toHaveLength(3);
		const labels = SCOPE_CREATE_OPTIONS.map((o) => o.label);
		expect(labels).toContain("Shared");
		expect(labels).toContain("Team");
		expect(labels).toContain("Private");
		expect(labels).not.toContain("Role");
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

	it("no Role or Filesystem option exists (both retired)", async () => {
		const { SCOPE_CREATE_OPTIONS } = await import("../utils/scope-labels");
		expect(SCOPE_CREATE_OPTIONS.find((o) => o.label === "Role")).toBeUndefined();
		expect(SCOPE_CREATE_OPTIONS.find((o) => o.label === "Filesystem")).toBeUndefined();
	});

	it("scopeKindToLabel returns Shared for factory", async () => {
		const { scopeKindToLabel } = await import("../utils/scope-labels.js");
		expect(scopeKindToLabel("factory")).toBe("Shared");
	});

	// @lore nested-knowledge-items: "product" is a retired scope value — it no
	// longer gets the special "Team" mapping U1/AE1 gave it; it falls through
	// to the same unknown-kind fallback as any other unrecognized string.
	it("scopeKindToLabel returns Shared for product (retired scope value)", async () => {
		const { scopeKindToLabel } = await import("../utils/scope-labels.js");
		expect(scopeKindToLabel("product")).toBe("Shared");
	});

	it("scopeKindToLabel returns Shared for practice", async () => {
		const { scopeKindToLabel } = await import("../utils/scope-labels.js");
		expect(scopeKindToLabel("practice")).toBe("Shared");
	});

	it("scopeKindToLabel returns Team for team", async () => {
		const { scopeKindToLabel } = await import("../utils/scope-labels.js");
		expect(scopeKindToLabel("team")).toBe("Team");
	});

	it("scopeKindToLabel returns Private for user", async () => {
		const { scopeKindToLabel } = await import("../utils/scope-labels.js");
		expect(scopeKindToLabel("user")).toBe("Private");
	});
});
