/**
 * L18 — KnowledgeDetail anchored messages tests.
 *
 * AC coverage:
 *  - block-anchored messages render inline after the block payload in the knowledge body
 */

import type { PlainPayload } from "@hyperidle/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../../pages/KnowledgeDetail";

vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: vi.fn(),
}));

vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

import { useHostThread } from "../../hooks/useHostThread";

const THREAD_FIXTURE = {
	id: "t-knowledge-anch",
	hostKind: "knowledge_item" as const,
	hostId: "k1",
	initiatorId: "u-founder",
	participants: ["u-founder"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-05-05T10:00:00Z",
	createdAt: "2026-05-05T09:00:00Z",
};

describe("KnowledgeDetail anchored messages (L18)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("block-anchored messages render inline after the block payload", () => {
		vi.mocked(useHostThread).mockReturnValue({
			data: {
				thread: THREAD_FIXTURE,
				messages: [
					{
						id: "msg-k-anch-1",
						threadId: "t-knowledge-anch",
						senderId: "u-founder",
						type: "plain" as const,
						payload: {
							text: "Knowledge block anchored comment",
							blockId: "some-block-id",
						} as PlainPayload & { blockId?: string },
						clientKey: "ck-k-1",
						deletedAt: null,
						redactedAt: null,
						resolvedAt: null,
						createdAt: "2026-05-05T09:05:00Z",
					},
				],
				identities: {},
			},
			error: null,
			isLoading: false,
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
