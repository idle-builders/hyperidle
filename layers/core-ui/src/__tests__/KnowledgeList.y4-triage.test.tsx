/**
 * Y4 — Knowledge Triage Improvements: KnowledgeList frontend tests.
 *
 * Covers:
 * - Triage tab includes both draft and needs_human items
 * - Auto-tab default logic checks needs_human (not just draft)
 * - Keyboard navigation: j/k moves focus, v validates, x rejects, Enter opens
 * - After validation/rejection, next item is immediately visible (auto-advance)
 * - Optimistic removal: item disappears from triage list immediately
 *
 * @lore AU44 batch 4: "sorted by attention score" removed (FULL-AUDIT.md row 13).
 * Triage is now a plain recency list; attentionScore field kept flat (PLUGIN-owned).
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeList } from "../pages/KnowledgeList";

// ---------------------------------------------------------------------------
// Mock useFetch — each test configures return via mockReturnValue
// ---------------------------------------------------------------------------

const mockUseFetch = vi.fn();
vi.mock("../hooks/useFetch", () => ({
	useFetch: (...args: unknown[]) => mockUseFetch(...args),
}));

// ---------------------------------------------------------------------------
// Mock fetch for PATCH calls (triage actions)
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAt(path = "/knowledge"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<KnowledgeList />
		</MemoryRouter>,
	);
}

function makeItem(
	id: string,
	status: string,
	_attentionScore: number | null = null,
	title?: string,
): Record<string, unknown> {
	return {
		id,
		topic: "Architecture",
		title: title ?? `Item ${id}`,
		body: "body",
		format: "markdown",
		status,
		version: 1,
		updatedBy: "agent",
		scopeKind: "factory",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-02T00:00:00Z",
		// @lore AU44 batch 4: attentionScore now flat (PLUGIN-owned); signals wrapper gone.
		attentionScore: _attentionScore,
	};
}

// ---------------------------------------------------------------------------
// Triage filter: includes both draft and needs_human items
// ---------------------------------------------------------------------------

describe("Y4 — KnowledgeList triage tab includes needs_human items", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("renders a needs_human item in the Triage view", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("k-nh", "needs_human", 0.8, "Flagged for human review"),
					makeItem("k-active", "active"),
				],
			},
			error: null,
			isLoading: false,
		});

		renderAt();

		// Switch to triage tab
		const user = userEvent.setup();
		await user.click(screen.getByRole("tab", { name: /triage/i }));

		const triageView = await screen.findByTestId("knowledge-triage-view");
		expect(within(triageView).getByText("Flagged for human review")).toBeInTheDocument();
	});

	it("renders both draft and needs_human items in the Triage view", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("k-draft", "draft", 0.5, "Draft item"),
					makeItem("k-nh", "needs_human", 0.9, "Needs human item"),
					makeItem("k-active", "active", null, "Active item"),
				],
			},
			error: null,
			isLoading: false,
		});

		renderAt();

		const user = userEvent.setup();
		await user.click(screen.getByRole("tab", { name: /triage/i }));

		const triageView = await screen.findByTestId("knowledge-triage-view");
		expect(within(triageView).getByText("Draft item")).toBeInTheDocument();
		expect(within(triageView).getByText("Needs human item")).toBeInTheDocument();
		// Active item should NOT be in triage
		expect(within(triageView).queryByText("Active item")).not.toBeInTheDocument();
	});

	it("does NOT include active or archived items in the Triage view", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("k-active", "active", null, "Active knowledge"),
					makeItem("k-archived", "archived", null, "Archived knowledge"),
				],
			},
			error: null,
			isLoading: false,
		});

		renderAt();

		const user = userEvent.setup();
		await user.click(screen.getByRole("tab", { name: /triage/i }));

		expect(await screen.findByTestId("knowledge-triage-empty")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Auto-tab default: includes needs_human in the check
// ---------------------------------------------------------------------------

describe("Y4 — Auto-tab default checks needs_human (not only draft)", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("defaults to Triage tab when only needs_human items exist (no draft)", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("k-nh", "needs_human", 0.85, "Flagged item"),
					makeItem("k-active", "active"),
				],
			},
			error: null,
			isLoading: false,
		});

		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});
	});

	it("defaults to Curated tab when no draft or needs_human items exist", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [makeItem("k-active", "active"), makeItem("k-active-2", "active")],
			},
			error: null,
			isLoading: false,
		});

		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /curated/i })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});
	});
});

// ---------------------------------------------------------------------------
// Keyboard navigation in triage tab
// ---------------------------------------------------------------------------

describe("Y4 — Triage keyboard navigation", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("pressing j moves focus down to the next item", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("k1", "draft", 0.9, "First item"),
					makeItem("k2", "draft", 0.5, "Second item"),
				],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		// Make sure we're on triage tab (should auto-select since there are drafts)
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		// Press j to move focus to first item
		await user.keyboard("j");

		// First item should have focus indicator
		const triageView = screen.getByTestId("knowledge-triage-view");
		const rows = within(triageView).getAllByRole("listitem");
		// The first item (index 0) should be focused after pressing j from no focus
		expect(rows[0]).toHaveAttribute("data-focused", "true");
	});

	it("pressing k moves focus up to the previous item", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("k1", "draft", 0.9, "First item"),
					makeItem("k2", "draft", 0.5, "Second item"),
				],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		// j twice to get to second item, then k to go back
		await user.keyboard("j");
		await user.keyboard("j");

		const triageView = screen.getByTestId("knowledge-triage-view");
		const rowsAfterJJ = within(triageView).getAllByRole("listitem");
		expect(rowsAfterJJ[1]).toHaveAttribute("data-focused", "true");

		await user.keyboard("k");
		const rowsAfterK = within(triageView).getAllByRole("listitem");
		expect(rowsAfterK[0]).toHaveAttribute("data-focused", "true");
	});

	it("pressing Escape clears focus", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [makeItem("k1", "draft", 0.9, "Focusable item")],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		await user.keyboard("j"); // focus first item

		const triageView = screen.getByTestId("knowledge-triage-view");
		const rows = within(triageView).getAllByRole("listitem");
		expect(rows[0]).toHaveAttribute("data-focused", "true");

		await user.keyboard("{Escape}");

		// After Escape, no items should be focused
		const rowsAfterEscape = within(triageView).getAllByRole("listitem");
		for (const row of rowsAfterEscape) {
			expect(row).not.toHaveAttribute("data-focused", "true");
		}
	});

	it("keyboard shortcuts only activate when triage tab is visible", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("k-active", "active"), // only active items → curated default
				],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		// Default to curated since there are no draft/needs_human items
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /curated/i })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});

		// j key should NOT trigger triage focus when on curated tab
		await user.keyboard("j");

		// No triage view items should have focus
		const triageItems = screen.queryAllByTestId(/triage-item/);
		for (const item of triageItems) {
			expect(item).not.toHaveAttribute("data-focused", "true");
		}
	});
});

// ---------------------------------------------------------------------------
// Triage actions: validate (v key) and reject (x key)
// ---------------------------------------------------------------------------

describe("Y4 — Triage actions with keyboard shortcuts", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({ id: "k1", status: "active", version: 2 }),
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("pressing v on focused item calls PATCH with status=active", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [makeItem("k1", "draft", 0.8, "Item to validate")],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		await user.keyboard("j"); // focus first item
		await user.keyboard("v"); // validate

		// Should have called fetch with PATCH and status=active
		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining("/api/knowledge/k1"),
			expect.objectContaining({
				method: "PATCH",
				body: expect.stringContaining('"status":"active"'),
			}),
		);
	});

	it("pressing x on focused item calls PATCH with status=archived", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [makeItem("k1", "draft", 0.8, "Item to reject")],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		await user.keyboard("j"); // focus first item
		await user.keyboard("x"); // reject

		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining("/api/knowledge/k1"),
			expect.objectContaining({
				method: "PATCH",
				body: expect.stringContaining('"status":"archived"'),
			}),
		);
	});

	it("pressing v does not fire PATCH when no item is focused", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [makeItem("k1", "draft", 0.8, "Unfocused item")],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		// Press v without focusing first — no PATCH should fire
		// Reset mock call count first (useFetch was called but that's not fetch)
		mockFetch.mockClear();
		await user.keyboard("v");

		// No PATCH call should have happened
		const patchCalls = mockFetch.mock.calls.filter(
			(args: unknown[]) =>
				typeof args[1] === "object" &&
				args[1] !== null &&
				(args[1] as Record<string, unknown>).method === "PATCH",
		);
		expect(patchCalls).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Auto-advance: after validation, next item is visible
// ---------------------------------------------------------------------------

describe("Y4 — Auto-advance after triage action", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({ id: "k1", status: "active", version: 2 }),
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("item disappears from triage list immediately after validation (optimistic removal)", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("k1", "draft", 0.9, "Item to validate"),
					makeItem("k2", "draft", 0.5, "Second item"),
				],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		const triageView = screen.getByTestId("knowledge-triage-view");
		expect(within(triageView).getByText("Item to validate")).toBeInTheDocument();

		await user.keyboard("j"); // focus first item
		await user.keyboard("v"); // validate

		// After optimistic removal, "Item to validate" should no longer appear
		await waitFor(() => {
			expect(within(triageView).queryByText("Item to validate")).not.toBeInTheDocument();
		});
	});

	it("second item becomes the focused item after validating the first (auto-advance)", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("k1", "draft", 0.9, "First item"),
					makeItem("k2", "draft", 0.5, "Second item"),
				],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		await user.keyboard("j"); // focus index 0 (first item)
		await user.keyboard("v"); // validate

		// After removal, the "Second item" (previously index 1) should now be at index 0
		// and should be focused (auto-advance keeps focus at same index)
		await waitFor(() => {
			const triageView = screen.getByTestId("knowledge-triage-view");
			const rows = within(triageView).getAllByRole("listitem");
			expect(rows[0]).toHaveAttribute("data-focused", "true");
			expect(rows[0]?.textContent).toContain("Second item");
		});
	});

	it("triage shows empty state after the last item is processed", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [makeItem("k1", "draft", 0.9, "Last item")],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		await user.keyboard("j"); // focus
		await user.keyboard("v"); // validate

		// Empty state should now render
		await waitFor(() => {
			expect(screen.getByTestId("knowledge-triage-empty")).toBeInTheDocument();
		});
	});
});

// FR-20: Triage keyboard hint bar was removed entirely (founder ruling: delete it, no restyle).
// The keyboard navigation (j/k/v/x/Enter) still works via the useEffect handler in
// KnowledgeListContent — only the visible hint UI was deleted.
