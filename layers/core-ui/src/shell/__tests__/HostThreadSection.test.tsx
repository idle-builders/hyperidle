/**
 * HostThreadSection: loading/error/empty/populated states, resolving via
 * `threadId` (task page) or `host` (document page, via useThreads),
 * create-on-first-post, the block-scoped message filter, and the reply
 * prefill chip.
 *
 * `useThread`/`useThreads` are mocked with a default that passes through to
 * the real hooks — the create-on-first-post describe needs the real state
 * machine (search_threads finds nothing → post → adjust_thread creates →
 * search_threads retry finds it → useThread mounts for the first time),
 * which only `call` mocked can exercise. Every other describe overrides the
 * hooks directly for its own fixture.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostThreadSection } from "../HostThreadSection.js";

const { useThreadMock, useThreadsMock } = vi.hoisted(() => ({
	useThreadMock: vi.fn(),
	useThreadsMock: vi.fn(),
}));
vi.mock("../../hooks/useThread.js", () => ({ useThread: useThreadMock }));
vi.mock("../../hooks/useThreads.js", () => ({ useThreads: useThreadsMock }));

const callMock = vi.fn();
vi.mock("../../services/call.js", () => ({
	call: (...args: [string, unknown]) => callMock(...args),
}));

beforeEach(async () => {
	const actualThread = await vi.importActual<typeof import("../../hooks/useThread.js")>(
		"../../hooks/useThread.js",
	);
	const actualThreads = await vi.importActual<typeof import("../../hooks/useThreads.js")>(
		"../../hooks/useThreads.js",
	);
	useThreadMock.mockImplementation(actualThread.useThread);
	useThreadsMock.mockImplementation(actualThreads.useThreads);
});

afterEach(() => {
	vi.restoreAllMocks();
});

function mockNoHostSearch(): void {
	useThreadsMock.mockReturnValue({ status: "ready", threads: [], error: null, retry: vi.fn() });
}

const THREAD_FIXTURE = {
	id: "t-host-001",
	hostKind: "team" as const,
	hostId: "team-001",
	initiatorId: "u-founder",
	members: ["u-founder", "agent-unassigned"],
	title: null,
	computedTitle: "Task discussion",
	pinned: false,
	resolvedAt: null,
	deletedAt: null,
	lastActiveAt: "2026-05-05T10:00:00Z",
	createdAt: "2026-05-05T09:00:00Z",
};
const MESSAGES_FIXTURE = [
	{
		id: "msg-001",
		threadId: "t-host-001",
		senderId: "u-founder",
		type: "plain" as const,
		payload: { text: "Hello discussion" },
		clientKey: "ck-001",
		blockId: null,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-05-05T09:01:00Z",
	},
];

describe("HostThreadSection states", () => {
	it("renders loading state with SkeletonList", () => {
		mockNoHostSearch();
		useThreadMock.mockReturnValue({ status: "loading", data: null, error: null, refresh: vi.fn() });

		render(<HostThreadSection threadId="t-host-001" title="Discussion" />);

		expect(screen.getByTestId("host-thread-section-loading")).toBeInTheDocument();
		expect(screen.getByRole("status", { name: /loading discussion/i })).toBeInTheDocument();
	});

	it("renders error state", () => {
		mockNoHostSearch();
		useThreadMock.mockReturnValue({ status: "error", data: null, error: "HTTP 500", refresh: vi.fn() });

		render(<HostThreadSection threadId="t-host-001" title="Discussion" />);

		expect(screen.getByTestId("host-thread-section-error")).toBeInTheDocument();
	});

	it("renders empty state with design copy when no messages exist", () => {
		mockNoHostSearch();
		useThreadMock.mockReturnValue({
			status: "ready",
			data: { thread: THREAD_FIXTURE, members: [], messages: [], headMessageId: null, hostTitle: null },
			error: null,
			refresh: vi.fn(),
		});

		render(<HostThreadSection threadId="t-host-001" title="Discussion" />);

		expect(screen.getByTestId("host-thread-section")).toBeInTheDocument();
		expect(screen.getByTestId("host-thread-section-empty")).toBeInTheDocument();
		expect(screen.getAllByText(/No discussion yet/).length).toBeGreaterThan(0);
		expect(screen.getByText(/Be the first to post in this thread/)).toBeInTheDocument();
	});

	it("renders populated state with messages", () => {
		mockNoHostSearch();
		useThreadMock.mockReturnValue({
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

		render(<HostThreadSection threadId="t-host-001" title="Discussion" />);

		expect(screen.getByTestId("host-thread-section")).toBeInTheDocument();
		expect(screen.getByText("Hello discussion")).toBeInTheDocument();
	});

	it("renders with inline variant (no section header chrome)", () => {
		mockNoHostSearch();
		useThreadMock.mockReturnValue({ status: "ready", data: null, error: null, refresh: vi.fn() });

		render(<HostThreadSection threadId="t-host-001" title="Discussion" inline />);

		expect(screen.queryByRole("heading", { name: "Discussion" })).not.toBeInTheDocument();
		expect(screen.getByTestId("host-thread-section")).toBeInTheDocument();
	});

	it("calls useThread with the given threadId (task page)", () => {
		mockNoHostSearch();
		useThreadMock.mockReturnValue({ status: "ready", data: null, error: null, refresh: vi.fn() });

		render(<HostThreadSection threadId="task-abc-thread" title="Discussion" />);

		expect(useThreadMock).toHaveBeenCalledWith("task-abc-thread");
	});

	it("resolves via useThreads({host}) when only a host is given (document page)", () => {
		useThreadsMock.mockReturnValue({
			status: "ready",
			threads: [{ ...THREAD_FIXTURE, id: "t-resolved", hasUnresolvedReview: false, lastMessagePreview: null }],
			error: null,
			retry: vi.fn(),
		});
		useThreadMock.mockReturnValue({ status: "ready", data: null, error: null, refresh: vi.fn() });

		render(<HostThreadSection host={{ kind: "document", id: "k-123" }} title="Discussion" />);

		expect(useThreadsMock).toHaveBeenCalledWith({ host: { kind: "document", id: "k-123" } });
		expect(useThreadMock).toHaveBeenCalledWith("t-resolved");
	});
});

// ---------------------------------------------------------------------------
// Create-on-first-post: the real hook state machine, `call` mocked
// ---------------------------------------------------------------------------

describe("HostThreadSection — create-on-first-post", () => {
	const HOST = { kind: "document" as const, id: "k-create-001" };

	function makeThreadRow(id: string) {
		return {
			id,
			hostKind: HOST.kind,
			hostId: HOST.id,
			initiatorId: "u-founder",
			members: ["u-founder"],
			title: null,
			computedTitle: "Discussion",
			pinned: false,
			resolvedAt: null,
			deletedAt: null,
			lastActiveAt: "2026-09-18T10:00:00Z",
			createdAt: "2026-09-18T10:00:00Z",
		};
	}

	function makeMessageRow(threadId: string, clientKey: string) {
		return {
			id: "msg-new-1",
			threadId,
			senderId: "u-founder",
			type: "plain" as const,
			payload: { text: "Hello there" },
			clientKey,
			blockId: null,
			resolvedAt: null,
			deletedAt: null,
			redactedAt: null,
			createdAt: "2026-09-18T10:01:00Z",
		};
	}

	beforeEach(() => {
		callMock.mockReset();
	});

	it("renders the section's empty state and the composer, not the skeleton, for a host with no thread", async () => {
		callMock.mockResolvedValue({ ok: true, data: [] });

		render(<HostThreadSection host={HOST} title="Discussion" />);

		await waitFor(() => expect(callMock).toHaveBeenCalledWith("search_threads", { host: HOST }));
		expect(screen.queryByTestId("host-thread-section-loading")).not.toBeInTheDocument();
		expect(screen.getByTestId("host-thread-section-empty")).toBeInTheDocument();
		expect(screen.getByTestId("composer-textarea")).toBeInTheDocument();
	});

	it("calls adjust_thread to create the thread, then send_message into it, in that order, and the message then shows", async () => {
		const user = userEvent.setup();
		const createdRow = makeThreadRow("new-thread-1");
		let searchCallCount = 0;

		callMock.mockImplementation(async (name: string, input: unknown) => {
			if (name === "search_threads") {
				searchCallCount += 1;
				if (searchCallCount === 1) return { ok: true, data: [] };
				return {
					ok: true,
					data: [{ ...createdRow, hasUnresolvedReview: false, lastMessagePreview: "Hello there" }],
				};
			}
			if (name === "adjust_thread") {
				return {
					ok: true,
					data: { thread: createdRow, members: [], messages: [], headMessageId: null, hostTitle: null },
				};
			}
			if (name === "send_message") {
				const { clientKey } = input as { clientKey: string };
				return {
					ok: true,
					data: { message: makeMessageRow("new-thread-1", clientKey), thread: createdRow },
				};
			}
			if (name === "open_thread") {
				return {
					ok: true,
					data: {
						thread: createdRow,
						members: [],
						messages: [makeMessageRow("new-thread-1", "ck-does-not-matter")],
						headMessageId: null,
						hostTitle: null,
					},
				};
			}
			throw new Error(`unexpected call: ${name}`);
		});

		render(<HostThreadSection host={HOST} title="Discussion" />);

		await waitFor(() => expect(screen.getByTestId("host-thread-section-empty")).toBeInTheDocument());

		await user.type(screen.getByTestId("composer-textarea"), "Hello there");
		await user.click(screen.getByRole("button", { name: "Send" }));

		await waitFor(() => expect(screen.getByText("Hello there")).toBeInTheDocument());

		const names = callMock.mock.calls.map((c) => c[0]);
		const adjustIndex = names.indexOf("adjust_thread");
		const sendIndex = names.indexOf("send_message");
		expect(adjustIndex).toBeGreaterThanOrEqual(0);
		expect(sendIndex).toBeGreaterThan(adjustIndex);
	});

	it("shows a refused adjust_thread's reason in the composer's alert, and sends nothing", async () => {
		const user = userEvent.setup();

		callMock.mockImplementation(async (name: string) => {
			if (name === "search_threads") return { ok: true, data: [] };
			if (name === "adjust_thread") {
				return { ok: false, problems: [{ code: "forbidden", message: "Cannot start a thread here." }] };
			}
			throw new Error(`unexpected call: ${name}`);
		});

		render(<HostThreadSection host={HOST} title="Discussion" />);

		await waitFor(() => expect(screen.getByTestId("host-thread-section-empty")).toBeInTheDocument());

		await user.type(screen.getByTestId("composer-textarea"), "Hello there");
		await user.click(screen.getByRole("button", { name: "Send" }));

		await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cannot start a thread here."));
		expect(callMock.mock.calls.some((c) => c[0] === "send_message")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Block-scoped message filter
// ---------------------------------------------------------------------------

describe("HostThreadSection — filterBlockId", () => {
	const FILTER_THREAD_FIXTURE = {
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

	function msg(id: string, text: string, blockId: string | null): Record<string, unknown> {
		return {
			id,
			threadId: "t-filter-001",
			senderId: "u-founder",
			type: "plain" as const,
			payload: { text },
			clientKey: `ck-${id}`,
			blockId,
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: "2026-05-31T09:01:00Z",
		};
	}

	// 2 for block-A, 1 for block-B, 2 unanchored
	const MESSAGES_FIXTURE = [
		msg("msg-A1", "Block A message 1", "block-filter-A"),
		msg("msg-A2", "Block A message 2", "block-filter-A"),
		msg("msg-B1", "Block B message 1", "block-filter-B"),
		msg("msg-U1", "Unanchored message 1", null),
		msg("msg-U2", "Unanchored message 2", null),
	];

	function mockReadyThread(): void {
		mockNoHostSearch();
		useThreadMock.mockReturnValue({
			status: "ready",
			data: {
				thread: FILTER_THREAD_FIXTURE,
				members: [],
				messages: MESSAGES_FIXTURE,
				headMessageId: null,
				hostTitle: null,
			},
			error: null,
			refresh: vi.fn(),
		});
	}

	it("calls useThread with only the threadId — filterBlockId is a client-side slice, never forwarded", () => {
		// Forwarding it into useThread would ask the server to filter
		// open_thread itself, starving every other consumer of this same
		// fetch (e.g. DocumentDetail's inline anchored comments) of the
		// blocks it filtered out.
		mockReadyThread();

		render(<HostThreadSection threadId="t-filter-001" title="Discussion" filterBlockId="block-filter-A" />);

		expect(useThreadMock).toHaveBeenCalledWith("t-filter-001");
	});

	it("shows only the messages matching filterBlockId, or all when it is not set", () => {
		mockReadyThread();
		const { rerender } = render(
			<HostThreadSection threadId="t-filter-001" title="Discussion" filterBlockId="block-filter-A" />,
		);
		expect(screen.getByText("Block A message 1")).toBeInTheDocument();
		expect(screen.getByText("Block A message 2")).toBeInTheDocument();
		expect(screen.queryByText("Block B message 1")).not.toBeInTheDocument();
		expect(screen.queryByText("Unanchored message 1")).not.toBeInTheDocument();

		rerender(<HostThreadSection threadId="t-filter-001" title="Discussion" filterBlockId="block-filter-B" />);
		expect(screen.getByText("Block B message 1")).toBeInTheDocument();
		expect(screen.queryByText("Block A message 1")).not.toBeInTheDocument();

		rerender(<HostThreadSection threadId="t-filter-001" title="Discussion" />);
		expect(screen.getByText("Block A message 1")).toBeInTheDocument();
		expect(screen.getByText("Block B message 1")).toBeInTheDocument();
		expect(screen.getByText("Unanchored message 1")).toBeInTheDocument();
		expect(screen.getByText("Unanchored message 2")).toBeInTheDocument();
	});

	it("shows a 'Show all messages' toggle only when filtering, and clicking it reveals every message", async () => {
		const user = userEvent.setup();
		mockReadyThread();

		const { rerender } = render(<HostThreadSection threadId="t-filter-001" title="Discussion" />);
		expect(screen.queryByRole("button", { name: /show all messages/i })).not.toBeInTheDocument();

		rerender(
			<HostThreadSection threadId="t-filter-001" title="Discussion" filterBlockId="block-filter-A" />,
		);
		const showAllButton = screen.getByRole("button", { name: /show all messages/i });
		await user.click(showAllButton);

		expect(screen.getByText("Block A message 1")).toBeInTheDocument();
		expect(screen.getByText("Block B message 1")).toBeInTheDocument();
		expect(screen.getByText("Unanchored message 1")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /show all messages/i })).not.toBeInTheDocument();
	});

	it("resets showAll to false when filterBlockId changes (review finding #5)", async () => {
		// When the user clicks Discuss on block-A, showAll resets so the
		// filter immediately applies to block-A's messages instead of
		// remaining expanded.
		const user = userEvent.setup();
		mockReadyThread();

		const { rerender } = render(
			<HostThreadSection threadId="t-filter-001" title="Discussion" filterBlockId="block-filter-A" />,
		);
		await user.click(screen.getByRole("button", { name: /show all messages/i }));
		expect(screen.getByText("Block B message 1")).toBeInTheDocument();

		rerender(
			<HostThreadSection threadId="t-filter-001" title="Discussion" filterBlockId="block-filter-B" />,
		);

		expect(screen.getByText("Block B message 1")).toBeInTheDocument();
		expect(screen.queryByText("Block A message 1")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: /show all messages/i })).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Reply prefill chip
// ---------------------------------------------------------------------------

describe("HostThreadSection — reply prefill chip", () => {
	const PREFILL_THREAD_FIXTURE = {
		id: "t-prefill-001",
		hostKind: "team" as const,
		hostId: "team-prefill",
		initiatorId: "u-founder",
		members: ["u-founder", "agent-unassigned"],
		title: null,
		computedTitle: "Discussion",
		pinned: false,
		resolvedAt: null,
		deletedAt: null,
		lastActiveAt: "2026-05-05T10:00:00Z",
		createdAt: "2026-05-05T09:00:00Z",
	};

	beforeEach(() => {
		mockNoHostSearch();
		useThreadMock.mockReturnValue({
			status: "ready",
			data: {
				thread: PREFILL_THREAD_FIXTURE,
				members: [],
				messages: [],
				headMessageId: null,
				hostTitle: null,
			},
			error: null,
			refresh: vi.fn(),
		});
	});

	it("renders the Re: chip with the block excerpt only when prefill is set", () => {
		const { rerender } = render(<HostThreadSection threadId="t-prefill-001" title="Discussion" />);
		expect(screen.queryByTestId("host-thread-prefill-chip")).not.toBeInTheDocument();

		rerender(
			<HostThreadSection
				threadId="t-prefill-001"
				title="Discussion"
				prefill={{ blockId: "block-abc", blockExcerpt: "The auth cache TTL policy" }}
			/>,
		);
		expect(screen.getByTestId("host-thread-prefill-chip")).toBeInTheDocument();
		expect(screen.getByText(/The auth cache TTL policy/)).toBeInTheDocument();
	});

	it("the dismiss button calls onClearPrefill, and is absent without a handler", async () => {
		const user = userEvent.setup();
		const onClearPrefill = vi.fn();

		const { rerender } = render(
			<HostThreadSection
				threadId="t-prefill-001"
				title="Discussion"
				prefill={{ blockId: "block-abc", blockExcerpt: "The auth cache TTL policy" }}
				onClearPrefill={onClearPrefill}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /cancel block reply/i }));
		expect(onClearPrefill).toHaveBeenCalledOnce();

		rerender(
			<HostThreadSection
				threadId="t-prefill-001"
				title="Discussion"
				prefill={{ blockId: "block-abc", blockExcerpt: "The auth cache TTL policy" }}
			/>,
		);
		expect(screen.queryByRole("button", { name: /cancel block reply/i })).not.toBeInTheDocument();
	});
});
