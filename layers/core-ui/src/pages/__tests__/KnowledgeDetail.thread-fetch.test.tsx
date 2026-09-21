/**
 * @lore `KnowledgeDetail`'s own thread resolution and `HostThreadSection`'s
 * thread resolution must collapse to a single `search_threads`/`open_thread`
 * pair — `HostThreadSection` reports the `ThreadView` it loads upward via
 * `onThreadView` rather than the page resolving the same host's thread a
 * second time for `messagesByBlockId`. This test leaves
 * `useThreads`/`useThread`/`HostThreadSection` real (only `call` is mocked)
 * so the actual fetch chain runs, and counts the wire calls.
 */

import type { ThreadListRow, ThreadView } from "@hyperidle/domain-model";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../KnowledgeDetail";

const callMock = vi.fn();
vi.mock("../../services/call.js", () => ({
	call: (...args: [string, unknown]) => callMock(...args),
}));

vi.mock("../../hooks/useKnowledgeItem.js", () => ({
	useKnowledgeItem: () => ({ data: null, isLoading: false, error: null }),
}));

vi.mock("../../hooks/useAutoSave.js", () => ({
	useAutoSave: () => ({ triggerSave: vi.fn(), status: "idle" }),
}));

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "u-founder", name: "Test Founder" } }),
}));

vi.mock("../../ds", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../ds")>();
	return {
		...actual,
		BodyEditor: () => <div data-testid="body-editor-mock" />,
	};
});

const THREAD_ROW: ThreadListRow = {
	id: "t-k1-thread",
	hostKind: "document",
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
	lastMessagePreview: "Hello there",
};

function makeThreadView(): ThreadView {
	return {
		thread: {
			id: "t-k1-thread",
			hostKind: "document",
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
		},
		members: [{ id: "u-founder", name: "Test Founder", role: "founder", isAgent: false }],
		messages: [
			{
				id: "msg-k1-1",
				threadId: "t-k1-thread",
				senderId: "u-founder",
				type: "plain" as const,
				payload: { text: "Hello there" },
				clientKey: "ck-k1-1",
				blockId: null,
				deletedAt: null,
				redactedAt: null,
				resolvedAt: null,
				createdAt: "2026-09-19T09:05:00Z",
			},
		],
		headMessageId: null,
		hostTitle: null,
	};
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

describe("KnowledgeDetail thread fetch", () => {
	afterEach(() => {
		callMock.mockReset();
		vi.restoreAllMocks();
	});

	it("issues exactly one search_threads and one open_thread for an existing thread", async () => {
		callMock.mockImplementation(async (name: string) => {
			if (name === "search_threads") return { ok: true, data: [THREAD_ROW] };
			if (name === "open_thread") return { ok: true, data: makeThreadView() };
			throw new Error(`unexpected call: ${name}`);
		});

		renderKnowledgeDetail("k1");

		await waitFor(() => expect(screen.getByText("Hello there")).toBeInTheDocument());

		const searchCalls = callMock.mock.calls.filter((c) => c[0] === "search_threads");
		const openCalls = callMock.mock.calls.filter((c) => c[0] === "open_thread");
		expect(searchCalls).toHaveLength(1);
		expect(openCalls).toHaveLength(1);
	});
});
