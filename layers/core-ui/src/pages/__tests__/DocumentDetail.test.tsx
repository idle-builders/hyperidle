/**
 * DocumentDetail: open/render, the metadata aside, date formatting, the
 * discussion host and block popover/scroll, the ancestry/children/backlinks
 * tree, edit mode with auto-save and the version-clash banner, Move/Change
 * scope/Archive, and Promote to task.
 *
 * @lore BC4: replaces `KnowledgeDetail.*` — see git history for the mapping;
 * the fixture fallback (`LEGACY_DETAILS`/`FALLBACK_DETAIL`) it used to
 * exercise is deleted. With nothing returned the page renders an honest
 * not-found state and none of the old fixture strings.
 */

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantContext } from "../../contexts/AssistantContext.js";
import { DocumentDetail } from "../DocumentDetail";
import {
	makeCallRouter,
	makeDocumentRow,
	makeDocumentView,
	makeThreadRow,
	makeThreadView,
} from "./document-detail-test-helpers.js";

const PARENT_CANDIDATE = makeDocumentRow({ id: "doc-root", title: "Product root" });

const callMock = vi.fn();
vi.mock("../../services/call.js", () => ({
	call: (...args: [string, unknown]) => callMock(...args),
}));

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "u-founder", name: "Founder" } }),
}));

vi.mock("../../hooks/useTeams.js", () => ({
	useTeams: () => ({ data: { teams: [{ id: "team-1", name: "Team One" }] }, loading: false }),
}));

vi.mock("../../hooks/useDocuments.js", () => ({
	useDocuments: () => ({
		status: "ready",
		documents: [PARENT_CANDIDATE],
		error: null,
		retry: vi.fn(),
	}),
}));

// BodyEditor — TipTap requires DOM APIs unavailable in JSDOM. Only the edit-mode
// describes below ever mount it; every other test renders in view mode.
vi.mock("../../ds", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../ds")>();
	return {
		...original,
		BodyEditor: ({
			initialContent,
			onChange,
		}: {
			initialContent: string;
			onChange: (md: string) => void;
		}) => (
			<textarea
				data-testid="body-editor-textarea"
				defaultValue={initialContent}
				onChange={(e) => onChange(e.target.value)}
				aria-label="Body editor"
			/>
		),
	};
});

