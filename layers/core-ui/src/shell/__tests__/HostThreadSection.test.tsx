/**
 * L18 — HostThreadSection component tests.
 *
 * AC coverage:
 *  - renders empty / loading / error / populated states
 *  - mounts on each host kind (bet, task, knowledge_item, artifact)
 *  - calls useHostThread with correct hostKind and hostId
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostThreadSection } from "../../shell/HostThreadSection";

// Mock useHostThread to control state in tests
vi.mock("../../hooks/useHostThread", () => ({
	useHostThread: vi.fn(),
}));

import { useHostThread } from "../../hooks/useHostThread";

const THREAD_FIXTURE = {
	id: "t-host-001",
	hostKind: "bet" as const,
	hostId: "bet-001",
	initiatorId: "u-founder",
	participants: ["u-founder", "agent-unassigned"],
	pinned: false,
	resolvedAt: null,
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
		vi.mocked(useHostThread).mockReturnValue({
			data: null,
			error: null,
			isLoading: true,
			refresh: vi.fn(),
		});

		render(<HostThreadSection hostKind="bet" hostId="bet-001" title="Discussion" />);

		expect(screen.getByTestId("host-thread-section-loading")).toBeInTheDocument();
		expect(screen.getByRole("status", { name: /loading discussion/i })).toBeInTheDocument();
	});

	it("renders error state", () => {
		vi.mocked(useHostThread).mockReturnValue({
			data: null,
			error: "HTTP 500",
			isLoading: false,
			refresh: vi.fn(),
		});

		render(<HostThreadSection hostKind="bet" hostId="bet-001" title="Discussion" />);

		expect(screen.getByTestId("host-thread-section-error")).toBeInTheDocument();
	});

	it("renders empty state with design copy when no messages exist", () => {
		vi.mocked(useHostThread).mockReturnValue({
			data: null,
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(<HostThreadSection hostKind="bet" hostId="bet-001" title="Discussion" />);

		expect(screen.getByTestId("host-thread-section")).toBeInTheDocument();
		expect(screen.getByTestId("host-thread-section-empty")).toBeInTheDocument();
		expect(screen.getAllByText(/No discussion yet/).length).toBeGreaterThan(0);
		expect(screen.getByText(/Be the first to post in this thread/)).toBeInTheDocument();
	});

	it("renders populated state with messages", () => {
		vi.mocked(useHostThread).mockReturnValue({
			data: { thread: THREAD_FIXTURE, messages: MESSAGES_FIXTURE, identities: {} },
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(<HostThreadSection hostKind="bet" hostId="bet-001" title="Discussion" />);

		expect(screen.getByTestId("host-thread-section")).toBeInTheDocument();
		expect(screen.getByText("Hello discussion")).toBeInTheDocument();
	});

	it("renders with inline variant (no section wrapper, no header chrome)", () => {
		vi.mocked(useHostThread).mockReturnValue({
			data: null,
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(<HostThreadSection hostKind="task" hostId="task-001" title="Discussion" inline />);

		// When inline, no section header is rendered
		expect(screen.queryByRole("heading", { name: "Discussion" })).not.toBeInTheDocument();
		expect(screen.getByTestId("host-thread-section")).toBeInTheDocument();
	});

	it("calls useHostThread with correct hostKind=bet", () => {
		vi.mocked(useHostThread).mockReturnValue({
			data: null,
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(<HostThreadSection hostKind="bet" hostId="bet-abc" title="Discussion" />);

		expect(useHostThread).toHaveBeenCalledWith("bet", "bet-abc");
	});

	it("calls useHostThread with correct hostKind=knowledge_item", () => {
		vi.mocked(useHostThread).mockReturnValue({
			data: null,
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(<HostThreadSection hostKind="knowledge_item" hostId="k-123" title="Discussion" />);

		expect(useHostThread).toHaveBeenCalledWith("knowledge_item", "k-123");
	});

	it("calls useHostThread with correct hostKind=artifact", () => {
		vi.mocked(useHostThread).mockReturnValue({
			data: null,
			error: null,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(<HostThreadSection hostKind="artifact" hostId="art-456" title="Discussion" />);

		expect(useHostThread).toHaveBeenCalledWith("artifact", "art-456");
	});
});
