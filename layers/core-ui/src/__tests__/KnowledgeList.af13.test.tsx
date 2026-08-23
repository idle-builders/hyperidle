/**
 * AF13 — KnowledgeList component tests.
 *
 * Covers:
 * - §3: recency sort pill reorders (both tabs)
 *   @lore AU44 batch 4: frequency pill removed (FULL-AUDIT.md row 13 — signals gone).
 * - §6 / Task 6: triage validate → item leaves triage AND enters curated
 *   (optimistic status override, not removal — "verdict moves the item")
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeList } from "../pages/KnowledgeList.js";

// ---------------------------------------------------------------------------
// Mock useFetch — each test configures return value
// ---------------------------------------------------------------------------

const mockUseFetch = vi.fn();
vi.mock("../hooks/useFetch", () => ({
	useFetch: (...args: unknown[]) => mockUseFetch(...args),
}));

// Mock fetch for PATCH calls
const mockFetch = vi.fn();

// Mock useCurrentUser
vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({
		user: { id: "u-test", name: "Test User", email: "t@example.com", avatarUrl: null },
		status: "ready",
		error: null,
	}),
}));

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
	opts: {
		updatedAt?: string;
		title?: string;
		topic?: string;
	} = {},
): Record<string, unknown> {
	return {
		id,
		topic: opts.topic ?? "Architecture",
		title: opts.title ?? `Item ${id}`,
		body: "body",
		format: "markdown",
		status,
		version: 1,
		updatedBy: "u-test",
		scopeKind: "factory",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: opts.updatedAt ?? "2024-01-02T00:00:00Z",
		attentionScore: null,
	};
}

// ---------------------------------------------------------------------------
// §3 — Sort pills reorder the curated list
// ---------------------------------------------------------------------------

describe("AF13 §3 — Sort pills actually reorder the curated tab", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("Recency pill reorders curated items by updatedAt desc", async () => {
		// Three active items with distinct updatedAt values
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("old", "active", {
						updatedAt: "2024-01-01T00:00:00Z",
						title: "Oldest Item",
						topic: "Topic",
					}),
					makeItem("new", "active", {
						updatedAt: "2024-06-01T00:00:00Z",
						title: "Newest Item",
						topic: "Topic",
					}),
					makeItem("mid", "active", {
						updatedAt: "2024-03-01T00:00:00Z",
						title: "Middle Item",
						topic: "Topic",
					}),
				],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		// Render on Curated tab (no triage items)
		renderAt("/knowledge");

		// Switch to Curated tab
		await user.click(screen.getByRole("tab", { name: /curated/i }));

		// Click Recency sort pill — scoped to sort bar to avoid matching item titles
		const sortBar = screen.getByTestId("knowledge-sort-bar");
		const recencyPill = within(sortBar).getByRole("button", { name: /recency/i });
		await user.click(recencyPill);

		// After sort: Newest first, then Middle, then Oldest
		// This fails until sortItems is applied to curated groups
		await waitFor(() => {
			const curatedView = screen.getByTestId("knowledge-curated-view");
			const rows = within(curatedView).getAllByRole("listitem");
			const texts = rows.map((r) => r.textContent ?? "");

			const newestIdx = texts.findIndex((t) => t.includes("Newest Item"));
			const middleIdx = texts.findIndex((t) => t.includes("Middle Item"));
			const oldestIdx = texts.findIndex((t) => t.includes("Oldest Item"));

			expect(newestIdx).toBeLessThan(middleIdx);
			expect(middleIdx).toBeLessThan(oldestIdx);
		});
	});

});

// ---------------------------------------------------------------------------
// §3 — Sort pills reorder the triage tab
// ---------------------------------------------------------------------------

describe("AF13 §3 — Sort pills reorder the triage tab", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("Recency pill reorders triage items by updatedAt desc", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("draft-old", "draft", {
						updatedAt: "2024-01-01T00:00:00Z",
						title: "Old Draft",
					}),
					makeItem("draft-new", "draft", {
						updatedAt: "2024-06-01T00:00:00Z",
						title: "New Draft",
					}),
				],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt("/knowledge");

		// Click Recency on triage tab — scoped to sort bar to avoid matching item titles
		const sortBar = screen.getByTestId("knowledge-sort-bar");
		const recencyPill = within(sortBar).getByRole("button", { name: /recency/i });
		await user.click(recencyPill);

		// After recency sort: New Draft first, Old Draft second
		await waitFor(() => {
			const triageView = screen.getByTestId("knowledge-triage-view");
			const rows = within(triageView).getAllByRole("listitem");
			const texts = rows.map((r) => r.textContent ?? "");

			const newIdx = texts.findIndex((t) => t.includes("New Draft"));
			const oldIdx = texts.findIndex((t) => t.includes("Old Draft"));

			expect(newIdx).toBeLessThan(oldIdx);
		});
	});
});

// ---------------------------------------------------------------------------
// §6 / Task 6 — Triage validate → item leaves triage AND enters curated
// (optimistic status override, not just removal)
// ---------------------------------------------------------------------------

describe("AF13 §6 — Triage validate: item leaves triage AND appears in curated (same render)", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		// PATCH succeeds
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({ id: "k-draft", status: "active", version: 2 }),
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("validated item disappears from Triage tab", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [
					makeItem("k-draft", "draft", { title: "Draft to validate", topic: "Science" }),
					makeItem("k-active", "active", { title: "Already active", topic: "Science" }),
				],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		// Should auto-default to triage because there's a draft item
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		const triageView = screen.getByTestId("knowledge-triage-view");
		expect(within(triageView).getByText("Draft to validate")).toBeInTheDocument();

		// Use keyboard: j to focus, v to validate
		await user.keyboard("j");
		await user.keyboard("v");

		// Item must vanish from triage immediately (optimistic)
		await waitFor(() => {
			expect(within(triageView).queryByText("Draft to validate")).not.toBeInTheDocument();
		});
	});

	it("validated item appears in the Curated tab in the same render", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [makeItem("k-draft", "draft", { title: "Newly validated", topic: "Science" })],
			},
			error: null,
			isLoading: false,
		});

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		// Validate the item
		await user.keyboard("j");
		await user.keyboard("v");

		// Switch to Curated tab
		await user.click(screen.getByRole("tab", { name: /curated/i }));

		// Item should appear in curated (status override from draft → active)
		// This test fails until optimisticRemovals is replaced with optimisticStatus override map
		const curatedView = await screen.findByTestId("knowledge-curated-view");
		expect(within(curatedView).getByText("Newly validated")).toBeInTheDocument();
	});

	it("rejected item leaves triage and does NOT appear in curated", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [makeItem("k-draft-reject", "draft", { title: "Item to reject", topic: "Science" })],
			},
			error: null,
			isLoading: false,
		});

		// PATCH returns archived status for reject
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({ id: "k-draft-reject", status: "archived", version: 2 }),
		});

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		const triageView = screen.getByTestId("knowledge-triage-view");
		expect(within(triageView).getByText("Item to reject")).toBeInTheDocument();

		// Reject: j to focus, x to archive
		await user.keyboard("j");
		await user.keyboard("x");

		// Disappears from triage
		await waitFor(() => {
			expect(within(triageView).queryByText("Item to reject")).not.toBeInTheDocument();
		});

		// Switch to curated — item must NOT be there (archived ≠ active)
		await user.click(screen.getByRole("tab", { name: /curated/i }));
		await waitFor(() => {
			const curatedView = screen.getByTestId("knowledge-curated-view");
			expect(within(curatedView).queryByText("Item to reject")).not.toBeInTheDocument();
		});
	});

	it("reverts to triage when PATCH fails (failure-revert semantics preserved)", async () => {
		mockUseFetch.mockReturnValue({
			data: {
				items: [makeItem("k-fail", "draft", { title: "Failing item", topic: "Science" })],
			},
			error: null,
			isLoading: false,
		});

		// PATCH fails
		mockFetch.mockResolvedValue({
			ok: false,
			json: async () => ({ error: "Server error" }),
		});

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		const triageView = screen.getByTestId("knowledge-triage-view");

		await user.keyboard("j");
		await user.keyboard("v");

		// After optimistic removal…
		// On failure, item should revert back to triage
		await waitFor(() => {
			expect(within(triageView).getByText("Failing item")).toBeInTheDocument();
		});
	});
});
