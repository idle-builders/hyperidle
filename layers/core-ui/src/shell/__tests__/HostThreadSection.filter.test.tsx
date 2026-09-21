/**
 * T5 — Block Discussion Completion: block-scoped thread filter tests.
 *
 * AC coverage:
 *  - AC-5: Thread rendering can filter to show only messages for a specific block.
 *
 * Specifically:
 *  - When `filterBlockId` prop is set, only messages matching that blockId are shown.
 *  - A "Show all messages" toggle is present when filtering is active.
 *  - Clicking "Show all" shows all messages regardless of blockId.
 *
 * @lore BC3: re-pointed off the deleted `useHostThread` onto `useThread` —
 * `HostThreadSection` now takes `threadId`/`host`, and `Message.blockId` is a
 * real top-level column (architecture.md §3.1), not a field inside `payload`.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostThreadSection } from "../../shell/HostThreadSection";

vi.mock("../../hooks/useThread.js", () => ({
	useThread: vi.fn(),
}));
vi.mock("../../hooks/useThreads.js", () => ({
	useThreads: vi.fn(),
}));

import { useThread } from "../../hooks/useThread.js";
import { useThreads } from "../../hooks/useThreads.js";

function mockNoHostSearch(): void {
	vi.mocked(useThreads).mockReturnValue({
		status: "ready",
		threads: [],
		error: null,
		retry: vi.fn(),
	});
}

const THREAD_FIXTURE = {
	id: "t-filter-001",
	hostKind: "document" as const,
	hostId: "k-filter-001",
	initiatorId: "u-founder",
	members: ["u-founder", "agent-unassigned"],
	title: null,
	computedTitle: "Discussion",
	pinned: false,
	resolvedAt: null,
	deletedAt: null,
	lastActiveAt: "2026-05-31T10:00:00Z",
	createdAt: "2026-05-31T09:00:00Z",
};

// 5 messages: 2 for block-A, 1 for block-B, 2 unanchored
const MESSAGES_FIXTURE = [
	{
		id: "msg-A1",
		threadId: "t-filter-001",
		senderId: "u-founder",
		type: "plain" as const,
		payload: { text: "Block A message 1" },
		clientKey: "ck-A1",
		blockId: "block-filter-A",
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-05-31T09:01:00Z",
	},
	{
		id: "msg-A2",
		threadId: "t-filter-001",
		senderId: "u-founder",
		type: "plain" as const,
		payload: { text: "Block A message 2" },
		clientKey: "ck-A2",
		blockId: "block-filter-A",
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-05-31T09:02:00Z",
	},
	{
		id: "msg-B1",
		threadId: "t-filter-001",
		senderId: "u-founder",
		type: "plain" as const,
		payload: { text: "Block B message 1" },
		clientKey: "ck-B1",
		blockId: "block-filter-B",
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-05-31T09:03:00Z",
	},
	{
		id: "msg-U1",
		threadId: "t-filter-001",
		senderId: "u-founder",
		type: "plain" as const,
		payload: { text: "Unanchored message 1" },
		clientKey: "ck-U1",
		blockId: null,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-05-31T09:04:00Z",
	},
	{
		id: "msg-U2",
		threadId: "t-filter-001",
		senderId: "u-founder",
		type: "plain" as const,
		payload: { text: "Unanchored message 2" },
		clientKey: "ck-U2",
		blockId: null,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-05-31T09:05:00Z",
	},
];

function mockReadyThread(): void {
	vi.mocked(useThread).mockReturnValue({
		status: "ready",
		data: {
			thread: THREAD_FIXTURE,
			members: [],
			messages: MESSAGES_FIXTURE,
			headMessageId: null,
			hostTitle: null,
		},
		error: null,
		refresh: vi.fn(),
	});
}

// ── re-review: filterBlockId is a client-side slice, never forwarded to useThread ──

describe("re-review — filterBlockId never reaches useThread/open_thread", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls useThread with only the threadId while filterBlockId is active", () => {
		mockNoHostSearch();
		mockReadyThread();

		render(
			<HostThreadSection
				threadId="t-filter-001"
				title="Discussion"
				filterBlockId="block-filter-A"
			/>,
		);

		// The block filter is HostThreadSection's own concern — forwarding it
		// into useThread would ask the server to filter `open_thread` itself,
		// which would starve every other consumer of this same fetch (e.g.
		// KnowledgeDetail's inline anchored comments) of the blocks it filtered out.
		expect(useThread).toHaveBeenCalledWith("t-filter-001");
	});
});

// ── AC-5: filterBlockId prop filters displayed messages ──

describe("AC-5 — filterBlockId prop shows only matching messages", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("shows only block-A messages when filterBlockId='block-filter-A'", () => {
		mockNoHostSearch();
		mockReadyThread();

		render(
			<HostThreadSection
				threadId="t-filter-001"
				title="Discussion"
				filterBlockId="block-filter-A"
			/>,
		);

		// Block-A messages must be visible
		expect(screen.getByText("Block A message 1")).toBeInTheDocument();
		expect(screen.getByText("Block A message 2")).toBeInTheDocument();

		// Block-B and unanchored messages must NOT be visible
		expect(screen.queryByText("Block B message 1")).not.toBeInTheDocument();
		expect(screen.queryByText("Unanchored message 1")).not.toBeInTheDocument();
		expect(screen.queryByText("Unanchored message 2")).not.toBeInTheDocument();
	});

	it("shows only block-B message when filterBlockId='block-filter-B'", () => {
		mockNoHostSearch();
		mockReadyThread();

		render(
			<HostThreadSection
				threadId="t-filter-001"
				title="Discussion"
				filterBlockId="block-filter-B"
			/>,
		);

		expect(screen.getByText("Block B message 1")).toBeInTheDocument();
		expect(screen.queryByText("Block A message 1")).not.toBeInTheDocument();
		expect(screen.queryByText("Block A message 2")).not.toBeInTheDocument();
		expect(screen.queryByText("Unanchored message 1")).not.toBeInTheDocument();
	});

	it("shows all 5 messages when filterBlockId is not set", () => {
		mockNoHostSearch();
		mockReadyThread();

		render(<HostThreadSection threadId="t-filter-001" title="Discussion" />);

		expect(screen.getByText("Block A message 1")).toBeInTheDocument();
		expect(screen.getByText("Block A message 2")).toBeInTheDocument();
		expect(screen.getByText("Block B message 1")).toBeInTheDocument();
		expect(screen.getByText("Unanchored message 1")).toBeInTheDocument();
		expect(screen.getByText("Unanchored message 2")).toBeInTheDocument();
	});
});

// ── AC-5: "Show all messages" toggle is present when filter is active ──

describe("AC-5 — 'Show all messages' toggle when filter is active", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders a 'Show all messages' toggle when filterBlockId is set", () => {
		mockNoHostSearch();
		mockReadyThread();

		render(
			<HostThreadSection
				threadId="t-filter-001"
				title="Discussion"
				filterBlockId="block-filter-A"
			/>,
		);

		// A "Show all" affordance must be present when filtering is active
		expect(screen.getByRole("button", { name: /show all messages/i })).toBeInTheDocument();
	});

	it("does NOT render a 'Show all messages' toggle when filterBlockId is not set", () => {
		mockNoHostSearch();
		mockReadyThread();

		render(<HostThreadSection threadId="t-filter-001" title="Discussion" />);

		expect(screen.queryByRole("button", { name: /show all messages/i })).not.toBeInTheDocument();
	});
});

// ── AC-5: Clicking "Show all" reveals all messages ──

describe("AC-5 — clicking 'Show all messages' reveals all messages", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("clicking 'Show all messages' shows all 5 messages", async () => {
		const user = userEvent.setup();
		mockNoHostSearch();
		mockReadyThread();

		render(
			<HostThreadSection
				threadId="t-filter-001"
				title="Discussion"
				filterBlockId="block-filter-A"
			/>,
		);

		// Initially filtered: only block-A messages
		expect(screen.getByText("Block A message 1")).toBeInTheDocument();
		expect(screen.queryByText("Block B message 1")).not.toBeInTheDocument();

		// Click "Show all messages"
		const showAllButton = screen.getByRole("button", { name: /show all messages/i });
		await user.click(showAllButton);

		// All messages should now be visible
		expect(screen.getByText("Block A message 1")).toBeInTheDocument();
		expect(screen.getByText("Block A message 2")).toBeInTheDocument();
		expect(screen.getByText("Block B message 1")).toBeInTheDocument();
		expect(screen.getByText("Unanchored message 1")).toBeInTheDocument();
		expect(screen.getByText("Unanchored message 2")).toBeInTheDocument();
	});

	it("after clicking 'Show all', the toggle is no longer visible", async () => {
		const user = userEvent.setup();
		mockNoHostSearch();
		mockReadyThread();

		render(
			<HostThreadSection
				threadId="t-filter-001"
				title="Discussion"
				filterBlockId="block-filter-A"
			/>,
		);

		const showAllButton = screen.getByRole("button", { name: /show all messages/i });
		await user.click(showAllButton);

		// Once "show all" is active, the filter toggle is gone
		expect(screen.queryByRole("button", { name: /show all messages/i })).not.toBeInTheDocument();
	});

	it("resets showAll to false when filterBlockId changes (T5 review finding #5)", async () => {
		// When user clicks Discuss on block-A, showAll resets so the filter
		// immediately applies to block-A's messages instead of remaining expanded.
		const user = userEvent.setup();
		mockNoHostSearch();
		mockReadyThread();

		const { rerender } = render(
			<HostThreadSection
				threadId="t-filter-001"
				title="Discussion"
				filterBlockId="block-filter-A"
			/>,
		);

		// Expand show-all on block-A's filter
		const showAllButton = screen.getByRole("button", { name: /show all messages/i });
		await user.click(showAllButton);

		// All 5 messages visible (filter expanded)
		expect(screen.getByText("Block A message 1")).toBeInTheDocument();
		expect(screen.getByText("Block B message 1")).toBeInTheDocument();

		// Switch to block-B's filter — showAll must reset
		rerender(
			<HostThreadSection
				threadId="t-filter-001"
				title="Discussion"
				filterBlockId="block-filter-B"
			/>,
		);

		// Now only block-B messages should be visible (filter reset)
		expect(screen.getByText("Block B message 1")).toBeInTheDocument();
		expect(screen.queryByText("Block A message 1")).not.toBeInTheDocument();

		// Toggle is visible again (showAll was reset)
		expect(screen.getByRole("button", { name: /show all messages/i })).toBeInTheDocument();
	});
});
