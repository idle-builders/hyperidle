/**
 * T5 — Block Discussion Completion: block-scoped thread filter tests (red phase).
 *
 * AC coverage:
 *  - AC-5: Thread rendering can filter to show only messages for a specific block.
 *
 * Specifically:
 *  - When `filterBlockId` prop is set, only messages matching that blockId are shown.
 *  - A "Show all messages" toggle is present when filtering is active.
 *  - Clicking "Show all" shows all messages regardless of blockId.
 *
 * These tests FAIL until the implementation adds the `filterBlockId` prop to
 * `HostThreadSection` in shell/HostThreadSection.tsx.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostThreadSection } from "../../shell/HostThreadSection";

// Mock useHostThread to control state in tests
vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: vi.fn(),
}));

import { useHostThread } from "../../hooks/useHostThread";

const THREAD_FIXTURE = {
	id: "t-filter-001",
	hostKind: "knowledge_item" as const,
	hostId: "k-filter-001",
	initiatorId: "u-founder",
	participants: ["u-founder", "agent-unassigned"],
	pinned: false,
	resolvedAt: null,
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
		payload: { text: "Block A message 1", blockId: "block-filter-A" },
		clientKey: "ck-A1",
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
		payload: { text: "Block A message 2", blockId: "block-filter-A" },
		clientKey: "ck-A2",
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
		payload: { text: "Block B message 1", blockId: "block-filter-B" },
		clientKey: "ck-B1",
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
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-05-31T09:05:00Z",
	},
];

// ── AC-5: filterBlockId prop filters displayed messages ──

describe("AC-5 — filterBlockId prop shows only matching messages", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("shows only block-A messages when filterBlockId='block-filter-A'", () => {
		vi.mocked(useHostThread).mockReturnValue({
			data: { thread: THREAD_FIXTURE, messages: MESSAGES_FIXTURE, identities: {} },
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(
			<HostThreadSection
				hostKind="knowledge_item"
				hostId="k-filter-001"
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
		vi.mocked(useHostThread).mockReturnValue({
			data: { thread: THREAD_FIXTURE, messages: MESSAGES_FIXTURE, identities: {} },
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(
			<HostThreadSection
				hostKind="knowledge_item"
				hostId="k-filter-001"
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
		vi.mocked(useHostThread).mockReturnValue({
			data: { thread: THREAD_FIXTURE, messages: MESSAGES_FIXTURE, identities: {} },
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(
			<HostThreadSection hostKind="knowledge_item" hostId="k-filter-001" title="Discussion" />,
		);

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
		vi.mocked(useHostThread).mockReturnValue({
			data: { thread: THREAD_FIXTURE, messages: MESSAGES_FIXTURE, identities: {} },
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(
			<HostThreadSection
				hostKind="knowledge_item"
				hostId="k-filter-001"
				title="Discussion"
				filterBlockId="block-filter-A"
			/>,
		);

		// A "Show all" affordance must be present when filtering is active
		expect(screen.getByRole("button", { name: /show all messages/i })).toBeInTheDocument();
	});

	it("does NOT render a 'Show all messages' toggle when filterBlockId is not set", () => {
		vi.mocked(useHostThread).mockReturnValue({
			data: { thread: THREAD_FIXTURE, messages: MESSAGES_FIXTURE, identities: {} },
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(
			<HostThreadSection hostKind="knowledge_item" hostId="k-filter-001" title="Discussion" />,
		);

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
		vi.mocked(useHostThread).mockReturnValue({
			data: { thread: THREAD_FIXTURE, messages: MESSAGES_FIXTURE, identities: {} },
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(
			<HostThreadSection
				hostKind="knowledge_item"
				hostId="k-filter-001"
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
		vi.mocked(useHostThread).mockReturnValue({
			data: { thread: THREAD_FIXTURE, messages: MESSAGES_FIXTURE, identities: {} },
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(
			<HostThreadSection
				hostKind="knowledge_item"
				hostId="k-filter-001"
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
		vi.mocked(useHostThread).mockReturnValue({
			data: { thread: THREAD_FIXTURE, messages: MESSAGES_FIXTURE, identities: {} },
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		const { rerender } = render(
			<HostThreadSection
				hostKind="knowledge_item"
				hostId="k-filter-001"
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
				hostKind="knowledge_item"
				hostId="k-filter-001"
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
