/**
 * DocumentDetail — the discussion surface: the block popover (Discuss/Share),
 * anchored messages, block-anchored scroll, and the thread mount itself.
 *
 * @lore BC4: replaces `KnowledgeDetail.block-popover.test.tsx`,
 * `KnowledgeDetail.share-block.test.tsx`, `KnowledgeDetail.thread.test.tsx`,
 * `KnowledgeDetail.thread-fetch.test.tsx` and `KnowledgeDetail.block-scroll.test.tsx`.
 * `call` is mocked; `HostThreadSection`, `useThreads` and `useThread` run for
 * real, the same pattern the old `thread-fetch` test used, so the
 * `search_threads`/`open_thread` wire is actually exercised.
 */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantContext } from "../../contexts/AssistantContext.js";
import { DocumentDetail } from "../DocumentDetail";
import {
	makeCallRouter,
	makeDocumentRow,
	makeDocumentView,
	makeThreadRow,
	makeThreadView,
} from "./document-detail-test-helpers.js";

const callMock = vi.fn();
vi.mock("../../services/call.js", () => ({
	call: (...args: [string, unknown]) => callMock(...args),
}));

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "u-founder", name: "Founder" } }),
}));

vi.mock("../../hooks/useTeams.js", () => ({
	useTeams: () => ({ data: { teams: [] }, loading: false }),
}));

const MULTI_PARA_BODY =
	"First paragraph with enough words to derive its own block.\n\n" +
	"Second paragraph, entirely distinct from the first one above.";

function renderPage(id = "doc-1", hash = ""): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/documents/${id}${hash}`]}>
			<Routes>
				<Route path="/documents/:documentId" element={<DocumentDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

afterEach(() => {
	cleanup();
	callMock.mockReset();
	vi.restoreAllMocks();
});

describe("DocumentDetail — the block popover", () => {
	it("Space on a block's gutter opens the actions popover with Discuss", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: MULTI_PARA_BODY });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		const user = userEvent.setup();
		renderPage();
		await screen.findByText(/First paragraph/);

		const firstBlock = document.querySelector("[data-ds-component='block']") as HTMLElement;
		expect(firstBlock).not.toBeNull();
		firstBlock.focus();
		await user.keyboard(" ");

		expect(screen.getByTestId("block-actions-popover")).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: /discuss/i })).toBeInTheDocument();
	});

	it("Escape closes the popover", async () => {
		const row = makeDocumentRow({ id: "doc-1", title: "Runbook", body: MULTI_PARA_BODY });
		callMock.mockImplementation(
			makeCallRouter({ open_document: async () => ({ ok: true, data: makeDocumentView(row) }) }),
		);

		const user = userEvent.setup();
		renderPage();
		await screen.findByText(/First paragraph/);

		const firstBlock = document.querySelector("[data-ds-component='block']") as HTMLElement;
		firstBlock.focus();
		await user.keyboard(" ");
		expect(screen.getByTestId("block-actions-popover")).toBeInTheDocument();

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
		renderPage();
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
		const [firstId, secondId] = Array.from(document.querySelectorAll("[data-block-id]")).map(
			(el) => el.getAttribute("data-block-id") ?? "",
		);
		expect(firstId).toBeTruthy();
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

		renderPage();

		await waitFor(() => expect(screen.getByText("Hello there")).toBeInTheDocument());

		const searchCalls = callMock.mock.calls.filter((c) => c[0] === "search_threads");
		const openCalls = callMock.mock.calls.filter((c) => c[0] === "open_thread");
		expect(searchCalls).toHaveLength(1);
		expect(openCalls).toHaveLength(1);
	});
});