function renderPage(id: string, hash = ""): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/documents/${id}${hash}`]}>
			<Routes>
				<Route path="/documents/:documentId" element={<DocumentDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

async function openOverflow(user: ReturnType<typeof userEvent.setup>): Promise<void> {
	await user.click(await screen.findByRole("button", { name: /more options/i }));
}

afterEach(() => {
	// Unmount every rendered tree before resetting the mock — a component with
	// a pending async effect (e.g. HostThreadSection's real useThreads) that
	// fires after callMock.mockReset() would call a mock with no
	// implementation, and `call(...).then(...)` on `undefined` throws.
	cleanup();
	callMock.mockReset();
	vi.restoreAllMocks();
});

describe("DocumentDetail — honest empty state", () => {
	it("renders no fixture title and an honest not-found message when the API returns nothing", async () => {
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({
					ok: false,
					problems: [{ code: "not_found", message: "Document doc-missing not found." }],
				}),
			}),
		);

		renderPage("doc-missing");

		await screen.findByText("Document not found");
		expect(screen.queryByText("Unknown Knowledge Item")).not.toBeInTheDocument();
		expect(screen.queryByText("This knowledge item was not found.")).not.toBeInTheDocument();
		expect(screen.queryByText("Architecture Decision: Auth Strategy")).not.toBeInTheDocument();
	});
});

describe("DocumentDetail — usage values in the metadata aside", () => {
	it("shows readCount and sessionUseCount from the row", async () => {
		const row = makeDocumentRow({
			id: "doc-1",
			title: "Runbook",
			body: "Steps to follow.",
			readCount: 7,
			lastReadAt: "2026-01-05T00:00:00.000Z",
			sessionUseCount: 3,
			lastUsedAt: "2026-01-04T00:00:00.000Z",
		});
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-1");

		expect(await screen.findByTestId("document-read-count")).toHaveTextContent("7");
		expect(screen.getByTestId("document-session-use-count")).toHaveTextContent("3");
	});
});

describe("DocumentDetail — discussion mounts with the document host", () => {
	it("passes host={kind:'document', id} to HostThreadSection (proven by the search_threads it fires)", async () => {
		const row = makeDocumentRow({ id: "doc-2", title: "Playbook", body: "Content." });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				search_threads: async () => ({ ok: true, data: [] }),
			}),
		);

		renderPage("doc-2");

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("search_threads", {
				host: { kind: "document", id: "doc-2" },
			});
		});
	});
});

describe("DocumentDetail — date formatting", () => {
	it("renders the absolute date, never the raw ISO string, in the Last edited row", async () => {
		const row = makeDocumentRow({
			id: "doc-3",
			title: "Notes",
			updatedAt: "2026-06-12T14:34:00.000Z",
		});
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-3");

		await screen.findByTestId("document-scope-row");
		expect(screen.queryByText("2026-06-12T14:34:00.000Z")).not.toBeInTheDocument();
		const lastEditedRow = screen.getByText("Last edited").closest("div");
		expect(lastEditedRow?.textContent).toMatch(/2026/);
	});
});

describe("DocumentDetail — Promote to task", () => {
	it("calls edit_task with sourceDocumentId", async () => {
		const row = makeDocumentRow({ id: "doc-4", title: "Idea worth building", body: "Details." });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_task: async () => ({ ok: true, data: { task: { id: "task-1" } } }),
			}),
		);

		const user = userEvent.setup();
		renderPage("doc-4");

		await user.click(await screen.findByRole("button", { name: /more options/i }));
		await user.click(screen.getByRole("menuitem", { name: /promote to task/i }));

		await waitFor(() => {
			const promoteCalls = callMock.mock.calls.filter((c) => c[0] === "edit_task");
			expect(promoteCalls).toHaveLength(1);
			expect(promoteCalls[0]?.[1]).toMatchObject({
				teamId: "team-1",
				title: "Idea worth building",
				sourceDocumentId: "doc-4",
			});
		});
	});
});

// ---------------------------------------------------------------------------
// Archive / Change scope / Move
// ---------------------------------------------------------------------------

describe("DocumentDetail — Archive", () => {
	it("calls edit_document with { id, status: 'archived', version }, navigates away on success, and shows the named error and stays on refusal", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", version: 2 });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({
					ok: true,
					data: makeDocumentView(makeDocumentRow({ ...row, status: "archived" })),
				}),
			}),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await openOverflow(user);
		await user.click(screen.getByRole("menuitem", { name: /^archive$/i }));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_document", {
				id: "doc-1",
				status: "archived",
				version: 2,
			});
		});
		await waitFor(() => {
			expect(screen.queryByTestId("document-detail-page")).not.toBeInTheDocument();
		});
	});

	it("shows the named error and stays on the page when the archive is refused", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", version: 2 });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({
					ok: false,
					problems: [{ code: "not_found", message: "Document doc-1 not found." }],
				}),
			}),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await openOverflow(user);
		await user.click(screen.getByRole("menuitem", { name: /^archive$/i }));

		expect(await screen.findByTestId("archive-error")).toHaveTextContent(
			"Document doc-1 not found.",
		);
		expect(screen.getByTestId("document-detail-page")).toBeInTheDocument();
	});
});

describe("DocumentDetail — Change scope", () => {
	it("calls edit_document with { id, scopeKind, version }", async () => {
		// A private *tree* document is not a memory (architecture.md §3.6) —
		// Private is only choosable with a parent, so this case needs one.
		const row = makeDocumentRow({
			id: "doc-1",
			title: "Runbook",
			scopeKind: "factory",
			parentKind: "document",
			parentId: "doc-root",
			version: 1,
		});
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({
					ok: true,
					data: makeDocumentView(makeDocumentRow({ ...row, scopeKind: "user" })),
				}),
			}),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await user.click(await screen.findByTestId("document-scope-change-trigger"));
		await user.click(screen.getByTestId("scope-pill-change-private"));
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_document", {
				id: "doc-1",
				version: 1,
				scopeKind: "user",
			});
		});
	});
});

describe("DocumentDetail — Move", () => {
	it("calls edit_document with { id, parent, version }", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", version: 1 });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({ ok: true, data: makeDocumentView(row) }),
			}),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await openOverflow(user);
		await user.click(screen.getByRole("menuitem", { name: /^move$/i }));
		await user.click(screen.getByRole("combobox", { name: "Parent" }));
		await user.click(screen.getByRole("option", { name: "Product root" }));
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_document", {
				id: "doc-1",
				version: 1,
				parent: { kind: "document", id: "doc-root" },
			});
		});
	});
});

describe("DocumentDetail — a pure-invariant refusal greys the control", () => {
	it("greys Move for a slotted document, with its own message, but not for an ordinary one", async () => {
		const slotted = makeDocumentRow({ id: "doc-1", title: "House rule", slot: "rule" });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(slotted) }),
			}),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await openOverflow(user);

		const moveItem = screen.getByRole("menuitem", { name: /^move$/i });
		expect(moveItem).toBeDisabled();
		expect(moveItem).toHaveAttribute(
			"title",
			"A skill, rule, identity or prompt stays where it was attached.",
		);
	});

	it("does not grey Move for an ordinary document", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Notes", slot: "ordinary" });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await openOverflow(user);

		expect(screen.getByRole("menuitem", { name: /^move$/i })).not.toBeDisabled();
	});

	it("hides Move and Change scope entirely for a read-only factory document", async () => {
		const row = makeDocumentRow({
			id: "doc-1",
			title: "Policy",
			scopeKind: "factory",
			updatedBy: "some-agent",
		});
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await openOverflow(user);

		expect(screen.queryByRole("menuitem", { name: /^move$/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("menuitem", { name: /^change scope$/i })).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// The tree: ancestry breadcrumb, Children card, Backlinks card
// ---------------------------------------------------------------------------

describe("DocumentDetail — ancestry breadcrumb", () => {
	it("shows the parent chain root-first, each linking to /documents/:id, or just Knowledge for a top-level document", async () => {
		const root = makeDocumentRow({ id: "doc-product", title: "Product" });
		const mid = makeDocumentRow({ id: "doc-pricing", title: "Pricing", parentId: "doc-product" });
		const row = makeDocumentRow({
			id: "doc-objections",
			title: "Objections playbook",
			parentId: "doc-pricing",
		});
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({
					ok: true,
					data: makeDocumentView(row, { ancestors: [root, mid] }),
				}),
			}),
		);

		renderPage("doc-objections");

		const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
		expect(within(nav).getByRole("link", { name: "Product" })).toHaveAttribute(
			"href",
			"/documents/doc-product",
		);
		expect(within(nav).getByRole("link", { name: "Pricing" })).toHaveAttribute(
			"href",
			"/documents/doc-pricing",
		);
		expect(nav).toHaveTextContent("Objections playbook");
	});

	it("shows just the Knowledge root for a top-level document", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Root document" });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-1");

		const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
		expect(within(nav).getByRole("link", { name: "Knowledge" })).toHaveAttribute(
			"href",
			"/documents",
		);
	});
});

describe("DocumentDetail — Children card", () => {
	it("lists each child's title and links to it, and offers Add child even with no children yet", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Pricing" });
		const child1 = makeDocumentRow({ id: "doc-2", title: "Objections playbook" });
		const child2 = makeDocumentRow({ id: "doc-3", title: "Discount policy" });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({
					ok: true,
					data: makeDocumentView(row, { children: [child1, child2] }),
				}),
			}),
		);

		renderPage("doc-1");

		const card = await screen.findByTestId("document-children-card");
		expect(within(card).getByText("Objections playbook")).toBeInTheDocument();
		expect(within(card).getByText("Discount policy")).toBeInTheDocument();
		expect(within(card).getByRole("link", { name: "Objections playbook" })).toHaveAttribute(
			"href",
			"/documents/doc-2",
		);
	});

	it("offers Add child linking to /documents/new?parentId=<id> with no children yet", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Pricing" });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-1");

		const card = await screen.findByTestId("document-children-card");
		expect(within(card).getByTestId("document-add-child")).toHaveAttribute(
			"href",
			"/documents/new?parentId=doc-1",
		);
		expect(within(card).getByText(/No nested documents yet/)).toBeInTheDocument();
	});
});

describe("DocumentDetail — Backlinks card", () => {
	it("lists siblings by title, or an honest empty state when there are none", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Pricing" });
		const sibling = makeDocumentRow({ id: "doc-4", title: "API Rate Limiting Best Practices" });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({
					ok: true,
					data: makeDocumentView(row, { siblings: [sibling] }),
				}),
			}),
		);

		renderPage("doc-1");

		const card = await screen.findByTestId("document-backlinks-card");
		expect(within(card).getByText("API Rate Limiting Best Practices")).toBeInTheDocument();
	});

	it("shows an honest empty state when there are no siblings", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Pricing" });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-1");

		const card = await screen.findByTestId("document-backlinks-card");
		expect(within(card).getByText(/No backlinks/i)).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Edit mode: open, auto-save through edit_document, the version-clash
// banner, and the factory read-only gate
// ---------------------------------------------------------------------------

describe("DocumentDetail — open", () => {
	it("calls open_document({ id })", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: "Steps." });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-1");

		await screen.findByRole("heading", { name: "Runbook" });
		expect(callMock).toHaveBeenCalledWith("open_document", { id: "doc-1" });
	});
});

describe("DocumentDetail — auto-save through edit_document", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("calls edit_document with { id, body, version } and shows Saving then Saved", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: "Steps.", version: 4 });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({
					ok: true,
					data: makeDocumentView(makeDocumentRow({ ...row, version: 5 })),
				}),
			}),
		);

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderPage("doc-1");

		await user.click(await screen.findByRole("button", { name: /^edit$/i }));
		const textarea = screen.getByTestId("body-editor-textarea");
		await user.clear(textarea);
		await user.type(textarea, "New content");
		await vi.advanceTimersByTimeAsync(1600);

		await waitFor(() => {
			const editCalls = callMock.mock.calls.filter((c) => c[0] === "edit_document");
			expect(editCalls.length).toBeGreaterThan(0);
			expect(editCalls[0]?.[1]).toEqual({ id: "doc-1", body: "New content", version: 4 });
		});
		await waitFor(() => {
			expect(screen.getByTestId("save-indicator")).toHaveTextContent("Saved");
		});
	});

	it("shows the exact 'stale' message and does not overwrite the editor text on a version clash", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: "Original.", version: 1 });
		const staleMessage = "The document changed since you read it — open it again and retry.";
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				edit_document: async () => ({
					ok: false,
					problems: [{ code: "stale", message: staleMessage }],
				}),
			}),
		);

		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		renderPage("doc-1");
		await user.click(await screen.findByRole("button", { name: /^edit$/i }));
		const textarea = screen.getByTestId("body-editor-textarea");
		await user.type(textarea, " edited");
		await vi.advanceTimersByTimeAsync(1600);

		const banner = await screen.findByTestId("conflict-banner");
		expect(banner).toHaveTextContent(staleMessage);
		// The editor's own draft is untouched — only a Reload can discard it.
		expect(screen.getByTestId("body-editor-textarea")).toHaveValue("Original. edited");
	});
});

describe("DocumentDetail — factory read-only gate", () => {
	it("shows Edit only for a factory item the viewer themselves authored", async () => {
		const theirs = makeDocumentRow({
			id: "doc-factory",
			title: "Policy",
			body: "Rules.",
			scopeKind: "factory",
			updatedBy: "some-agent",
		});
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(theirs) }) }),
		);
		renderPage("doc-factory");
		await screen.findByRole("heading", { name: "Policy" });
		expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();

		const mine = makeDocumentRow({
			id: "doc-factory-mine",
			title: "My policy",
			body: "Rules.",
			scopeKind: "factory",
			updatedBy: "u-founder",
		});
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(mine) }) }),
		);
		renderPage("doc-factory-mine");
		expect(await screen.findByRole("button", { name: /^edit$/i })).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Discussion surface: block popover, block-anchored scroll, thread mount
// ---------------------------------------------------------------------------

const MULTI_PARA_BODY =
	"First paragraph with enough words to derive its own block.\n\n" +
	"Second paragraph, entirely distinct from the first one above.";

describe("DocumentDetail — the block popover", () => {
	it("Space on a block's gutter opens the actions popover with Discuss; Escape closes it", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: MULTI_PARA_BODY });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await screen.findByText(/First paragraph/);

		const firstBlock = document.querySelector("[data-ds-component='block']") as HTMLElement;
		expect(firstBlock).not.toBeNull();
		firstBlock.focus();
		await user.keyboard(" ");

		expect(screen.getByTestId("block-actions-popover")).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: /discuss/i })).toBeInTheDocument();

		await user.keyboard("{Escape}");
		expect(screen.queryByTestId("block-actions-popover")).not.toBeInTheDocument();
	});

	it("selecting Discuss opens the prefill chip on the composer", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: MULTI_PARA_BODY });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				search_threads: async () => ({ ok: true, data: [] }),
			}),
		);

		const user = userEvent.setup();
		renderPage("doc-1");
		await screen.findByText(/First paragraph/);

		const firstBlock = document.querySelector("[data-ds-component='block']") as HTMLElement;
		firstBlock.focus();
		await user.keyboard(" ");
		await user.click(screen.getByRole("menuitem", { name: /discuss/i }));

		expect(await screen.findByTestId("host-thread-prefill-chip")).toBeInTheDocument();
	});

	it("Share attaches the block's content when the assistant overlay is open", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: MULTI_PARA_BODY });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				search_threads: async () => ({ ok: true, data: [] }),
			}),
		);

		const attachContext = vi.fn();
		const user = userEvent.setup();
		render(
			<MemoryRouter initialEntries={["/documents/doc-1"]}>
				<AssistantContext.Provider value={{ overlayOpen: true, attachContext }}>
					<Routes>
						<Route path="/documents/:documentId" element={<DocumentDetail />} />
					</Routes>
				</AssistantContext.Provider>
			</MemoryRouter>,
		);
		await screen.findByText(/First paragraph/);

		const firstBlock = document.querySelector("[data-ds-component='block']") as HTMLElement;
		firstBlock.focus();
		await user.keyboard(" ");
		await user.click(screen.getByRole("menuitem", { name: /share/i }));

		expect(attachContext).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "pending_block", content: expect.stringContaining("First") }),
		);
	});
});

describe("DocumentDetail — block-anchored scroll", () => {
	afterEach(() => cleanup());

	it("no hash: scrollIntoView never fires", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: MULTI_PARA_BODY });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-1", "");
		await screen.findByText(/First paragraph/);

		const scrolled: string[] = [];
		for (const el of document.querySelectorAll("[data-block-id]")) {
			Object.defineProperty(el, "scrollIntoView", {
				configurable: true,
				value: vi.fn(() => scrolled.push(el.getAttribute("data-block-id") ?? "")),
			});
		}
		await act(async () => {
			// flush any pending effects — the scroll effect schedules via requestAnimationFrame
		});
		expect(scrolled).toHaveLength(0);
	});

	it("hash #block-<id> scrolls the SPECIFIC block, not the other one", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: MULTI_PARA_BODY });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		renderPage("doc-1", "");
		await screen.findByText(/First paragraph/);
		const [, secondId] = Array.from(document.querySelectorAll("[data-block-id]")).map(
			(el) => el.getAttribute("data-block-id") ?? "",
		);
		expect(secondId).toBeTruthy();
		cleanup();

		renderPage("doc-1", `#block-${encodeURIComponent(secondId as string)}`);
		await screen.findByText(/First paragraph/);

		const scrolledIds: string[] = [];
		for (const el of document.querySelectorAll("[data-block-id]")) {
			Object.defineProperty(el, "scrollIntoView", {
				configurable: true,
				value: vi.fn(() => scrolledIds.push(el.getAttribute("data-block-id") ?? "")),
			});
		}
		await waitFor(() => {
			expect(scrolledIds).toEqual([secondId]);
		});
	});
});

