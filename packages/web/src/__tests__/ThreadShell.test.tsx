/**
 * L1a — `ThreadShell` composition tests.
 *
 * Approved-design: §2.6 + §4 (states). The shell mounts:
 *   - ThreadHostBanner (always)
 *   - ThreadHead (iff headCollapsePredicate.headMessageId !== null)
 *   - CommentStream (always; full width when no head)
 *   - Composer (always; pinned at floor)
 */

import {
	computeSenderGrouping,
	hasMostRecentUnresolvedReview,
	ThreadShell,
} from "@hyperidle/design-system";
import type { AgentSessionStateSnapshot, Message, Thread } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const baseThread: Thread = {
	id: "t-1",
	hostKind: "task",
	hostId: "task-1",
	initiatorId: "u-founder",
	participants: ["u-founder", "agent-1"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: "2026-04-19T12:00:00.000Z",
	createdAt: "2026-04-19T12:00:00.000Z",
};

const identities = {
	"u-founder": { name: "Founder", role: "founder" },
	"agent-1": { name: "Agent", role: "builder" },
};

const reviewMessage: Message = {
	id: "m-rev",
	threadId: "t-1",
	senderId: "agent-1",
	clientKey: "k-rev",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "review",
	payload: {
		title: "Review me",
		reasoning: ["one"],
		artifactRef: { id: "art-1", kind: "text_diff" },
	},
};

const plainMessage: Message = {
	id: "m-p",
	threadId: "t-1",
	senderId: "u-founder",
	clientKey: "k-p",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:01:00.000Z",
	type: "plain",
	payload: { text: "hi" },
};

describe("ThreadShell (approved.md §2.6 + §4 states)", () => {
	it("populated-issue: mounts ThreadHostBanner + ThreadHead + Composer when there is an unresolved review", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[reviewMessage]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		// ThreadHostBanner host title
		expect(screen.getByText(/task-1/i)).toBeInTheDocument();
		// ThreadHead title
		expect(screen.getByText("Review me")).toBeInTheDocument();
		// Composer placeholder
		expect(screen.getByPlaceholderText(/reply to thread/i)).toBeInTheDocument();
	});

	it("populated-chat: head omitted when only plain messages exist", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[plainMessage]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		expect(screen.queryByText("Review me")).toBeNull();
		expect(screen.getByText("hi")).toBeInTheDocument();
	});

	it("empty: shows EmptyState ('No messages yet · be the first to post') when messages=[] ", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
		expect(screen.getByPlaceholderText(/reply to thread/i)).toBeInTheDocument();
	});

	it("loading: shows skeleton rows", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[]}
				identities={identities}
				onAppendMessage={vi.fn()}
				loading={true}
			/>,
		);
		// skeleton rows are present in the loading state
		const skeletons = screen.queryAllByTestId(/skeleton/i);
		expect(skeletons.length).toBeGreaterThan(0);
	});

	it("error: shows ErrorState 'Failed to load thread' when error is set; composer hidden", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[]}
				identities={identities}
				onAppendMessage={vi.fn()}
				error="Network down"
			/>,
		);
		expect(screen.getByText(/failed to load thread/i)).toBeInTheDocument();
		expect(screen.queryByPlaceholderText(/reply to thread/i)).toBeNull();
	});

	// L1 step9 (Design-C2): sender-grouping per approved.md §2.4 + §8 hard-rule 3.
	it("sender-grouping: shows the sender header on the FIRST of three same-sender messages within 5 minutes", () => {
		const thread = baseThread;
		const make = (id: string, ts: string): Message => ({
			id,
			threadId: thread.id,
			senderId: "u-founder",
			clientKey: id,
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: ts,
			type: "plain",
			payload: { text: id },
		});
		const messages: Message[] = [
			make("g-1", "2026-04-19T12:00:00.000Z"),
			make("g-2", "2026-04-19T12:01:00.000Z"),
			make("g-3", "2026-04-19T12:03:30.000Z"),
		];
		render(
			<ThreadShell
				thread={thread}
				messages={messages}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		// The sender header ("Founder") renders ONCE for the group.
		const founderEls = screen.getAllByText("Founder");
		expect(founderEls.length).toBe(1);
	});

	// L1 step9 (Design-C2): a 6+ minute gap breaks the group → 2 headers.
	it("sender-grouping: a 6-minute gap creates a new group", () => {
		const thread = baseThread;
		const make = (id: string, ts: string): Message => ({
			id,
			threadId: thread.id,
			senderId: "u-founder",
			clientKey: id,
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: ts,
			type: "plain",
			payload: { text: id },
		});
		const messages: Message[] = [
			make("g-1", "2026-04-19T12:00:00.000Z"),
			make("g-2", "2026-04-19T12:06:30.000Z"), // > 5 minutes
		];
		render(
			<ThreadShell
				thread={thread}
				messages={messages}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		expect(screen.getAllByText("Founder").length).toBe(2);
	});

	// L1 step9 (Design-C3): composer fallback link appears when the most recent
	// message is an unresolved review/questionnaire.
	it("composer-fallback: 'Unresolved review' link appears when most recent message is an unresolved review", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[reviewMessage]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		expect(screen.getByText(/unresolved review/i)).toBeInTheDocument();
	});

	// L1 step9 (Design-C3): the link is hidden when there is no unresolved review.
	it("composer-fallback: link hidden on a chat-shape thread (no review)", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[plainMessage]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		expect(screen.queryByText(/unresolved review/i)).toBeNull();
	});

	// L1 step9 (Arch): isBlocking wired into the host banner.
	it("isBlocking: shows BLOCKED chip when an unresolved-review thread has the agent's session active", () => {
		const snapshot: AgentSessionStateSnapshot = {
			pausedOnThreadId: null,
			activeForThreadId: baseThread.id,
		};
		render(
			<ThreadShell
				thread={baseThread}
				messages={[reviewMessage]}
				identities={identities}
				onAppendMessage={vi.fn()}
				agentSessionState={snapshot}
			/>,
		);
		expect(screen.getByText("BLOCKED")).toBeInTheDocument();
	});

	it("isBlocking: no BLOCKED chip when the snapshot does not point at this thread", () => {
		const snapshot: AgentSessionStateSnapshot = {
			pausedOnThreadId: null,
			activeForThreadId: "other-thread-id",
		};
		render(
			<ThreadShell
				thread={baseThread}
				messages={[reviewMessage]}
				identities={identities}
				onAppendMessage={vi.fn()}
				agentSessionState={snapshot}
			/>,
		);
		expect(screen.queryByText("BLOCKED")).toBeNull();
	});

	// L1 step9 (Design-C4): shape-transition region carries aria-live="polite".
	it("a11y: container exposes aria-live='polite' for shape-change announcements", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[reviewMessage]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		const shell = screen.getByTestId("thread-shell");
		expect(shell.getAttribute("aria-live")).toBe("polite");
	});
});

