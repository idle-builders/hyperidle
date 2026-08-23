/**
 * W3 — Knowledge Pages AC-33 through AC-46: Red phase tests.
 *
 * AC-33: Scope filter pills from data (not fixed Practices/Products/Factory).
 * AC-34: Sort controls visible in both Curated and Triage views.
 * AC-35: Knowledge rows show preview text; no status dots.
 * AC-36: "+ New" button in header.
 * AC-37: Curated/Triage tab switching.
 * AC-38: Content max-width 800px, centered.
 * AC-39: "Edit" primary button + "..." overflow menu in detail.
 * AC-40: Two-column layout (body + metadata aside).
 * AC-41: Backlinks card in aside.
 * AC-42: Discussion section below body.
 * AC-43: Content max-width 960px, centered.
 * AC-44: Edit mode transitions (Done replaces Edit, toolbar, editor border, save indicator).
 * AC-45: Done returns to read mode.
 * AC-46: Metadata aside stays read-only during editing.
 */

import { KnowledgeRow } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../../pages/KnowledgeDetail";
import { KnowledgeList } from "../../pages/KnowledgeList";

// Mock API for KnowledgeList
vi.mock("../../hooks/useFetch", () => ({
	useFetch: (url: string | null) => {
		if (url && url.includes("/api/knowledge")) {
			return {
				data: {
					items: [
						{
							id: "k1",
							title: "Auth Strategy Decision",
							body: "We decided to use JWT.",
							topic: "Auth",
							status: "active",
							scopeKind: "Auth",
							updatedAt: "2026-01-01T10:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
						{
							id: "k2",
							title: "Infrastructure Guidelines",
							body: "Use Docker for all services.",
							topic: "Infrastructure",
							status: "draft",
							scopeKind: "Infrastructure",
							updatedAt: "2026-01-01T11:00:00.000Z",
							updatedBy: "u-founder",
							version: 1,
							format: "markdown",
						},
					],
				},
				loading: false,
				error: null,
				refresh: vi.fn(),
			};
		}
		return { data: null, loading: false, error: null, refresh: vi.fn() };
	},
}));

vi.mock("../../hooks/useKnowledgeItem", () => ({
	useKnowledgeItem: () => ({
		data: {
			id: "k1",
			title: "Auth Strategy Decision",
			body: "We decided to use JWT.",
			topic: "Auth",
			status: "active",
			kind: "decision",
			layer: "L2",
			// W3: scopeKind must be "practice" so the Edit button renders (factory items are read-only)
			scopeKind: "practice",
			scopeId: null,
			version: 1,
			format: "markdown",
			confidence: 0.9,
			createdAt: "2026-01-01T10:00:00.000Z",
			updatedAt: "2026-01-01T10:00:00.000Z",
			updatedBy: "Test Founder",
			accessCount: 42,
			relatedItems: [{ id: "k3", title: "JWT Implementation Notes" }],
		},
		loading: false,
		error: null,
	}),
}));

vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: ({ hostKind, hostId }: { hostKind: string; hostId: string }) => (
		<div data-testid="host-thread-section" data-host-kind={hostKind} data-host-id={hostId} />
	),
}));

vi.mock("../../hooks/useAutoSave", () => ({
	useAutoSave: () => ({
		triggerSave: vi.fn(),
		status: "idle",
	}),
}));

vi.mock("../../hooks/useCurrentUser", () => ({
	useCurrentUser: () => ({
		data: { id: "u-founder", name: "Test Founder", avatarUrl: null },
	}),
}));

// Mock BodyEditor (TipTap requires DOM APIs unavailable in JSDOM)
vi.mock("@hyperidle/design-system", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@hyperidle/design-system")>();
	return {
		...actual,
		BodyEditor: ({ onContentChange }: { onContentChange?: (content: string) => void }) => (
			<div data-testid="body-editor-mock">
				<div className="formatting-toolbar" data-testid="formatting-toolbar">
					<button type="button">Bold</button>
					<button type="button">Italic</button>
				</div>
				<textarea
					data-testid="body-editor-textarea"
					onChange={(e) => onContentChange?.(e.target.value)}
				/>
			</div>
		),
	};
});

function renderKnowledgeList(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/knowledge"]}>
			<Routes>
				<Route path="/knowledge" element={<KnowledgeList />} />
			</Routes>
		</MemoryRouter>,
	);
}