describe("DocumentDetail — thread mount and messages", () => {
	it("issues exactly one search_threads and one open_thread for an existing thread", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: "Body." });
		const threadRow = makeThreadRow({ id: "t-1", hostId: "doc-1" });
		callMock.mockImplementation(
			makeCallRouter({
				open_document: async () => ({ ok: true, data: makeDocumentView(row) }),
				search_threads: async () => ({ ok: true, data: [threadRow] }),
				open_thread: async () => ({
					ok: true,
					data: makeThreadView({
						messages: [
							{
								id: "m-1",
								threadId: "t-1",
								senderId: "u-founder",
								type: "plain" as const,
								payload: { text: "Hello there" },
								clientKey: "ck-1",
								blockId: null,
								deletedAt: null,
								redactedAt: null,
								resolvedAt: null,
								createdAt: "2026-01-02T09:05:00.000Z",
							},
						],
					}),
				}),
			}),
		);

		renderPage("doc-1");

		await waitFor(() => expect(screen.getByText("Hello there")).toBeInTheDocument());

		const searchCalls = callMock.mock.calls.filter((c) => c[0] === "search_threads");
		const openCalls = callMock.mock.calls.filter((c) => c[0] === "open_thread");
		expect(searchCalls).toHaveLength(1);
		expect(openCalls).toHaveLength(1);
	});
});