describe("computeSenderGrouping (approved.md §2.4)", () => {
	const make = (id: string, senderId: string, ts: string): Message => ({
		id,
		threadId: "t-1",
		senderId,
		clientKey: id,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: ts,
		type: "plain",
		payload: { text: id },
	});

	it("3 same-sender messages within 5 minutes → 1 header (only the first)", () => {
		const result = computeSenderGrouping([
			make("a", "u1", "2026-04-19T12:00:00.000Z"),
			make("b", "u1", "2026-04-19T12:01:00.000Z"),
			make("c", "u1", "2026-04-19T12:04:30.000Z"),
		]);
		expect(result.map((g) => g.showSenderHeader)).toEqual([true, false, false]);
	});

	it("group split by 6+ minute gap → 2 headers", () => {
		const result = computeSenderGrouping([
			make("a", "u1", "2026-04-19T12:00:00.000Z"),
			make("b", "u1", "2026-04-19T12:06:30.000Z"),
		]);
		expect(result.map((g) => g.showSenderHeader)).toEqual([true, true]);
	});

	it("different senders within the window → each gets its own header", () => {
		const result = computeSenderGrouping([
			make("a", "u1", "2026-04-19T12:00:00.000Z"),
			make("b", "u2", "2026-04-19T12:00:30.000Z"),
		]);
		expect(result.map((g) => g.showSenderHeader)).toEqual([true, true]);
	});
});

describe("hasMostRecentUnresolvedReview (approved.md §2.5)", () => {
	const ts = "2026-04-19T12:00:00.000Z";
	const review = (resolvedAt: string | null): Message => ({
		id: "rev",
		threadId: "t",
		senderId: "u1",
		clientKey: "rev",
		deletedAt: null,
		redactedAt: null,
		resolvedAt,
		createdAt: ts,
		type: "review",
		payload: {
			title: "x",
			reasoning: ["y"],
			artifactRef: { id: "art-1", kind: "text_diff" },
		},
	});
	const plain: Message = {
		id: "p",
		threadId: "t",
		senderId: "u1",
		clientKey: "p",
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: ts,
		type: "plain",
		payload: { text: "hi" },
	};

	it("true when the LAST message is an unresolved review", () => {
		expect(hasMostRecentUnresolvedReview([review(null)])).toBe(true);
	});

	it("false when the LAST message is a resolved review", () => {
		expect(hasMostRecentUnresolvedReview([review("2026-04-19T13:00:00.000Z")])).toBe(false);
	});

	it("false when the LAST message is plain (chat-shape)", () => {
		expect(hasMostRecentUnresolvedReview([review(null), plain])).toBe(false);
	});

	it("false on empty thread", () => {
		expect(hasMostRecentUnresolvedReview([])).toBe(false);
	});
});
