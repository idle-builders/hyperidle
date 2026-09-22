/**
 * Y4 — Document Triage Improvements: DocumentList frontend tests.
 *
 * Covers:
 * - Triage tab includes proposed items, and ONLY proposed items (the named
 *   red-first case: the triage filter shows exactly the proposed rows)
 * - Auto-tab default logic checks for proposed items
 * - Keyboard navigation: j/k moves focus, v validates, x rejects, Enter opens
 * - After validation/rejection, next item is immediately visible (auto-advance)
 * - Optimistic removal: item disappears from triage list immediately
 * - A refused `edit_document` shows the problem's message and reverts
 *
 * @lore AU44 batch 4: "sorted by attention score" removed (FULL-AUDIT.md row 13).
 * Triage is now a plain recency list; attentionScore field kept flat (PLUGIN-owned).
 *
 * @lore BC4: validate/reject now calls `edit_document({id, status, version})`
 * through `call`, not a raw PATCH `fetch`. `useDocuments` (`search_documents`)
 * replaces `useFetch("/api/knowledge")`.
 */

import type { DocumentRow, DocumentStatus } from "@hyperidle/domain-model";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "../pages/DocumentList";
import { ToastRegion } from "../shell/ToastRegion.js";

// ---------------------------------------------------------------------------
// Mock useDocuments — each test configures return via mockReturnValue
// ---------------------------------------------------------------------------

