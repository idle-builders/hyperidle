/**
 * L18 — KnowledgeDetail anchored messages tests.
 *
 * AC coverage:
 *  - block-anchored messages render inline after the block payload in the knowledge body
 */

import type { PlainPayload, ThreadListRow, ThreadView } from "@hyperidle/domain-model";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../../pages/KnowledgeDetail";

vi.mock("../../hooks/useThreads.js", () => ({
	useThreads: vi.fn(),
}));

vi.mock("../../hooks/useThread.js", () => ({
	useThread: vi.fn(),
}));

vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

import { useThread } from "../../hooks/useThread.js";
import { useThreads } from "../../hooks/useThreads.js";

const THREAD_LIST_ROW: ThreadListRow = {
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
	hasUnresolvedReview: false,
	lastMessagePreview: null,
};

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

describe("KnowledgeDetail anchored messages (L18)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("block-anchored messages render inline after the block payload", () => {
		vi.mocked(useThreads).mockReturnValue({
			status: "ready",
			threads: [THREAD_LIST_ROW],
			error: null,
			retry: vi.fn(),
		});
		vi.mocked(useThread).mockReturnValue({
			status: "ready",
			data: makeThreadView(),
			error: null,
			refresh: vi.fn(),
		});

		render(
			<MemoryRouter initialEntries={["/knowledge/k1"]}>
				<Routes>
					<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByTestId("anchored-messages")).toBeInTheDocument();
		expect(screen.getByText("Knowledge block anchored comment")).toBeInTheDocument();
	});
});
