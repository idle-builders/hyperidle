/**
 * L18 — KnowledgeDetail anchored messages tests.
 *
 * AC coverage:
 *  - block-anchored messages render inline after the block payload in the knowledge body
 *  - the anchored view updates once a first post creates the thread
 *  - filtering the discussion to one block does not hide another block's inline
 *    comment (re-review finding — see below)
 *
 * @lore BC3 review: the page no longer resolves its own thread —
 * `HostThreadSection` is the single fetcher and reports the loaded
 * `ThreadView` upward via `onThreadView`. The first test drives that
 * callback from a stub instead of mocking `useThreads`/`useThread` at the
 * page level (see `KnowledgeDetail.thread-fetch.test.tsx` for the
 * fetch-count assertion).
 *
 * @lore re-review: `HostThreadSection` previously called
 * `useThread(activeThreadId, filterBlockId)`, which asked the server for
 * only that block's messages (`open_thread({id, blockId})`). Since
 * `messagesByBlockId` (below) is built from the same `ThreadView` the
 * section reports upward via `onThreadView`, a server-side filter meant
 * every other block's inline comments vanished the moment one block's
 * discussion was opened. The second describe block flips `hostThreadMode`
 * to render the *real* `HostThreadSection` (only `call` is mocked, same
 * pattern as `KnowledgeDetail.thread-fetch.test.tsx`) so it actually
 * exercises that fetch path.
 */

import type { PlainPayload, ThreadListRow, ThreadView } from "@hyperidle/domain-model";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX, useEffect, useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveBlocks } from "../../block/index.js";
import { KnowledgeDetail } from "../../pages/KnowledgeDetail";
import type { HostThreadSectionProps } from "../../shell/HostThreadSection.js";

const { hostThreadMode, callMock } = vi.hoisted(() => ({
	hostThreadMode: { real: false },
	callMock: vi.fn(),
}));

vi.mock("../../services/call.js", () => ({
	call: (...args: [string, unknown]) => callMock(...args),
}));

/**
 * Stands in for the real HostThreadSection: reports `null` first (no thread
 * yet), exactly like a knowledge item with no discussion, then — on request —
 * the loaded view, exactly like the reload that follows create-on-first-post
 * (see `HostThreadSection.create.test.tsx`).
 *
 * `hostThreadMode.real` switches this to the *actual* component for the
 * re-review filter test below — that test needs the real
 * `useThreads`/`useThread` fetch chain to reproduce the bug.
 */
function FirstPostStub({
	onThreadView,
}: {
	onThreadView?: (view: ThreadView | null) => void;
}): JSX.Element {
	const [posted, setPosted] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: report once per `posted` transition, mirroring the real component's data-change effect.
	useEffect(() => {
		onThreadView?.(posted ? makeThreadView() : null);
	}, [posted]);

	return (
		<button type="button" data-testid="simulate-first-post" onClick={() => setPosted(true)}>
			simulate first post
		</button>
	);
}

vi.mock("../../shell/HostThreadSection", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../shell/HostThreadSection")>();
	return {
		HostThreadSection: (props: HostThreadSectionProps): JSX.Element => {
			if (hostThreadMode.real) return <actual.HostThreadSection {...props} />;
			return <FirstPostStub onThreadView={props.onThreadView} />;
		},
	};
});

function makeThreadView(): ThreadView {
	return {
		thread: {
			id: "t-knowledge-anch",
			hostKind: "knowledge_item",
			hostId: "k1",
			initiatorId: "u-founder",
			members: ["u-founder"],
			title: null,
			computedTitle: "Discussion",
			pinned: false,
			resolvedAt: null,
			deletedAt: null,
			lastActiveAt: "2026-05-05T10:00:00Z",
			createdAt: "2026-05-05T09:00:00Z",
		},
		members: [{ id: "u-founder", name: "You", role: "founder", isAgent: false }],
		messages: [
			{
				id: "msg-k-anch-1",
				threadId: "t-knowledge-anch",
				senderId: "u-founder",
				type: "plain" as const,
				payload: {
					text: "Knowledge block anchored comment",
					blockId: "some-block-id",
				} as PlainPayload,
				clientKey: "ck-k-1",
				blockId: "some-block-id",
				deletedAt: null,
				redactedAt: null,
				resolvedAt: null,
				createdAt: "2026-05-05T09:05:00Z",
			},
		],
		headMessageId: null,
		hostTitle: null,
	};
}

function renderKnowledgeDetail(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/knowledge/k1"]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeDetail anchored messages (L18)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		hostThreadMode.real = false;
	});

	it("block-anchored messages render inline after the block payload", async () => {
		const user = userEvent.setup();
		renderKnowledgeDetail();

		// No thread yet — nothing anchored.
		expect(screen.queryByTestId("anchored-messages")).not.toBeInTheDocument();

		await user.click(screen.getByTestId("simulate-first-post"));

		expect(screen.getByTestId("anchored-messages")).toBeInTheDocument();
		expect(screen.getByText("Knowledge block anchored comment")).toBeInTheDocument();
	});
});

