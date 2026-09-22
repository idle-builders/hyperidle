/**
 * R7 — Knowledge & Bet Cycles: DocumentList triage/curated rendering tests.
 *
 * AC-6: DocumentList triage tab shows items with status="proposed"
 * AC-6: DocumentList curated tab shows items with status="active"
 *
 * These tests verify the UI-side mapping works correctly:
 * - "proposed" items must appear in the triage tab
 * - "active" items must appear in the curated tab
 * - Items written as a memory (`edit_document({as:"memory"})`) must be
 *   visible in triage
 *
 * @lore R7: DocumentList splits by the `status` field:
 *   - triage: status === "proposed"
 *   - curated: status === "active"
 *
 * @lore BC4: re-pointed onto DocumentList/useDocuments — mocks the hook
 * directly instead of a raw `/api/knowledge` fetch. The write_memory tool is
 * gone (BC4 — `edit_document({as:"memory"})` replaces it); the "agent-created
 * item lands in triage" behaviour this file locks is unchanged.
 */

import type { DocumentRow, DocumentStatus } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "../pages/DocumentList";

const mockUseDocuments = vi.fn();
vi.mock("../hooks/useDocuments.js", () => ({
	useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

function mockDocuments(documents: DocumentRow[]): void {
	mockUseDocuments.mockReturnValue({
		documents,
		status: "ready",
		error: null,
		retry: vi.fn(),
	});
}

function makeDraftItem(id: string, title: string): DocumentRow {
	return {
		id,
		title,
		body: "Body content from agent.",
		format: "markdown",
		status: "proposed", // triage tab
		slot: "ordinary",
		scopeKind: "team",
		scopeId: "team-1",
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "agent:agent-r7",
		createdAt: "2026-05-30T00:00:00.000Z",
		updatedAt: "2026-05-30T00:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
	};
}

function makeActiveItem(id: string, title: string): DocumentRow {
	return {
		id,
		title,
		body: "Curated document body.",
		format: "markdown",
		status: "active" as DocumentStatus, // curated tab
		slot: "ordinary",
		scopeKind: "team",
		scopeId: "team-1",
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "human:founder",
		createdAt: "2026-05-30T00:00:00.000Z",
		updatedAt: "2026-05-30T00:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
	};
}

function renderPage(initialPath = "/documents"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[initialPath]}>
			<DocumentList />
		</MemoryRouter>,
	);
}

// ── AC-6: Triage tab shows draft items ──────────────────────────────────────

describe("R7 AC-6: DocumentList triage tab shows draft items", () => {
	beforeEach(() => {
		mockDocuments([
			makeDraftItem("k-draft-1", "Agent Pattern"),
			makeDraftItem("k-draft-2", "Agent Decision"),
			makeActiveItem("k-active-1", "Curated Pattern"),
		]);
	});

	it("renders the Triage tab by default when draft items exist", async () => {
		renderPage();

		const triageTab = await screen.findByRole("tab", { name: /triage/i });
		expect(triageTab).toBeInTheDocument();
	});

	it("triage tab is active by default when draft items exist (auto-default to triage)", async () => {
		renderPage();

		await waitFor(() => {
			const triageTab = screen.getByRole("tab", { name: /triage/i });
			expect(triageTab).toHaveAttribute("aria-selected", "true");
		});
	});

	it("triage tab renders draft items' titles", async () => {
		renderPage();

		await waitFor(() => screen.getByRole("tab", { name: /triage/i }));
		const triageTab = screen.getByRole("tab", { name: /triage/i });
		await userEvent.click(triageTab);

		await waitFor(() => {
			expect(screen.getByText("Agent Pattern")).toBeInTheDocument();
			expect(screen.getByText("Agent Decision")).toBeInTheDocument();
		});
	});

	it("triage tab does NOT render active items (they belong to curated)", async () => {
		renderPage();

		await waitFor(() => screen.getByRole("tab", { name: /triage/i }));
		const triageTab = screen.getByRole("tab", { name: /triage/i });
		await userEvent.click(triageTab);

		await waitFor(() => {
			expect(screen.getByText("Agent Pattern")).toBeInTheDocument();
		});

		expect(screen.queryByText("Curated Pattern")).not.toBeInTheDocument();
	});
});

// ── AC-6: Curated tab shows active items ─────────────────────────────────────

describe("R7 AC-6: DocumentList curated tab shows active items", () => {
	beforeEach(() => {
		mockDocuments([
			makeDraftItem("k-draft-1", "Draft Item For Triage"),
			makeActiveItem("k-active-1", "Active Pattern"),
			makeActiveItem("k-active-2", "Active Decision"),
		]);
	});

	it("renders the Curated tab", async () => {
		renderPage();

		const curatedTab = await screen.findByRole("tab", { name: /curated/i });
		expect(curatedTab).toBeInTheDocument();
	});

	it("curated tab renders active items when clicked", async () => {
		renderPage();

		await waitFor(() => screen.getByRole("tab", { name: /curated/i }));
		const curatedTab = screen.getByRole("tab", { name: /curated/i });
		await userEvent.click(curatedTab);

		await waitFor(() => {
			expect(screen.getByText("Active Pattern")).toBeInTheDocument();
			expect(screen.getByText("Active Decision")).toBeInTheDocument();
		});
	});

	it("curated tab does NOT render draft items (they belong to triage)", async () => {
		renderPage();

		await waitFor(() => screen.getByRole("tab", { name: /curated/i }));
		const curatedTab = screen.getByRole("tab", { name: /curated/i });
		await userEvent.click(curatedTab);

		await waitFor(() => {
			expect(screen.getByText("Active Pattern")).toBeInTheDocument();
		});

		expect(screen.queryByText("Draft Item For Triage")).not.toBeInTheDocument();
	});
});

// ── AC-6: Agent-created items (draft) appear in triage ────────────────────────

describe("R7 AC-6: Agent-created documents appear in triage tab", () => {
	it("item with updatedBy='agent:...' and status='proposed' appears in triage tab", async () => {
		mockDocuments([makeDraftItem("k-agent-created", "Agent-Discovered Pattern")]);

		renderPage();

		await waitFor(() => {
			const triageTab = screen.getByRole("tab", { name: /triage/i });
			expect(triageTab).toHaveAttribute("aria-selected", "true");
		});

		expect(screen.getByText("Agent-Discovered Pattern")).toBeInTheDocument();
	});

	it("curated tab is auto-selected when NO draft items exist (all active)", async () => {
		mockDocuments([makeActiveItem("k-only-active", "Only Active Item")]);

		renderPage();

		await waitFor(() => {
			expect(screen.queryByRole("status", { name: /loading/i })).not.toBeInTheDocument();
		});

		const curatedTab = screen.getByRole("tab", { name: /curated/i });
		expect(curatedTab).toHaveAttribute("aria-selected", "true");
	});

	it("triage tab shows empty state when no draft items match", async () => {
		mockDocuments([makeActiveItem("k-active-only", "Active Only Item")]);

		renderPage();

		await waitFor(() => screen.getByRole("tab", { name: /triage/i }));
		const triageTab = screen.getByRole("tab", { name: /triage/i });
		await userEvent.click(triageTab);

		await waitFor(() => {
			expect(screen.queryByText("Active Only Item")).not.toBeInTheDocument();
		});
	});
});

// ── AC-6: Both tabs render independently ─────────────────────────────────────

describe("R7 AC-6: Both triage and curated tabs render correctly", () => {
	beforeEach(() => {
		mockDocuments([
			makeDraftItem("k-draft-a", "Draft Alpha"),
			makeDraftItem("k-draft-b", "Draft Beta"),
			makeActiveItem("k-active-a", "Active Alpha"),
			makeActiveItem("k-active-b", "Active Beta"),
		]);
	});

	it("switching between tabs correctly shows the right subset of items", async () => {
		renderPage();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		expect(screen.getByText("Draft Alpha")).toBeInTheDocument();
		expect(screen.getByText("Draft Beta")).toBeInTheDocument();
		expect(screen.queryByText("Active Alpha")).not.toBeInTheDocument();

		const curatedTab = screen.getByRole("tab", { name: /curated/i });
		await userEvent.click(curatedTab);

		await waitFor(() => {
			expect(screen.getByText("Active Alpha")).toBeInTheDocument();
		});

		expect(screen.getByText("Active Beta")).toBeInTheDocument();

		expect(screen.queryByText("Draft Alpha")).not.toBeInTheDocument();
		expect(screen.queryByText("Draft Beta")).not.toBeInTheDocument();
	});
});
