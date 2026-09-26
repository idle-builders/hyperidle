/**
 * DocumentList: the browsable document tree, split into Triage (proposed)
 * and Curated (active) tabs, with static scope pills, recency sort, keyboard
 * triage actions, and the parent-rule filter that keeps role-carrying
 * bindings (agent identities, subscription prompts, skills, rules) out of
 * the browsable tree.
 */

import type { DocumentRow, DocumentStatus } from "@hyperidle/domain-model";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "../pages/DocumentList";
import { ToastRegion } from "../shell/ToastRegion.js";

const mockUseDocuments = vi.fn();
vi.mock("../hooks/useDocuments.js", () => ({
	useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

const mockCall = vi.fn();
vi.mock("../services/call.js", () => ({
	call: (...args: unknown[]) => mockCall(...args),
}));

const { subscribeMock, unsubscribeMock } = vi.hoisted(() => {
	const unsubscribeMock = vi.fn();
	const subscribeMock = vi.fn(
		(_topic: string, _handler: (data: unknown) => void) => unsubscribeMock,
	);
	return { subscribeMock, unsubscribeMock };
});
vi.mock("../services/ws-client.js", () => ({
	getWsClient: () => ({ subscribe: subscribeMock }),
}));

function makeDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
	return {
		id: "k1",
		title: "Untitled",
		body: "",
		format: "markdown",
		status: "active",
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
		...overrides,
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

function renderAt(path = "/documents"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<ToastRegion>
				<DocumentList />
			</ToastRegion>
		</MemoryRouter>,
	);
}

beforeEach(() => {
	mockUseDocuments.mockReset();
	mockCall.mockReset();
	subscribeMock.mockReset();
	subscribeMock.mockReturnValue(unsubscribeMock);
});

afterEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Basic render
// ---------------------------------------------------------------------------

describe("DocumentList", () => {
	const docs = [
		makeDoc({ id: "k1", title: "Architecture Decision: Auth Strategy" }),
		makeDoc({ id: "k2", title: "API Rate Limiting Best Practices" }),
	];

	beforeEach(() => mockDocuments(docs));

	it("calls search_documents with {inTree: true} by default", async () => {
		renderAt();
		await screen.findByTestId("document-list-page");
		expect(mockUseDocuments).toHaveBeenCalledWith({ inTree: true });
	});

	it("renders the Documents heading and the fetched items", async () => {
		renderAt();
		expect(await screen.findByText("Documents")).toBeInTheDocument();
		expect(screen.getByText("Architecture Decision: Auth Strategy")).toBeInTheDocument();
		expect(screen.getByText("API Rate Limiting Best Practices")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Tabs: status decides Triage vs Curated
// ---------------------------------------------------------------------------

describe("DocumentList tabs: status decides Triage vs Curated", () => {
	it("defaults to Triage and shows only proposed items when a draft exists", async () => {
		mockDocuments([
			makeDoc({ id: "k-draft-1", status: "proposed", title: "Agent Pattern" }),
			makeDoc({ id: "k-active-1", status: "active", title: "Curated Pattern" }),
		]);
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});
		expect(screen.getByText("Agent Pattern")).toBeInTheDocument();
		expect(screen.queryByText("Curated Pattern")).not.toBeInTheDocument();
	});

	it("defaults to Curated when no draft items exist", async () => {
		mockDocuments([makeDoc({ id: "k-only-active", status: "active", title: "Only Active Item" })]);
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /curated/i })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});
		expect(screen.getByText("Only Active Item")).toBeInTheDocument();
	});

	it("switching tabs shows the right subset of items in each direction", async () => {
		mockDocuments([
			makeDoc({ id: "k-draft-a", status: "proposed", title: "Draft Alpha" }),
			makeDoc({ id: "k-active-a", status: "active", title: "Active Alpha" }),
		]);
		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});
		expect(screen.getByText("Draft Alpha")).toBeInTheDocument();
		expect(screen.queryByText("Active Alpha")).not.toBeInTheDocument();

		await user.click(screen.getByRole("tab", { name: /curated/i }));

		await waitFor(() => {
			expect(screen.getByText("Active Alpha")).toBeInTheDocument();
		});
		expect(screen.queryByText("Draft Alpha")).not.toBeInTheDocument();
	});

	it("triage tab renders exactly the proposed rows — no active, archived, or stale", async () => {
		mockDocuments([
			makeDoc({ id: "k-p1", status: "proposed", title: "Flagged for human review" }),
			makeDoc({ id: "k-p2", status: "proposed", title: "Second proposed item" }),
			makeDoc({ id: "k-active", status: "active", title: "Active item" }),
			makeDoc({ id: "k-archived", status: "archived", title: "Archived item" }),
			makeDoc({ id: "k-stale", status: "stale" as DocumentStatus, title: "Stale item" }),
		]);
		renderAt();

		const triageView = await screen.findByTestId("document-triage-view");
		expect(within(triageView).getByText("Flagged for human review")).toBeInTheDocument();
		expect(within(triageView).getByText("Second proposed item")).toBeInTheDocument();
		expect(within(triageView).getAllByRole("listitem")).toHaveLength(2);
	});

	it("shows the triage empty state when no proposed items exist", async () => {
		mockDocuments([
			makeDoc({ id: "k-active", status: "active", title: "Active document" }),
			makeDoc({ id: "k-archived", status: "archived", title: "Archived document" }),
		]);
		const user = userEvent.setup();
		renderAt();

		await user.click(screen.getByRole("tab", { name: /triage/i }));
		expect(await screen.findByTestId("document-triage-empty")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Scope pills
// ---------------------------------------------------------------------------

describe("DocumentList scope pills", () => {
	beforeEach(() => {
		mockDocuments([
			makeDoc({ id: "k1", title: "Auth Strategy Decision", scopeKind: "factory" }),
			makeDoc({ id: "k2", title: "User Onboarding Flow", scopeKind: "user" }),
			makeDoc({ id: "k3", title: "Agent Autonomy Policy", scopeKind: "team" }),
		]);
	});

	it.each(["all", "shared", "team", "private"])(
		"renders the static '%s' scope pill regardless of which scopeKinds are present",
		(pill) => {
			renderAt();
			const scopePills = screen.getByTestId("document-scope-pills");
			expect(scopePills.querySelector(`[data-testid="scope-pill-${pill}"]`)).not.toBeNull();
		},
	);

	it("defaults to All active; clicking a pill makes it the active one", async () => {
		const user = userEvent.setup();
		renderAt();

		expect(screen.getByTestId("scope-pill-all")).toHaveAttribute("aria-checked", "true");
		expect(screen.getByTestId("scope-pill-shared")).toHaveAttribute("aria-checked", "false");

		await user.click(screen.getByTestId("scope-pill-shared"));

		await waitFor(() => {
			expect(screen.getByTestId("scope-pill-shared")).toHaveAttribute("aria-checked", "true");
			expect(screen.getByTestId("scope-pill-all")).toHaveAttribute("aria-checked", "false");
		});
	});

	it("sort controls expose the active sort via aria-checked", async () => {
		const user = userEvent.setup();
		renderAt();

		await user.click(screen.getByRole("tab", { name: /triage/i }));

		await waitFor(() => {
			const sortControls = screen.getByTestId("document-sort-bar");
			expect(sortControls.querySelector("[aria-checked='true']")).not.toBeNull();
		});
	});

	it('shows the "+ New" button in the header', () => {
		renderAt();
		expect(screen.getByRole("button", { name: /\+ new/i })).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Sort pills reorder each tab
// ---------------------------------------------------------------------------

describe("DocumentList sort pills reorder the active tab", () => {
	it("Recency pill reorders curated items by updatedAt desc", async () => {
		mockDocuments([
			makeDoc({
				id: "old",
				status: "active",
				updatedAt: "2024-01-01T00:00:00Z",
				title: "Oldest Item",
			}),
			makeDoc({
				id: "new",
				status: "active",
				updatedAt: "2024-06-01T00:00:00Z",
				title: "Newest Item",
			}),
			makeDoc({
				id: "mid",
				status: "active",
				updatedAt: "2024-03-01T00:00:00Z",
				title: "Middle Item",
			}),
		]);

		const user = userEvent.setup();
		renderAt();

		await user.click(screen.getByRole("tab", { name: /curated/i }));

		const sortBar = screen.getByTestId("document-sort-bar");
		await user.click(within(sortBar).getByRole("button", { name: /recency/i }));

		await waitFor(() => {
			const curatedView = screen.getByTestId("document-curated-view");
			// @lore nested-knowledge-items tree-ui: curated rows are <li role="treeitem">
			const texts = within(curatedView)
				.getAllByRole("treeitem")
				.map((r) => r.textContent ?? "");
			const newestIdx = texts.findIndex((t) => t.includes("Newest Item"));
			const middleIdx = texts.findIndex((t) => t.includes("Middle Item"));
			const oldestIdx = texts.findIndex((t) => t.includes("Oldest Item"));
			expect(newestIdx).toBeLessThan(middleIdx);
			expect(middleIdx).toBeLessThan(oldestIdx);
		});
	});

	it("Recency pill reorders triage items by updatedAt desc", async () => {
		mockDocuments([
			makeDoc({
				id: "draft-old",
				status: "proposed",
				updatedAt: "2024-01-01T00:00:00Z",
				title: "Old Draft",
			}),
			makeDoc({
				id: "draft-new",
				status: "proposed",
				updatedAt: "2024-06-01T00:00:00Z",
				title: "New Draft",
			}),
		]);

		const user = userEvent.setup();
		renderAt();

		const sortBar = screen.getByTestId("document-sort-bar");
		await user.click(within(sortBar).getByRole("button", { name: /recency/i }));

		await waitFor(() => {
			const triageView = screen.getByTestId("document-triage-view");
			const texts = within(triageView)
				.getAllByRole("listitem")
				.map((r) => r.textContent ?? "");
			expect(texts.findIndex((t) => t.includes("New Draft"))).toBeLessThan(
				texts.findIndex((t) => t.includes("Old Draft")),
			);
		});
	});
});

// ---------------------------------------------------------------------------
// Curated tab is a tree, not a flat list
// ---------------------------------------------------------------------------

describe("DocumentList curated tab: a tree, not a flat list", () => {
	beforeEach(() => {
		mockDocuments([
			makeDoc({ id: "k-parent", title: "Pricing", parentKind: null, parentId: null }),
			makeDoc({
				id: "k-child",
				title: "Objection handling",
				parentKind: "document",
				parentId: "k-parent",
				updatedAt: "2024-01-03T00:00:00Z",
			}),
		]);
	});

	it("renders parent then child with a collapse control — no └ dent marker", async () => {
		renderAt();

		await screen.findByText("Pricing");
		expect(screen.queryByText(/└/)).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();
		expect(screen.getByTestId("document-tree-list")).toBeInTheDocument();
	});

	it("collapses a parent so its child leaves the list", async () => {
		const user = userEvent.setup();
		renderAt();

		await screen.findByText("Objection handling");
		await user.click(screen.getByRole("button", { name: "Collapse" }));
		expect(screen.queryByText("Objection handling")).not.toBeInTheDocument();
		expect(screen.getByText("Pricing")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Parent rule: role-carrying bindings never appear in the browsable tree
// ---------------------------------------------------------------------------

describe("DocumentList: role-carrying bindings and skill/rule rows are excluded", () => {
	it.each([
		{
			name: "an agent identity",
			row: {
				id: "ki_af_agent-1",
				title: "Agent One — identity",
				slot: "agent_file",
				parentKind: "agent",
				parentId: "agent-1",
			},
		},
		{
			name: "a subscription prompt",
			row: {
				id: "ki_rp_subscription-1",
				title: "Subscription One — prompt",
				slot: "prompt",
				parentKind: "subscription",
				parentId: "subscription-1",
			},
		},
		{
			name: "a skill",
			row: {
				id: "k-skill",
				title: "write-tests-skill",
				slot: "skill",
				parentKind: "agent",
				parentId: "agent-1",
			},
		},
		{
			name: "a rule",
			row: {
				id: "k-rule",
				title: "no-console-rule",
				slot: "rule",
				parentKind: "agent",
				parentId: "agent-1",
			},
		},
	])("shows an ordinary root item but never $name", async ({ row }) => {
		mockDocuments([
			makeDoc({ id: "k-ordinary", title: "Auth Strategy Decision" }),
			makeDoc(row as Partial<DocumentRow>),
		]);
		renderAt();

		expect(await screen.findByText("Auth Strategy Decision")).toBeInTheDocument();
		expect(screen.queryByText(row.title)).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Triage validate/reject: keyboard actions and the optimistic contract
// ---------------------------------------------------------------------------

describe("DocumentList triage validate/reject", () => {
	function editDocumentResult(row: DocumentRow): {
		ok: true;
		data: { document: DocumentRow; ancestors: []; children: []; siblings: []; scopeName: string };
	} {
		return {
			ok: true,
			data: { document: row, ancestors: [], children: [], siblings: [], scopeName: "" },
		};
	}

	it("pressing v validates the focused item: calls edit_document(active), removes it from triage, and adds it to curated", async () => {
		mockDocuments([
			makeDoc({ id: "k1", status: "proposed", title: "Item to validate" }),
			makeDoc({ id: "k-active", status: "active", title: "Already active" }),
		]);
		mockCall.mockResolvedValue(editDocumentResult(makeDoc({ id: "k1", status: "active" })));

		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});
		const triageView = screen.getByTestId("document-triage-view");
		expect(within(triageView).getByText("Item to validate")).toBeInTheDocument();

		await user.keyboard("j");
		await user.keyboard("v");

		expect(mockCall).toHaveBeenCalledWith("edit_document", {
			id: "k1",
			status: "active",
			version: 1,
		});
		await waitFor(() => {
			expect(within(triageView).queryByText("Item to validate")).not.toBeInTheDocument();
		});

		await user.click(screen.getByRole("tab", { name: /curated/i }));
		const curatedView = await screen.findByTestId("document-curated-view");
		expect(within(curatedView).getByText("Item to validate")).toBeInTheDocument();
	});

	it("pressing x rejects the focused item: calls edit_document(archived), and it never reaches curated", async () => {
		mockDocuments([makeDoc({ id: "k1", status: "proposed", title: "Item to reject" })]);
		mockCall.mockResolvedValue(editDocumentResult(makeDoc({ id: "k1", status: "archived" })));

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

		await user.click(screen.getByRole("tab", { name: /curated/i }));
		const curatedView = await screen.findByTestId("document-curated-view");
		expect(within(curatedView).queryByText("Item to reject")).not.toBeInTheDocument();
	});

	it("pressing v does nothing when no item is focused", async () => {
		mockDocuments([makeDoc({ id: "k1", status: "proposed", title: "Unfocused item" })]);
		const user = userEvent.setup();
		renderAt();

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /triage/i })).toHaveAttribute("aria-selected", "true");
		});
		await user.keyboard("v");
		expect(mockCall).not.toHaveBeenCalled();
	});

	it("a refused edit_document shows the problem's message and reverts the optimistic removal", async () => {
		mockDocuments([makeDoc({ id: "k1", status: "proposed", title: "Item that will be refused" })]);
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
		await waitFor(() => {
			const triageView = screen.getByTestId("document-triage-view");
			expect(within(triageView).getByText("Item that will be refused")).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// Auto-advance: after validation, the next item is immediately usable
// ---------------------------------------------------------------------------

describe("DocumentList triage auto-advance", () => {
	beforeEach(() => {
		mockCall.mockResolvedValue({
			ok: true,
			data: {
				document: makeDoc({ id: "k1", status: "active" }),
				ancestors: [],
				children: [],
				siblings: [],
				scopeName: "",
			},
		});
	});

	it("second item becomes focused after validating the first", async () => {
		mockDocuments([
			makeDoc({ id: "k1", status: "proposed", title: "First item" }),
			makeDoc({ id: "k2", status: "proposed", title: "Second item" }),
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
			expect(rows[0]?.textContent).toContain("Second item");
		});
	});

	it("shows the triage empty state after the last item is processed", async () => {
		mockDocuments([makeDoc({ id: "k1", status: "proposed", title: "Last item" })]);
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

// ---------------------------------------------------------------------------
// The Memories filter chip
// ---------------------------------------------------------------------------

describe("DocumentList — the Memories filter chip", () => {
	// A non-empty result — an empty result renders the top-level "library is
	// empty" EmptyState instead of the body that carries the Memories chip.
	beforeEach(() => mockDocuments([makeDoc({ id: "k1", title: "A document" })]));

	it("calls useDocuments with {inTree:true} by default", async () => {
		renderAt();
		await screen.findByTestId("document-list-page");
		expect(mockUseDocuments).toHaveBeenLastCalledWith({ inTree: true });
	});

	it('clicking the Memories chip switches the filter to {as:"memory"}, and back on a second click', async () => {
		const user = userEvent.setup();
		renderAt();
		const chip = await screen.findByTestId("memories-filter-chip");

		await user.click(chip);
		expect(mockUseDocuments).toHaveBeenLastCalledWith({ as: "memory" });

		await user.click(chip);
		expect(mockUseDocuments).toHaveBeenLastCalledWith({ inTree: true });
	});
});

// ---------------------------------------------------------------------------
// 500 error handling
// ---------------------------------------------------------------------------

describe("DocumentList — 500 error handling", () => {
	beforeEach(() => mockDocuments([]));

	it("curated tab shows ErrorState (not the confident-empty copy) with a working retry button", async () => {
		const retry = vi.fn();
		mockUseDocuments.mockReturnValue({ documents: [], status: "error", error: "HTTP 500", retry });
		renderAt();

		expect(screen.queryByText("No documents yet")).not.toBeInTheDocument();
		expect(screen.queryByText("Your document library is empty")).not.toBeInTheDocument();
		expect(screen.getByText(/couldn't load documents/i)).toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: /retry/i }));
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it("triage tab also surfaces ErrorState with retry on a search error", async () => {
		const retry = vi.fn();
		mockUseDocuments.mockReturnValue({
			documents: [makeDoc({ id: "k1", status: "proposed", title: "Draft" })],
			status: "error",
			error: "HTTP 503",
			retry,
		});
		renderAt();

		await userEvent.click(screen.getByRole("tab", { name: /triage/i }));
		expect(screen.getByText(/couldn't load documents/i)).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: /retry/i }));
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it("shows neither the empty nor the error copy while loading", () => {
		mockUseDocuments.mockReturnValue({
			documents: [],
			status: "loading",
			error: null,
			retry: vi.fn(),
		});
		renderAt();
		expect(screen.queryByText("No documents yet")).not.toBeInTheDocument();
		expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Websocket nudge re-runs the search
// ---------------------------------------------------------------------------

describe("DocumentList — websocket nudge re-runs the search", () => {
	// This test needs the real useDocuments hook (not the mock the rest of this
	// file uses) — it is the hook itself that subscribes to the `documents`
	// topic and re-issues the search on a nudge frame.
	beforeEach(async () => {
		const actual = await vi.importActual<typeof import("../hooks/useDocuments.js")>(
			"../hooks/useDocuments.js",
		);
		mockUseDocuments.mockImplementation(actual.useDocuments);
		mockCall.mockResolvedValue({ ok: true, data: [] });
	});

	it("re-runs search_documents when the documents topic receives an update frame", async () => {
		const captured: { handler: ((data: unknown) => void) | null } = { handler: null };
		subscribeMock.mockImplementation((_topic: string, handler: (data: unknown) => void) => {
			captured.handler = handler;
			return unsubscribeMock;
		});

		renderAt();
		await screen.findByTestId("document-list-page");
		await waitFor(() =>
			expect(subscribeMock).toHaveBeenCalledWith("documents", expect.any(Function)),
		);

		const callCountBefore = mockCall.mock.calls.length;
		captured.handler?.({ type: "update", topic: "documents" });

		await waitFor(() => expect(mockCall.mock.calls.length).toBeGreaterThan(callCountBefore));
	});
});

// ---------------------------------------------------------------------------
// Prop-driven loading/error states (distinct from the useDocuments-driven ones above)
// ---------------------------------------------------------------------------

describe("DocumentList — explicit loading/error props", () => {
	beforeEach(() => mockDocuments([]));

	function renderWithProps(
		props: Parameters<typeof DocumentList>[0] = {},
	): ReturnType<typeof render> {
		return render(
			<MemoryRouter initialEntries={["/documents"]}>
				<Routes>
					<Route path="/documents" element={<DocumentList {...props} />} />
				</Routes>
			</MemoryRouter>,
		);
	}

	it("renders the skeleton list when `loading` prop is true", () => {
		renderWithProps({ loading: true });
		expect(screen.getByRole("status", { name: /loading documents/i })).toBeInTheDocument();
		expect(screen.queryByText("Document Library")).not.toBeInTheDocument();
	});

	it("renders the error state with a retry button when the `error` prop is set", async () => {
		const onRetry = vi.fn();
		renderWithProps({ error: { message: "Network offline", onRetry } });
		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText(/couldn't load documents/i)).toBeInTheDocument();
		expect(screen.getByText(/network offline/i)).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: /retry/i }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