// ── re-review: opening one block's discussion must not hide another ──

const K1_BODY =
	"JWT-based authentication with refresh tokens. Access tokens expire in 15 minutes. " +
	"Refresh tokens in 7 days. All tokens stored in httpOnly cookies, never localStorage.";
const K1_BLOCK_ID = deriveBlocks(K1_BODY, { kind: "knowledge_item", id: "k1" }).blocks[0]?.id;

const THREAD_ROW: ThreadListRow = {
	id: "t-k1-anch-filter",
	hostKind: "knowledge_item",
	hostId: "k1",
	initiatorId: "u-founder",
	members: ["u-founder"],
	title: null,
	computedTitle: "Discussion",
	pinned: false,
	resolvedAt: null,
	deletedAt: null,
	lastActiveAt: "2026-09-19T10:00:00Z",
	createdAt: "2026-09-19T09:00:00Z",
	hasUnresolvedReview: false,
	lastMessagePreview: "Block A comment",
};

function threadViewWithMessages(): ThreadView {
	if (K1_BLOCK_ID === undefined) throw new Error("k1 fixture body derived no block");
	return {
		thread: {
			id: THREAD_ROW.id,
			hostKind: "knowledge_item",
			hostId: "k1",
			initiatorId: "u-founder",
			members: ["u-founder"],
			title: null,
			computedTitle: "Discussion",
			pinned: false,
			resolvedAt: null,
			deletedAt: null,
			lastActiveAt: THREAD_ROW.lastActiveAt,
			createdAt: THREAD_ROW.createdAt,
		},
		members: [{ id: "u-founder", name: "You", role: "founder", isAgent: false }],
		messages: [
			{
				id: "msg-block-a",
				threadId: THREAD_ROW.id,
				senderId: "u-founder",
				type: "plain" as const,
				payload: { text: "Block A comment" } as PlainPayload,
				clientKey: "ck-block-a",
				blockId: K1_BLOCK_ID,
				deletedAt: null,
				redactedAt: null,
				resolvedAt: null,
				createdAt: "2026-09-19T09:05:00Z",
			},
			{
				id: "msg-block-b",
				threadId: THREAD_ROW.id,
				senderId: "u-founder",
				type: "plain" as const,
				payload: { text: "Block B comment" } as PlainPayload,
				clientKey: "ck-block-b",
				blockId: "block-b-not-rendered",
				deletedAt: null,
				redactedAt: null,
				resolvedAt: null,
				createdAt: "2026-09-19T09:06:00Z",
			},
		],
		headMessageId: null,
		hostTitle: null,
	};
}

describe("KnowledgeDetail anchored messages — filtering one block keeps the other (re-review)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		callMock.mockReset();
		hostThreadMode.real = false;
	});

	it("opening block A's discussion still shows block B's inline comment", async () => {
		hostThreadMode.real = true;
		const user = userEvent.setup();

		callMock.mockImplementation(async (name: string, input: unknown) => {
			if (name === "search_threads") return { ok: true, data: [THREAD_ROW] };
			if (name === "open_thread") {
				const { blockId } = input as { id: string; blockId?: string };
				const view = threadViewWithMessages();
				if (blockId === undefined) return { ok: true, data: view };
				// A blockId-filtering server would only return that block's messages.
				return {
					ok: true,
					data: { ...view, messages: view.messages.filter((m) => m.blockId === blockId) },
				};
			}
			throw new Error(`unexpected call: ${name}`);
		});

		renderKnowledgeDetail();

		// Scope to the body — the discussion section below also renders these
		// same message texts via CommentRow, which would otherwise multiply-match.
		const body = (): HTMLElement => screen.getByTestId("knowledge-body");

		// Initial unfiltered load: both blocks' comments are anchored inline.
		await waitFor(() => expect(within(body()).getByText("Block A comment")).toBeInTheDocument());
		expect(within(body()).getByText("Block B comment")).toBeInTheDocument();

		// Open block A's own discussion via the block popover's "Discuss" action.
		const firstBlock = document.querySelector("[data-ds-component='block']") as HTMLElement;
		firstBlock.focus();
		await user.keyboard(" ");
		await user.click(screen.getByRole("menuitem", { name: /discuss/i }));

		// Block B's inline comment must still be there — filtering block A's
		// discussion must not wipe out data for the rest of the page.
		await waitFor(() => expect(within(body()).getByText("Block A comment")).toBeInTheDocument());
		expect(within(body()).getByText("Block B comment")).toBeInTheDocument();

		// `useThread` must never forward the block filter to the server — that
		// is HostThreadSection's own client-side concern.
		const openThreadCalls = callMock.mock.calls.filter((c) => c[0] === "open_thread");
		expect(openThreadCalls.length).toBeGreaterThan(0);
		for (const [, input] of openThreadCalls) {
			expect((input as { blockId?: string }).blockId).toBeUndefined();
		}
	});
});
