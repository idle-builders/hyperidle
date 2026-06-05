/**
 * Y4 — Knowledge Triage Improvements: KnowledgeList frontend tests (red phase).
 *
 * Covers:
 * - Triage tab includes both draft and needs_human items
 * - Triage items are sorted by attention score descending
 * - Auto-tab default logic checks needs_human (not just draft)
 * - Keyboard navigation: j/k moves focus, v validates, x rejects, Enter opens
 * - After validation/rejection, next item is immediately visible (auto-advance)
 * - Optimistic removal: item disappears from triage list immediately
 *
 * All tests in this file should FAIL until implementation is complete.
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
	attentionScore: number | null = null,
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
		signals: {
			lastActivityAt: null,
			accessCount30d: null,
			citationCount: null,
			relevanceScore: null,
			attentionScore,
		},
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
// Triage sort: items sorted by attention score descending
// ---------------------------------------------------------------------------

describe("Y4 — Triage items sorted by attention score descending", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("renders triage items with highest attention score first", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("k-low", "draft", 0.3, "Low priority item"),
					makeItem("k-high", "draft", 0.9, "High priority item"),
					makeItem("k-mid", "draft", 0.6, "Mid priority item"),
				],
			},
			error: null,
			isLoading: false,
		});

		renderAt();

		const user = userEvent.setup();
		await user.click(screen.getByRole("tab", { name: /triage/i }));

		const triageView = await screen.findByTestId("knowledge-triage-view");

		// Get all item rows in order of DOM rendering
		const rows = within(triageView).getAllByRole("listitem");
		const rowTexts = rows.map((r) => r.textContent ?? "");

		// High (0.9) must come before Mid (0.6) which must come before Low (0.3)
		const highIdx = rowTexts.findIndex((t) => t.includes("High priority item"));
		const midIdx = rowTexts.findIndex((t) => t.includes("Mid priority item"));
		const lowIdx = rowTexts.findIndex((t) => t.includes("Low priority item"));

		expect(highIdx).toBeLessThan(midIdx);
		expect(midIdx).toBeLessThan(lowIdx);
	});

	it("renders items with null attention score after items with scores", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("k-null", "draft", null, "No score item"),
					makeItem("k-scored", "draft", 0.7, "Scored item"),
				],
			},
			error: null,
			isLoading: false,
		});

		renderAt();

		const user = userEvent.setup();
		await user.click(screen.getByRole("tab", { name: /triage/i }));

		const triageView = await screen.findByTestId("knowledge-triage-view");
		const rows = within(triageView).getAllByRole("listitem");
		const rowTexts = rows.map((r) => r.textContent ?? "");

		const scoredIdx = rowTexts.findIndex((t) => t.includes("Scored item"));
		const nullIdx = rowTexts.findIndex((t) => t.includes("No score item"));

		expect(scoredIdx).toBeLessThan(nullIdx);
	});

	it("10 items with varying scores renders highest first", async () => {
		const items = [
			makeItem("k-01", "draft", 0.1, "Score 0.1"),
			makeItem("k-09", "draft", 0.9, "Score 0.9"),
			makeItem("k-05", "draft", 0.5, "Score 0.5"),
			makeItem("k-07", "draft", 0.7, "Score 0.7"),
			makeItem("k-03", "draft", 0.3, "Score 0.3"),
			makeItem("k-08", "draft", 0.8, "Score 0.8"),
			makeItem("k-02", "draft", 0.2, "Score 0.2"),
			makeItem("k-06", "draft", 0.6, "Score 0.6"),
			makeItem("k-04", "draft", 0.4, "Score 0.4"),
			makeItem("k-00", "draft", null, "Score null"),
		];

		mockUseFetch.mockReturnValue({
			data: { items },
			error: null,
			isLoading: false,
		});

		renderAt();

		const user = userEvent.setup();
		await user.click(screen.getByRole("tab", { name: /triage/i }));

		const triageView = await screen.findByTestId("knowledge-triage-view");
		const rows = within(triageView).getAllByRole("listitem");
		const firstRowText = rows[0]?.textContent ?? "";
		const lastRowText = rows[rows.length - 1]?.textContent ?? "";

		// Highest score (0.9) should be first
		expect(firstRowText).toContain("Score 0.9");
		// Null score should be last
		expect(lastRowText).toContain("Score null");
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

// ---------------------------------------------------------------------------
// Keyboard hint bar
// ---------------------------------------------------------------------------

describe("Y4 — Triage keyboard hint bar", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("renders keyboard hint bar when triage tab has items", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [makeItem("k1", "draft", 0.8, "Item needing triage")],
			},
			error: null,
			isLoading: false,
		});

		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		// Keyboard hint bar should display shortcut hints
		expect(screen.getByTestId("triage-keyboard-hint")).toBeInTheDocument();
	});

	it("does NOT render keyboard hint bar when triage is empty", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [makeItem("k1", "active")],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		await user.click(screen.getByRole("tab", { name: /triage/i }));

		// No items in triage, so hint bar should not render
		expect(screen.queryByTestId("triage-keyboard-hint")).not.toBeInTheDocument();
	});

	it("does NOT render keyboard hint bar on curated tab", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [makeItem("k1", "active"), makeItem("k2", "draft")],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		// Switch to curated
		await user.click(screen.getByRole("tab", { name: /curated/i }));

		expect(screen.queryByTestId("triage-keyboard-hint")).not.toBeInTheDocument();
	});
});
