/**
 * L18 — HostThreadSection component tests.
 *
 * AC coverage:
 *  - renders empty / loading / error / populated states
 *  - resolves via `threadId` (task page) or `host` (knowledge page, via useThreads)
 *
 * @lore BC3: re-pointed off the deleted `useHostThread` onto `useThread`
 * (`threadId` prop) and `useThreads` (`host` prop) — architecture.md §3.9's
 * "a task's thread is `team`-hosted, known to the caller" and §5 B9's
 * `search_threads({host})` replacement for the knowledge page.
 */

import { render, screen } from "@testing-library/react";
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

describe("HostThreadSection (L18)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders loading state with SkeletonList", () => {
		mockNoHostSearch();
		vi.mocked(useThread).mockReturnValue({
			status: "loading",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		render(<HostThreadSection threadId="t-host-001" title="Discussion" />);

		expect(screen.getByTestId("host-thread-section-loading")).toBeInTheDocument();
		expect(screen.getByRole("status", { name: /loading discussion/i })).toBeInTheDocument();
	});

	it("renders error state", () => {
		mockNoHostSearch();
		vi.mocked(useThread).mockReturnValue({
			status: "error",
			data: null,
			error: "HTTP 500",
			refresh: vi.fn(),
		});

		render(<HostThreadSection threadId="t-host-001" title="Discussion" />);

		expect(screen.getByTestId("host-thread-section-error")).toBeInTheDocument();
	});

	it("renders empty state with design copy when no messages exist", () => {
		mockNoHostSearch();
		vi.mocked(useThread).mockReturnValue({
			status: "ready",
			data: {
				thread: THREAD_FIXTURE,
				members: [],
				messages: [],
				headMessageId: null,
				hostTitle: null,
			},
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

		render(<HostThreadSection threadId="t-host-001" title="Discussion" />);

		expect(screen.getByTestId("host-thread-section")).toBeInTheDocument();
		expect(screen.getByText("Hello discussion")).toBeInTheDocument();
	});

	it("renders with inline variant (no section wrapper, no header chrome)", () => {
		mockNoHostSearch();
		vi.mocked(useThread).mockReturnValue({
			status: "ready",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		render(<HostThreadSection threadId="t-host-001" title="Discussion" inline />);

		// When inline, no section header is rendered
		expect(screen.queryByRole("heading", { name: "Discussion" })).not.toBeInTheDocument();
		expect(screen.getByTestId("host-thread-section")).toBeInTheDocument();
	});

	it("calls useThread with the given threadId (task page)", () => {
		mockNoHostSearch();
		vi.mocked(useThread).mockReturnValue({
			status: "ready",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		render(<HostThreadSection threadId="task-abc-thread" title="Discussion" />);

		expect(useThread).toHaveBeenCalledWith("task-abc-thread", undefined);
	});

	it("resolves via useThreads({host}) when only a host is given (knowledge page)", () => {
		vi.mocked(useThreads).mockReturnValue({
			status: "ready",
			threads: [
				{
					...THREAD_FIXTURE,
					id: "t-resolved",
					hasUnresolvedReview: false,
					lastMessagePreview: null,
				},
			],
			error: null,
			retry: vi.fn(),
		});
		vi.mocked(useThread).mockReturnValue({
			status: "ready",
			data: null,
			error: null,
			refresh: vi.fn(),
		});

		render(<HostThreadSection host={{ kind: "knowledge_item", id: "k-123" }} title="Discussion" />);

		expect(useThreads).toHaveBeenCalledWith({
			host: { kind: "knowledge_item", id: "k-123" },
			mine: false,
		});
		expect(useThread).toHaveBeenCalledWith("t-resolved", undefined);
	});
});
