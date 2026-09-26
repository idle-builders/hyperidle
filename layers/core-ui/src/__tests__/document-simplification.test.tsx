/**
 * AD6 — Knowledge Cleanup & Scope Simplification: failing tests (red phase).
 *
 * Tests assert the NEW behavior. They will fail against current implementation
 * and pass once the implementation is complete.
 *
 * AC coverage:
 * 1. Static scope pills (All/Shared/Team/Private) always render in DocumentList
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
 * when that page was rewritten against `call("edit_document", …)`.
 *
 * @lore BC4: re-pointed onto `DocumentList`/`useDocuments` — `KnowledgeList`
 * and its `useFetch("/api/knowledge")` read are gone.
 */

import type { DocumentRow } from "@hyperidle/domain-model";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentCreate } from "../pages/DocumentCreate";
import { DocumentList } from "../pages/DocumentList";

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

// Mock useDocuments for DocumentList
const mockUseDocuments = vi.fn();
vi.mock("../hooks/useDocuments.js", () => ({
	useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
	id: string,
	status: DocumentRow["status"],
	scopeKind: DocumentRow["scopeKind"],
	title?: string,
): DocumentRow {
	return {
		id,
		title: title ?? `Item ${id}`,
		body: `body of ${id}`,
		format: "markdown",
		status,
		slot: "ordinary",
		scopeKind,
		scopeId: null,
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "agent",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-02T00:00:00Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
	};
}

function renderList(path = "/documents"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<DocumentList />
		</MemoryRouter>,
	);
}

function renderCreate(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/documents/new"]}>
			<Routes>
				<Route path="/documents/new" element={<DocumentCreate />} />
				<Route path="/documents" element={<div data-testid="document-list-page" />} />
				<Route path="/documents/:id" element={<div data-testid="document-detail-page" />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// 1. Static scope pills (All/Shared/Team/Private) always render
// ---------------------------------------------------------------------------

describe("DocumentList static scope pills", () => {
	beforeEach(() => {
		// Items with various scopeKinds
		mockUseDocuments.mockReturnValue({
			documents: [
				makeItem("k1", "active", "factory", "Factory item"),
				makeItem("k2", "active", "user", "Private item"),
				makeItem("k3", "active", "team", "Team item"),
			],
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders exactly 4 scope pills: All, Shared, Team, Private", () => {
		renderList();
		const pills = screen.getByTestId("document-scope-pills");
		// Must contain exactly these 4 pills
		expect(within(pills).getByTestId("scope-pill-all")).toBeInTheDocument();
		expect(within(pills).getByTestId("scope-pill-shared")).toBeInTheDocument();
		expect(within(pills).getByTestId("scope-pill-team")).toBeInTheDocument();
		expect(within(pills).getByTestId("scope-pill-private")).toBeInTheDocument();
	});

	it("scope pills are static — render regardless of which scopeKinds appear in items", () => {
		// Even with an empty dataset, all 4 pills render
		mockUseDocuments.mockReturnValue({
			documents: [makeItem("k1", "active", "factory")],
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
		renderList();
		const pills = screen.getByTestId("document-scope-pills");
		expect(within(pills).getByTestId("scope-pill-all")).toBeInTheDocument();
		expect(within(pills).getByTestId("scope-pill-shared")).toBeInTheDocument();
		expect(within(pills).getByTestId("scope-pill-team")).toBeInTheDocument();
		expect(within(pills).getByTestId("scope-pill-private")).toBeInTheDocument();
	});

	it("All pill is active by default (no scope filter applied)", () => {
		renderList();
		const allPill = screen.getByTestId("scope-pill-all");
		expect(allPill).toHaveAttribute("aria-checked", "true");
		expect(screen.getByTestId("scope-pill-shared")).toHaveAttribute("aria-checked", "false");
		expect(screen.getByTestId("scope-pill-team")).toHaveAttribute("aria-checked", "false");
		expect(screen.getByTestId("scope-pill-private")).toHaveAttribute("aria-checked", "false");
	});
});

// ---------------------------------------------------------------------------
// 2. "Shared" filter shows factory items only
// ---------------------------------------------------------------------------

// @lore nested-knowledge-items: product/practice retired as scope values —
// SCOPE_PILL_OPTIONS collapsed from {factory,practice}/{team,product} to a
// direct 1:1 with the 3 real scope kinds. This test now locks that: Shared
// shows factory only.
describe("DocumentList Shared scope filter", () => {
	const MIXED_ITEMS = [
		makeItem("k-factory", "active", "factory", "Factory knowledge"),
		makeItem("k-team", "active", "team", "Team knowledge"),
		makeItem("k-user", "active", "user", "Private knowledge"),
	];

	beforeEach(() => {
		mockUseDocuments.mockReturnValue({
			documents: MIXED_ITEMS,
			status: "ready",
			error: null,
			retry: vi.fn(),
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

		const curatedView = screen.getByTestId("document-curated-view");
		expect(within(curatedView).getByText("Factory knowledge")).toBeInTheDocument();
		// Team and Private should be hidden under Shared
		expect(within(curatedView).queryByText("Team knowledge")).not.toBeInTheDocument();
		expect(within(curatedView).queryByText("Private knowledge")).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// 3. "Private" filter shows only user-scoped items
// ---------------------------------------------------------------------------

describe("DocumentList Private scope filter", () => {
	const MIXED_ITEMS = [
		makeItem("k-factory", "active", "factory", "Factory knowledge"),
		makeItem("k-user", "active", "user", "My private note"),
	];

	beforeEach(() => {
		mockUseDocuments.mockReturnValue({
			documents: MIXED_ITEMS,
			status: "ready",
			error: null,
			retry: vi.fn(),
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

		const curatedView = screen.getByTestId("document-curated-view");
		expect(within(curatedView).getByText("My private note")).toBeInTheDocument();
		expect(within(curatedView).queryByText("Factory knowledge")).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// 4. Kind badge NOT rendered in list rows
// ---------------------------------------------------------------------------

describe("DocumentList kind badge removed from rows", () => {
	beforeEach(() => {
		mockUseDocuments.mockReturnValue({
			documents: [
				makeItem("k1", "active", "factory", "A decision item"),
				makeItem("k2", "proposed", "factory", "A pattern item"),
			],
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("curated view rows do NOT show kind badge", async () => {
		const user = userEvent.setup();
		renderList();
		await user.click(screen.getByRole("tab", { name: /curated/i }));

		const curatedView = await screen.findByTestId("document-curated-view");
		const kindBadges = within(curatedView).queryAllByTestId("kind-badge");
		expect(kindBadges).toHaveLength(0);
	});

	it("triage view rows do NOT show kind badge", async () => {
		const user = userEvent.setup();
		renderList();
		await user.click(screen.getByRole("tab", { name: /triage/i }));

		const triageView = await screen.findByTestId("document-triage-view");
		const kindBadges = within(triageView).queryAllByTestId("kind-badge");
		expect(kindBadges).toHaveLength(0);
	});
});

// AD6's items 5, 6, 7 (Archive button/navigation/failure) and 11 (Flag
// removed) tested `KnowledgeDetail` directly — moved to
// `pages/__tests__/DocumentDetail.dialogs.test.tsx`, which now
// exercises the same archive behavior through `call("edit_document", …)`.

// ---------------------------------------------------------------------------
// 8. Create page has 3-pill scope picker (not a dropdown)
// ---------------------------------------------------------------------------

describe("DocumentCreate 3-pill scope picker", () => {
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
		expect(sharedPill).toHaveAttribute("aria-checked", "true");
		expect(screen.getByTestId("scope-pill-create-team")).toHaveAttribute("aria-checked", "false");
		expect(screen.getByTestId("scope-pill-create-private")).toHaveAttribute(
			"aria-checked",
			"false",
		);
	});

	it("Private pill is offered only once a parent is chosen", async () => {
		// A parentless private note is a memory, not a document; the create page
		// keeps Private disabled until a parent is picked (see
		// DocumentCreate-private-requires-parent.test.tsx for the parent case).
		const user = userEvent.setup();
		renderCreate();

		const privatePill = screen.getByTestId("scope-pill-create-private");
		expect(privatePill).toBeDisabled();
		await user.click(privatePill);

		expect(privatePill).toHaveAttribute("aria-checked", "false");
		expect(screen.getByTestId("scope-pill-create-shared")).toHaveAttribute("aria-checked", "true");
	});
});

// ---------------------------------------------------------------------------
// 9. Create page has no kind selector
// ---------------------------------------------------------------------------

describe("DocumentCreate no kind selector", () => {
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
		const metadataCard = screen.getByTestId("document-create-metadata");
		expect(within(metadataCard).queryByText("Kind")).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// 10. Team pill is disabled when no team context
// ---------------------------------------------------------------------------

describe("DocumentCreate Team pill disabled without team", () => {
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
		expect(teamPill).toHaveAttribute("aria-checked", "false");
	});
});

// AD6 item 11 (Flag removed from overflow menu) tested `KnowledgeDetail`
// directly — the overflow menu no longer has a Flag item at all
// (architecture.md); nothing left to pin here.

// ---------------------------------------------------------------------------
// 12. scope-labels utility exports correct constants
// ---------------------------------------------------------------------------

describe("Scope-labels utility", () => {
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
