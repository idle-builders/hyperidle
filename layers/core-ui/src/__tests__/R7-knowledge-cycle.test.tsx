/**
 * R7 — Knowledge & Bet Cycles: KnowledgeList triage/curated rendering tests.
 *
 * AC-6: KnowledgeList triage tab shows items with status="proposed"
 * AC-6: KnowledgeList curated tab shows items with status="active"
 *
 * These tests verify the UI-side mapping works correctly:
 * - "proposed" items must appear in the triage tab
 * - "active" items must appear in the curated tab
 * - Items created by agents (via write_memory) must be visible in triage
 *
 * The tests use a mocked /api/knowledge endpoint to isolate UI behavior
 * from the backend status-default issue.
 *
 * @lore R7: KnowledgeList filters items by API status field:
 *   - triage: status === "proposed"
 *   - curated: status === "active"
 * The write_memory fix (default "proposed", originally "draft" before
 * the status vocabulary collapsed) makes agent-created items appear in
 * triage. This
 * test verifies the UI correctly renders both groups.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeList } from "../pages/KnowledgeList";

// ── Mock fetch helper ────────────────────────────────────────────────────────

interface MockKnowledgeItem {
	id: string;
	topic: string | null;
	title: string;
	body: string;
	format: string;
	status: string;
	version: number;
	updatedBy: string;
	createdAt: string;
	updatedAt: string;
	signals: null;
}

function mockFetchWithItems(items: MockKnowledgeItem[]): void {
	global.fetch = vi.fn(async (url: string | URL | Request) => {
		const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
		if (urlStr.includes("/api/knowledge")) {
			return {
				ok: true,
				json: async () => ({ items }),
			};
		}
		if (urlStr.includes("/api/hints")) {
			return { ok: true, json: async () => ({ hints: [] }) };
		}
		return { ok: true, json: async () => ({}) };
	}) as unknown as typeof fetch;
}

function makeDraftItem(id: string, title: string, topic?: string): MockKnowledgeItem {
	return {
		id,
		topic: topic ?? null,
		title,
		body: "Body content from agent.",
		format: "markdown",
		status: "proposed", // triage tab
		version: 1,
		updatedBy: `agent:agent-r7`,
		createdAt: "2026-05-30T00:00:00.000Z",
		updatedAt: "2026-05-30T00:00:00.000Z",
		signals: null,
	};
}

function makeActiveItem(id: string, title: string, topic?: string): MockKnowledgeItem {
	return {
		id,
		topic: topic ?? "Architecture",
		title,
		body: "Curated knowledge body.",
		format: "markdown",
		status: "active", // curated tab
		version: 1,
		updatedBy: "human:founder",
		createdAt: "2026-05-30T00:00:00.000Z",
		updatedAt: "2026-05-30T00:00:00.000Z",
		signals: null,
	};
}

function renderPage(initialPath = "/knowledge"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[initialPath]}>
			<KnowledgeList />
		</MemoryRouter>,
	);
}

// ── AC-6: Triage tab shows draft items ──────────────────────────────────────

describe("R7 AC-6: KnowledgeList triage tab shows draft items", () => {
	beforeEach(() => {
		mockFetchWithItems([
			makeDraftItem("k-draft-1", "Agent Pattern", "Performance"),
			makeDraftItem("k-draft-2", "Agent Decision"),
			makeActiveItem("k-active-1", "Curated Pattern", "Architecture"),
		]);
	});

	it("renders the Triage tab by default when draft items exist", async () => {
		renderPage();

		// The triage tab must be present
		const triageTab = await screen.findByRole("tab", { name: /triage/i });
		expect(triageTab).toBeInTheDocument();
	});

	it("triage tab is active by default when draft items exist (auto-default to triage)", async () => {
		renderPage();

		// Wait for the triage tab to become selected (auto-selection fires after data loads)
		// KnowledgeList useEffect sets tab to "triage" when draft items are present
		await waitFor(() => {
			const triageTab = screen.getByRole("tab", { name: /triage/i });
			expect(triageTab).toHaveAttribute("aria-selected", "true");
		});
	});

	it("triage tab renders draft items' titles", async () => {
		renderPage();

		// Switch to triage tab (should auto-select but click anyway for robustness)
		await waitFor(() => screen.getByRole("tab", { name: /triage/i }));
		const triageTab = screen.getByRole("tab", { name: /triage/i });
		await userEvent.click(triageTab);

		// Wait for items to appear
		await waitFor(() => {
			// Draft items must appear in the triage tab
			expect(screen.getByText("Agent Pattern")).toBeInTheDocument();
			expect(screen.getByText("Agent Decision")).toBeInTheDocument();
		});
	});

	it("triage tab does NOT render active items (they belong to curated)", async () => {
		renderPage();

		await waitFor(() => screen.getByRole("tab", { name: /triage/i }));
		const triageTab = screen.getByRole("tab", { name: /triage/i });
		await userEvent.click(triageTab);

		// Wait for triage content
		await waitFor(() => {
			expect(screen.getByText("Agent Pattern")).toBeInTheDocument();
		});

		// Active item should NOT be visible in the triage tab
		// (it belongs in curated)
		expect(screen.queryByText("Curated Pattern")).not.toBeInTheDocument();
	});
});

// ── AC-6: Curated tab shows active items ─────────────────────────────────────

describe("R7 AC-6: KnowledgeList curated tab shows active items", () => {
	beforeEach(() => {
		mockFetchWithItems([
			makeDraftItem("k-draft-1", "Draft Item For Triage"),
			makeActiveItem("k-active-1", "Active Pattern", "Architecture"),
			makeActiveItem("k-active-2", "Active Decision", "Engineering"),
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

		// Active items must appear in the curated tab
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

		// Wait for curated content to load
		await waitFor(() => {
			expect(screen.getByText("Active Pattern")).toBeInTheDocument();
		});

		// Draft item should NOT be visible in the curated tab
		expect(screen.queryByText("Draft Item For Triage")).not.toBeInTheDocument();
	});
});

// ── AC-6: Agent-created items (draft) appear in triage ────────────────────────

describe("R7 AC-6: Agent-created knowledge items appear in triage tab", () => {
	it("item with updatedBy='agent:...' and status='draft' appears in triage tab", async () => {
		// This simulates the post-fix world: write_memory creates items with status="draft"
		// and the KnowledgeList shows them in the triage tab.
		mockFetchWithItems([
			{
				id: "k-agent-created",
				topic: "Patterns",
				title: "Agent-Discovered Pattern",
				body: "This pattern was captured by the builder agent during work.",
				format: "markdown",
				// After R7 fix: status is "draft" (was "active" before fix)
				status: "proposed",
				version: 1,
				updatedBy: "agent:builder-001", // agent-created
				createdAt: "2026-05-30T12:00:00.000Z",
				updatedAt: "2026-05-30T12:00:00.000Z",
				signals: null,
			},
		]);

		renderPage();

		// Triage tab must be auto-selected (draft item exists)
		await waitFor(() => {
			const triageTab = screen.getByRole("tab", { name: /triage/i });
			expect(triageTab).toHaveAttribute("aria-selected", "true");
		});

		// The agent-created item must appear in the triage tab
		expect(screen.getByText("Agent-Discovered Pattern")).toBeInTheDocument();
	});

	it("curated tab is auto-selected when NO draft items exist (all active)", async () => {
		// When no items have status="draft", the page defaults to the curated tab.
		mockFetchWithItems([makeActiveItem("k-only-active", "Only Active Item", "Engineering")]);

		renderPage();

		// Wait for data to load
		await waitFor(() => {
			expect(screen.queryByRole("status", { name: /loading/i })).not.toBeInTheDocument();
		});

		// No draft items → curated tab should be auto-selected
		const curatedTab = screen.getByRole("tab", { name: /curated/i });
		expect(curatedTab).toHaveAttribute("aria-selected", "true");
	});

	it("triage tab shows empty state when no draft items match", async () => {
		// When user switches to triage but no draft items exist
		mockFetchWithItems([makeActiveItem("k-active-only", "Active Only Item", "Engineering")]);

		renderPage();

		await waitFor(() => screen.getByRole("tab", { name: /triage/i }));
		const triageTab = screen.getByRole("tab", { name: /triage/i });
		await userEvent.click(triageTab);

		// Triage should show an empty state (no draft items)
		// The KnowledgeList should render an empty message, not crash
		await waitFor(() => {
			// Either an empty state message or no item titles
			expect(screen.queryByText("Active Only Item")).not.toBeInTheDocument();
		});
	});
});

// ── AC-6: Both tabs render independently ─────────────────────────────────────

describe("R7 AC-6: Both triage and curated tabs render correctly", () => {
	beforeEach(() => {
		mockFetchWithItems([
			makeDraftItem("k-draft-a", "Draft Alpha"),
			makeDraftItem("k-draft-b", "Draft Beta"),
			makeActiveItem("k-active-a", "Active Alpha", "Design"),
			makeActiveItem("k-active-b", "Active Beta", "Engineering"),
		]);
	});

	it("switching between tabs correctly shows the right subset of items", async () => {
		renderPage();

		// Start with triage (auto-selected due to draft items)
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});

		// Triage shows draft items
		expect(screen.getByText("Draft Alpha")).toBeInTheDocument();
		expect(screen.getByText("Draft Beta")).toBeInTheDocument();
		expect(screen.queryByText("Active Alpha")).not.toBeInTheDocument();

		// Switch to curated
		const curatedTab = screen.getByRole("tab", { name: /curated/i });
		await userEvent.click(curatedTab);

		await waitFor(() => {
			expect(screen.getByText("Active Alpha")).toBeInTheDocument();
		});

		// Curated shows active items grouped by topic
		expect(screen.getByText("Active Beta")).toBeInTheDocument();

		// Draft items are gone
		expect(screen.queryByText("Draft Alpha")).not.toBeInTheDocument();
		expect(screen.queryByText("Draft Beta")).not.toBeInTheDocument();
	});
});
