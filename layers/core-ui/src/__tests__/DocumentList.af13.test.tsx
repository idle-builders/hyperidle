/**
 * AF13 — DocumentList component tests.
 *
 * Covers:
 * - §3: recency sort pill reorders (both tabs)
 *   @lore AU44 batch 4: frequency pill removed (FULL-AUDIT.md row 13 — signals gone).
 * - §6 / Task 6: triage validate → item leaves triage AND enters curated
 *   (optimistic status override, not removal — "verdict moves the item")
 *
 * @lore BC4: validate/reject calls `edit_document` through `call`, not a raw
 * PATCH `fetch`. `useDocuments` replaces `useFetch("/api/knowledge")`.
 */

import type { DocumentRow, DocumentStatus } from "@hyperidle/domain-model";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "../pages/DocumentList.js";

// ---------------------------------------------------------------------------
// Mock useDocuments — each test configures return value
// ---------------------------------------------------------------------------

const mockUseDocuments = vi.fn();
vi.mock("../hooks/useDocuments.js", () => ({
	useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

// Mock call — for edit_document (triage actions)
const mockCall = vi.fn();
vi.mock("../services/call.js", () => ({
	call: (...args: unknown[]) => mockCall(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderAt(path = "/documents"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<DocumentList />
		</MemoryRouter>,
	);
}

function makeItem(
	id: string,
	status: DocumentStatus,
	opts: {
		updatedAt?: string;
		title?: string;
	} = {},
): DocumentRow {
	return {
		id,
		title: opts.title ?? `Item ${id}`,
		body: "body",
		format: "markdown",
		status,
		slot: "ordinary",
		scopeKind: "factory",
		scopeId: null,
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "u-test",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: opts.updatedAt ?? "2024-01-02T00:00:00Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
	};
}

function mockDocuments(documents: DocumentRow[]): void {
	mockUseDocuments.mockReturnValue({
		documents,
		status: "ready",
		error: null,
		retry: vi.fn(),
	});
}

function editDocumentResult(row: DocumentRow): {
	ok: true;
	data: { document: DocumentRow; ancestors: []; children: []; siblings: []; scopeName: string };
} {
	return {
		ok: true,
		data: { document: row, ancestors: [], children: [], siblings: [], scopeName: "" },
	};
}

// ---------------------------------------------------------------------------
// §3 — Sort pills reorder the curated list
// ---------------------------------------------------------------------------

describe("AF13 §3 — Sort pills actually reorder the curated tab", () => {
	beforeEach(() => {
		mockCall.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("Recency pill reorders curated items by updatedAt desc", async () => {
		// Three active items with distinct updatedAt values
		mockDocuments([
			makeItem("old", "active", { updatedAt: "2024-01-01T00:00:00Z", title: "Oldest Item" }),
			makeItem("new", "active", { updatedAt: "2024-06-01T00:00:00Z", title: "Newest Item" }),
			makeItem("mid", "active", { updatedAt: "2024-03-01T00:00:00Z", title: "Middle Item" }),
		]);

		const user = userEvent.setup();
		// Render on Curated tab (no triage items)
		renderAt();

		// Switch to Curated tab
		await user.click(screen.getByRole("tab", { name: /curated/i }));

		// Click Recency sort pill — scoped to sort bar to avoid matching item titles
		const sortBar = screen.getByTestId("knowledge-sort-bar");
		const recencyPill = within(sortBar).getByRole("button", { name: /recency/i });
		await user.click(recencyPill);

		// After sort: Newest first, then Middle, then Oldest
		await waitFor(() => {
			const curatedView = screen.getByTestId("knowledge-curated-view");
			// @lore nested-knowledge-items tree-ui: curated rows are <li role="treeitem">
			const rows = within(curatedView).getAllByRole("treeitem");
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
		mockCall.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("Recency pill reorders triage items by updatedAt desc", async () => {
		mockDocuments([
			makeItem("draft-old", "proposed", { updatedAt: "2024-01-01T00:00:00Z", title: "Old Draft" }),
			makeItem("draft-new", "proposed", { updatedAt: "2024-06-01T00:00:00Z", title: "New Draft" }),
		]);

		const user = userEvent.setup();
		renderAt();

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
		mockCall.mockReset();
		mockCall.mockResolvedValue(editDocumentResult(makeItem("k-draft", "active")));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("validated item disappears from Triage tab", async () => {
		mockDocuments([
			makeItem("k-draft", "proposed", { title: "Draft to validate" }),
			makeItem("k-active", "active", { title: "Already active" }),
		]);

		const user = userEvent.setup();
		renderAt();

		// Should auto-default to triage because there's a proposed item
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
		mockDocuments([makeItem("k-draft", "proposed", { title: "Newly validated" })]);

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

		// Item should appear in curated (status override from proposed → active)
		const curatedView = await screen.findByTestId("knowledge-curated-view");
		expect(within(curatedView).getByText("Newly validated")).toBeInTheDocument();
	});

	it("rejected item leaves triage and does NOT appear in curated", async () => {
		mockDocuments([makeItem("k-draft-reject", "proposed", { title: "Item to reject" })]);

		// edit_document returns archived status for reject
		mockCall.mockResolvedValue(editDocumentResult(makeItem("k-draft-reject", "archived")));

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

	it("reverts to triage when edit_document is refused (failure-revert semantics preserved)", async () => {
		mockDocuments([makeItem("k-fail", "proposed", { title: "Failing item" })]);

		// edit_document refuses
		mockCall.mockResolvedValue({
			ok: false,
			problems: [{ code: "stale", message: "Server error" }],
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
		// On refusal, item should revert back to triage
		await waitFor(() => {
			expect(within(triageView).getByText("Failing item")).toBeInTheDocument();
		});
	});
});