const mockUseDocuments = vi.fn();
vi.mock("../hooks/useDocuments.js", () => ({
	useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

// ---------------------------------------------------------------------------
// Mock call — for edit_document (triage actions)
// ---------------------------------------------------------------------------

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
			<ToastRegion>
				<DocumentList />
			</ToastRegion>
		</MemoryRouter>,
	);
}

function makeItem(id: string, status: DocumentStatus, title?: string): DocumentRow {
	return {
		id,
		title: title ?? `Item ${id}`,
		body: "body",
		format: "markdown",
		status,
		slot: "ordinary",
		scopeKind: "team",
		scopeId: "team-1",
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

function mockDocuments(documents: DocumentRow[]): void {
	mockUseDocuments.mockReturnValue({
		documents,
		status: "ready",
		error: null,
		retry: vi.fn(),
	});
}

// ---------------------------------------------------------------------------
// Triage filter: includes exactly the proposed rows — the named red case
// ---------------------------------------------------------------------------

describe("Y4 — DocumentList triage tab shows exactly the proposed rows", () => {
	beforeEach(() => {
		mockCall.mockReset();
		mockCall.mockResolvedValue({
			ok: true,
			data: {
				document: makeItem("x", "active"),
				ancestors: [],
				children: [],
				siblings: [],
				scopeName: "",
			},
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("the triage tab renders exactly the proposed rows — no active, no archived, no stale", async () => {
		mockDocuments([
			makeItem("k-proposed-1", "proposed", "Flagged for human review"),
			makeItem("k-proposed-2", "proposed", "Second proposed item"),
			makeItem("k-active", "active", "Active item"),
			makeItem("k-archived", "archived", "Archived item"),
			makeItem("k-stale", "stale", "Stale item"),
		]);

		renderAt();

		const user = userEvent.setup();
		await user.click(screen.getByRole("tab", { name: /triage/i }));

		const triageView = await screen.findByTestId("document-triage-view");
		const rows = within(triageView).getAllByRole("listitem");
		// Exact equality: only the two proposed rows, nothing else.
		expect(within(triageView).getByText("Flagged for human review")).toBeInTheDocument();
		expect(within(triageView).getByText("Second proposed item")).toBeInTheDocument();
		expect(within(triageView).queryByText("Active item")).not.toBeInTheDocument();
		expect(within(triageView).queryByText("Archived item")).not.toBeInTheDocument();
		expect(within(triageView).queryByText("Stale item")).not.toBeInTheDocument();
		expect(rows).toHaveLength(2);
	});

	it("does NOT include active or archived items in the Triage view", async () => {
		mockDocuments([
			makeItem("k-active", "active", "Active document"),
			makeItem("k-archived", "archived", "Archived document"),
		]);

		renderAt();

		const user = userEvent.setup();
		await user.click(screen.getByRole("tab", { name: /triage/i }));

		expect(await screen.findByTestId("document-triage-empty")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Auto-tab default
// ---------------------------------------------------------------------------

describe("Y4 — Auto-tab default checks for proposed items", () => {
	beforeEach(() => {
		mockCall.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("defaults to Triage tab when a proposed item exists", async () => {
		mockDocuments([makeItem("k-nh", "proposed", "Flagged item"), makeItem("k-active", "active")]);

		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});
	});

	it("defaults to Curated tab when no proposed items exist", async () => {
		mockDocuments([makeItem("k-active", "active"), makeItem("k-active-2", "active")]);

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
		mockCall.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("pressing j moves focus down to the next item", async () => {
		mockDocuments([
			makeItem("k1", "proposed", "First item"),
			makeItem("k2", "proposed", "Second item"),
		]);

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		await user.keyboard("j");

		const triageView = screen.getByTestId("document-triage-view");
		const rows = within(triageView).getAllByRole("listitem");
		expect(rows[0]).toHaveAttribute("data-focused", "true");
	});

	it("pressing k moves focus up to the previous item", async () => {
		mockDocuments([
			makeItem("k1", "proposed", "First item"),
			makeItem("k2", "proposed", "Second item"),
		]);

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		await user.keyboard("j");
		await user.keyboard("j");

		const triageView = screen.getByTestId("document-triage-view");
		const rowsAfterJJ = within(triageView).getAllByRole("listitem");
		expect(rowsAfterJJ[1]).toHaveAttribute("data-focused", "true");

		await user.keyboard("k");
		const rowsAfterK = within(triageView).getAllByRole("listitem");
		expect(rowsAfterK[0]).toHaveAttribute("data-focused", "true");
	});

	it("pressing Escape clears focus", async () => {
		mockDocuments([makeItem("k1", "proposed", "Focusable item")]);

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		await user.keyboard("j");

		const triageView = screen.getByTestId("document-triage-view");
		const rows = within(triageView).getAllByRole("listitem");
		expect(rows[0]).toHaveAttribute("data-focused", "true");

		await user.keyboard("{Escape}");

		const rowsAfterEscape = within(triageView).getAllByRole("listitem");
		for (const row of rowsAfterEscape) {
			expect(row).not.toHaveAttribute("data-focused", "true");
		}
	});

	it("keyboard shortcuts only activate when triage tab is visible", async () => {
		mockDocuments([makeItem("k-active", "active")]);

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /curated/i })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});

		await user.keyboard("j");

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
		mockCall.mockReset();
		mockCall.mockResolvedValue({
			ok: true,
			data: {
				document: makeItem("k1", "active"),
				ancestors: [],
				children: [],
				siblings: [],
				scopeName: "",
			},
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("pressing v on focused item calls edit_document with status=active", async () => {
		mockDocuments([makeItem("k1", "proposed", "Item to validate")]);

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		await user.keyboard("j");
		await user.keyboard("v");

		expect(mockCall).toHaveBeenCalledWith("edit_document", {
			id: "k1",
			status: "active",
			version: 1,
		});
	});

	it("pressing x on focused item calls edit_document with status=archived", async () => {
		mockDocuments([makeItem("k1", "proposed", "Item to reject")]);

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		await user.keyboard("j");
		await user.keyboard("x");

		expect(mockCall).toHaveBeenCalledWith("edit_document", {
			id: "k1",
			status: "archived",
			version: 1,
		});
	});

	it("pressing v does not call edit_document when no item is focused", async () => {
		mockDocuments([makeItem("k1", "proposed", "Unfocused item")]);

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		mockCall.mockClear();
		await user.keyboard("v");

		expect(mockCall).not.toHaveBeenCalled();
	});

	it("a refused edit_document shows the problem's message and reverts the optimistic change", async () => {
		mockDocuments([makeItem("k1", "proposed", "Item that will be refused")]);
		mockCall.mockResolvedValue({
			ok: false,
			problems: [
				{ code: "stale", message: "Someone else saved this first — reopen it and retry." },
			],
		});

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		await user.keyboard("j");
		await user.keyboard("v");

		expect(
			await screen.findByText("Someone else saved this first — reopen it and retry."),
		).toBeInTheDocument();

		// Reverted — the item is back in Triage.
		await waitFor(() => {
			const triageView = screen.getByTestId("document-triage-view");
			expect(within(triageView).getByText("Item that will be refused")).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// Auto-advance: after validation, next item is visible
// ---------------------------------------------------------------------------

describe("Y4 — Auto-advance after triage action", () => {
	beforeEach(() => {
		mockCall.mockReset();
		mockCall.mockResolvedValue({
			ok: true,
			data: {
				document: makeItem("k1", "active"),
				ancestors: [],
				children: [],
				siblings: [],
				scopeName: "",
			},
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("item disappears from triage list immediately after validation (optimistic removal)", async () => {
		mockDocuments([
			makeItem("k1", "proposed", "Item to validate"),
			makeItem("k2", "proposed", "Second item"),
		]);

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		const triageView = screen.getByTestId("document-triage-view");
		expect(within(triageView).getByText("Item to validate")).toBeInTheDocument();

		await user.keyboard("j");
		await user.keyboard("v");

		await waitFor(() => {
			expect(within(triageView).queryByText("Item to validate")).not.toBeInTheDocument();
		});
	});

	it("second item becomes the focused item after validating the first (auto-advance)", async () => {
		mockDocuments([
			makeItem("k1", "proposed", "First item"),
			makeItem("k2", "proposed", "Second item"),
		]);

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		await user.keyboard("j");
		await user.keyboard("v");

		await waitFor(() => {
			const triageView = screen.getByTestId("document-triage-view");
			const rows = within(triageView).getAllByRole("listitem");
			expect(rows[0]).toHaveAttribute("data-focused", "true");
			expect(rows[0]?.textContent).toContain("Second item");
		});
	});

	it("triage shows empty state after the last item is processed", async () => {
		mockDocuments([makeItem("k1", "proposed", "Last item")]);

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		await user.keyboard("j");
		await user.keyboard("v");

		await waitFor(() => {
			expect(screen.getByTestId("document-triage-empty")).toBeInTheDocument();
		});
	});
});

// FR-20: Triage keyboard hint bar was removed entirely (founder ruling: delete it, no restyle).
// The keyboard navigation (j/k/v/x/Enter) still works via the useEffect handler in
// DocumentListContent — only the visible hint UI was deleted.