function renderKnowledgeDetail(id = "k1"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${id}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// AC-33: Data-driven scope pills (not hardcoded)
// ---------------------------------------------------------------------------
describe("W3 AC-33 — Data-driven scope pills", () => {
	it("does NOT render hardcoded 'Practices' scope pill", () => {
		renderKnowledgeList();
		// Old hardcoded pills should be gone
		expect(screen.queryByRole("button", { name: /^practices$/i })).not.toBeInTheDocument();
	});

	it("does NOT render hardcoded 'Products' scope pill", () => {
		renderKnowledgeList();
		expect(screen.queryByRole("button", { name: /^products$/i })).not.toBeInTheDocument();
	});

	it("does NOT render hardcoded 'Factory' scope pill", () => {
		renderKnowledgeList();
		expect(screen.queryByRole("button", { name: /^factory$/i })).not.toBeInTheDocument();
	});

	it("renders 'All' pill first", () => {
		// AD6: scope pills use role="radio" (accessibility improvement) — query by testid.
		renderKnowledgeList();
		const allPill = screen.getByTestId("scope-pill-all");
		expect(allPill).toBeInTheDocument();
	});

	it("renders static scope pills (Shared, Team, Private)", () => {
		renderKnowledgeList();
		expect(screen.getByTestId("scope-pill-shared")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-team")).toBeInTheDocument();
		expect(screen.getByTestId("scope-pill-private")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-34: Sort controls visible in both views
// ---------------------------------------------------------------------------
describe("W3 AC-34 — Sort controls always visible", () => {
	it("renders sort controls on the list page", () => {
		renderKnowledgeList();
		// Sort controls: Relevance, Recency, Frequency
		const sortBar = document.querySelector("[data-testid='knowledge-sort-bar']");
		expect(sortBar).not.toBeNull();
	});

	it("renders Recency sort option", () => {
		renderKnowledgeList();
		expect(screen.getByText(/recency/i)).toBeInTheDocument();
	});

	it("sort controls are visible in Curated tab", async () => {
		const user = userEvent.setup();
		renderKnowledgeList();
		// Switch to Curated tab
		const curatedTab = screen.getByRole("tab", { name: /curated/i });
		await user.click(curatedTab);
		// Sort controls still visible
		const sortBar = document.querySelector("[data-testid='knowledge-sort-bar']");
		expect(sortBar).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-35: Knowledge rows show preview; no status dots
// ---------------------------------------------------------------------------
describe("W3 AC-35 — KnowledgeRow preview and no status dots", () => {
	it("KnowledgeRow renders preview text when preview prop provided", () => {
		render(
			<KnowledgeRow
				id="k1"
				title="Auth Strategy Decision"
				kind="decision"
				status="active"
				timestamp="2026-01-01"
				preview="We decided to use JWT."
			/>,
		);
		expect(screen.getByText("We decided to use JWT.")).toBeInTheDocument();
	});

	it("KnowledgeRow does NOT render a status dot element", () => {
		const { container } = render(
			<KnowledgeRow
				id="k1"
				title="Auth Strategy Decision"
				kind="decision"
				status="active"
				timestamp="2026-01-01"
			/>,
		);
		const dot = container.querySelector("[class*='status-dot'], [data-status-dot], .dot");
		expect(dot).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-36: "+ New" button in header
// ---------------------------------------------------------------------------
describe("W3 AC-36 — '+New' button in knowledge list header", () => {
	it("renders a '+ New' button in the knowledge list header", () => {
		renderKnowledgeList();
		const newBtn = screen.getByRole("button", { name: /\+\s*new|new knowledge/i });
		expect(newBtn).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-37: Curated/Triage tab switching
// ---------------------------------------------------------------------------
describe("W3 AC-37 — Curated/Triage tab switching", () => {
	it("renders Curated and Triage tabs", () => {
		renderKnowledgeList();
		expect(screen.getByRole("tab", { name: /curated/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /triage/i })).toBeInTheDocument();
	});

	it("clicking Curated tab switches view", async () => {
		const user = userEvent.setup();
		renderKnowledgeList();
		await user.click(screen.getByRole("tab", { name: /curated/i }));
		const curatedTab = screen.getByRole("tab", { name: /curated/i });
		expect(curatedTab).toHaveAttribute("aria-selected", "true");
	});
});

// ---------------------------------------------------------------------------
// AC-38: Knowledge list keeps its 800px scan lane
// ---------------------------------------------------------------------------
describe("W3 AC-38 — Knowledge list max-width 800px", () => {
	it("knowledge list keeps 800px measure without centering the scan lane", () => {
		renderKnowledgeList();
		// Check for max-width class pattern inside the page
		const page = document.querySelector("[data-testid='knowledge-list-page']");
		expect(page).not.toBeNull();
		// Content container inside page should have max-width
		const contentDiv = page?.querySelector("[class*='max-w-\\[800px\\]']");
		expect(contentDiv).not.toBeNull();
		expect(contentDiv?.className).not.toMatch(/mx-auto/);
	});
});

// ---------------------------------------------------------------------------
// AC-39: Knowledge detail — "Edit" primary button + "..." overflow
// ---------------------------------------------------------------------------
describe("W3 AC-39 — Knowledge detail Edit button and overflow menu", () => {
	it("renders an 'Edit' button", () => {
		renderKnowledgeDetail();
		expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
	});

	it("renders a '...' overflow button", () => {
		renderKnowledgeDetail();
		const overflowBtn = screen.getByRole("button", { name: /more options|overflow|\.\.\.|⋯/i });
		expect(overflowBtn).toBeInTheDocument();
	});

	it("overflow menu contains Archive and Change scope options (Flag removed by AD6)", async () => {
		const user = userEvent.setup();
		renderKnowledgeDetail();
		const overflowBtn = screen.getByRole("button", { name: /more options|overflow|\.\.\.|⋯/i });
		await user.click(overflowBtn);
		expect(screen.queryByText(/flag/i)).not.toBeInTheDocument();
		expect(screen.getByText(/archive/i)).toBeInTheDocument();
		expect(screen.getByText(/change scope/i)).toBeInTheDocument();
	});

	it("does NOT render an inline 'Change scope' button (moved to overflow)", () => {
		renderKnowledgeDetail();
		// Change scope should not be a standalone button in the header
		const changeScopeInline = document.querySelector(
			"[data-bet-action='change-scope']:not([data-dropdown-item])",
		);
		expect(changeScopeInline).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-40: Two-column layout in detail
// ---------------------------------------------------------------------------
describe("W3 AC-40 — Knowledge detail two-column layout", () => {
	it("renders a metadata aside", () => {
		renderKnowledgeDetail();
		const aside = document.querySelector(
			"aside[data-testid='knowledge-metadata-aside'], [data-testid='knowledge-metadata-aside']",
		);
		expect(aside).not.toBeNull();
	});

	it("metadata aside shows Kind field", () => {
		renderKnowledgeDetail();
		const aside = document.querySelector("[data-testid='knowledge-metadata-aside']");
		expect(aside).toHaveTextContent(/kind/i);
	});

	it("metadata aside shows Status field", () => {
		renderKnowledgeDetail();
		const aside = document.querySelector("[data-testid='knowledge-metadata-aside']");
		expect(aside).toHaveTextContent(/status/i);
	});

	it("metadata aside shows Confidence field", () => {
		renderKnowledgeDetail();
		const aside = document.querySelector("[data-testid='knowledge-metadata-aside']");
		expect(aside).toHaveTextContent(/confidence/i);
	});

	it("metadata aside shows Last edited field", () => {
		renderKnowledgeDetail();
		const aside = document.querySelector("[data-testid='knowledge-metadata-aside']");
		expect(aside).toHaveTextContent(/last edited/i);
	});

	it("metadata aside does NOT show Access count (UI-047: machine data removed)", () => {
		renderKnowledgeDetail();
		const aside = document.querySelector("[data-testid='knowledge-metadata-aside']");
		expect(aside).not.toHaveTextContent(/access count/i);
	});
});

// ---------------------------------------------------------------------------
// AC-41: Backlinks card in aside
// ---------------------------------------------------------------------------
describe("W3 AC-41 — Backlinks card in aside", () => {
	it("renders a backlinks card in the metadata aside", () => {
		renderKnowledgeDetail();
		const backlinksCard = document.querySelector("[data-testid='knowledge-backlinks-card']");
		expect(backlinksCard).not.toBeNull();
	});

	it("backlinks card shows related item titles", () => {
		renderKnowledgeDetail();
		const backlinksCard = document.querySelector("[data-testid='knowledge-backlinks-card']");
		expect(backlinksCard).toHaveTextContent(/JWT Implementation Notes/i);
	});
});

// ---------------------------------------------------------------------------
// AC-42: Discussion section below body
// ---------------------------------------------------------------------------
describe("W3 AC-42 — Discussion section below body", () => {
	it("renders HostThreadSection below the body content", () => {
		renderKnowledgeDetail();
		const threadSection = screen.getByTestId("host-thread-section");
		expect(threadSection).toBeInTheDocument();
		// knowledge detail uses hostKind="knowledge_item" (the canonical HostKind value)
		expect(threadSection).toHaveAttribute("data-host-kind", "knowledge_item");
	});
});

// ---------------------------------------------------------------------------
// AC-43: Knowledge detail max-width 960px, centered
// ---------------------------------------------------------------------------
describe("W3 AC-43 — Knowledge detail max-width 960px", () => {
	// @lore AZ2: KnowledgeDetail now composes <PageScaffold>; the scroll region
	// is PageScaffold's own `[data-page-scroll]` element (the old
	// `data-testid="knowledge-detail-body"` on that div is superseded by the
	// scaffold's own contract marker — round.md §4.2 migration table). The
	// max-w-[960px] content div is the scroll body's direct child.
	it("detail body keeps 960px measure inside the stable page frame", () => {
		renderKnowledgeDetail();
		const scroller = document.querySelector("[data-page-scroll]");
		expect(scroller).not.toBeNull();
		const frame = scroller?.querySelector("[data-page-frame]");
		const inner = frame?.firstElementChild;
		expect(frame).not.toBeNull();
		expect(inner?.className).toMatch(/max-w-\[960px\]/);
		expect(inner?.className).not.toMatch(/mx-auto/);
	});
});

// ---------------------------------------------------------------------------
// AC-44: Edit mode — Done replaces Edit, toolbar, editor border, save indicator
// ---------------------------------------------------------------------------
describe("W3 AC-44 — Knowledge edit mode", () => {
	it("clicking Edit button transitions to edit mode", async () => {
		const user = userEvent.setup();
		renderKnowledgeDetail();
		await user.click(screen.getByRole("button", { name: /^edit$/i }));
		// "Done" should now be visible
		expect(screen.getByRole("button", { name: /^done$/i })).toBeInTheDocument();
	});

	it("edit mode hides 'Edit' button and shows 'Done'", async () => {
		const user = userEvent.setup();
		renderKnowledgeDetail();
		await user.click(screen.getByRole("button", { name: /^edit$/i }));
		expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^done$/i })).toBeInTheDocument();
	});

	it("edit mode shows formatting toolbar", async () => {
		const user = userEvent.setup();
		renderKnowledgeDetail();
		await user.click(screen.getByRole("button", { name: /^edit$/i }));
		// Toolbar should be visible (our mock BodyEditor includes it)
		const toolbar = screen.queryByTestId("formatting-toolbar");
		expect(toolbar).not.toBeNull();
	});

	it("edit mode wraps editor in a bordered container", async () => {
		const user = userEvent.setup();
		renderKnowledgeDetail();
		await user.click(screen.getByRole("button", { name: /^edit$/i }));
		// W3: edit panel uses data-testid="knowledge-edit-panel" (renamed from knowledge-editor-area)
		const editorArea = document.querySelector(
			"[data-testid='knowledge-edit-panel'], [class*='editor-area']",
		);
		expect(editorArea).not.toBeNull();
	});

	it("edit mode shows save indicator in header", async () => {
		const user = userEvent.setup();
		renderKnowledgeDetail();
		await user.click(screen.getByRole("button", { name: /^edit$/i }));
		// Save indicator (Saved ✓ or Saving...) should be in the header
		const saveIndicator = document.querySelector(
			"[data-testid='save-indicator'], [data-save-status]",
		);
		expect(saveIndicator).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC-45: "Done" returns to read mode
// ---------------------------------------------------------------------------
describe("W3 AC-45 — Done returns to read mode", () => {
	it("clicking Done returns to read mode", async () => {
		const user = userEvent.setup();
		renderKnowledgeDetail();

		// Enter edit mode
		await user.click(screen.getByRole("button", { name: /^edit$/i }));
		expect(screen.getByRole("button", { name: /^done$/i })).toBeInTheDocument();

		// Exit edit mode
		await user.click(screen.getByRole("button", { name: /^done$/i }));

		// Should be back in read mode
		expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^done$/i })).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC-46: Metadata aside stays read-only during editing
// ---------------------------------------------------------------------------
describe("W3 AC-46 — Metadata aside read-only during editing", () => {
	it("metadata aside remains visible and read-only in edit mode", async () => {
		const user = userEvent.setup();
		renderKnowledgeDetail();

		const asideBefore = document.querySelector("[data-testid='knowledge-metadata-aside']");
		expect(asideBefore).not.toBeNull();

		await user.click(screen.getByRole("button", { name: /^edit$/i }));

		// Aside still exists
		const asideAfter = document.querySelector("[data-testid='knowledge-metadata-aside']");
		expect(asideAfter).not.toBeNull();

		// No input fields in the aside (read-only)
		const inputsInAside = asideAfter?.querySelectorAll("input, select, textarea");
		expect(inputsInAside?.length ?? 0).toBe(0);
	});
});
