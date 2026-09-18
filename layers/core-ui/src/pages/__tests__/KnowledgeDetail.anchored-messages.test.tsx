/**
 * L18 — KnowledgeDetail anchored messages tests.
 *
 * AC coverage:
 *  - block-anchored messages render inline after the block payload in the knowledge body
 *  - the anchored view updates once a first post creates the thread (BC3 review)
 *
 * @lore BC3 review: the page no longer resolves its own thread —
 * `HostThreadSection` is the single fetcher and reports the loaded
 * `ThreadView` upward via `onThreadView`. This test drives that callback
 * from the mock instead of mocking `useThreads`/`useThread` at the page
 * level (see `KnowledgeDetail.thread-fetch.test.tsx` for the fetch-count
 * assertion).
 */

import type { PlainPayload, ThreadView } from "@hyperidle/domain-model";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../../pages/KnowledgeDetail";

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

/**
 * Stands in for the real HostThreadSection: reports `null` first (no thread
 * yet), exactly like a knowledge item with no discussion, then — on request —
 * the loaded view, exactly like the reload that follows create-on-first-post
 * (architecture.md §5 B9, `HostThreadSection.create.test.tsx`).
 */
vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: ({ onThreadView }: { onThreadView?: (view: ThreadView | null) => void }) => {
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
	},
}));

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
