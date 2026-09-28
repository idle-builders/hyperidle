/**
 * `ThreadShell` composition tests.
 *
 * Approved-design: §2.6 + §4 (states). The shell mounts:
 *   - ThreadHostBanner (always)
 *   - The promoted rich message as a card (iff promotedRichMessageId returns one)
 *   - CommentStream (always; full width when no head)
 *   - Composer (always; pinned at floor)
 */

import type { AgentSessionStateSnapshot, Message, Thread } from "@hyperidle/domain-model";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { computeSenderGrouping, ThreadShell } from "../ds";

const baseThread: Thread = {
	id: "t-1",
	hostKind: "team",
	hostId: "task-1",
	initiatorId: "u-founder",
	members: ["u-founder", "agent-1"],
	title: null,
	computedTitle: "task-1",
	pinned: false,
	resolvedAt: null,
	deletedAt: null,
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
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "review",
	payload: {
		title: "Review me",
		reasoning: ["one"],
		producedItemId: "art-1",
	},
};

const plainMessage: Message = {
	id: "m-p",
	threadId: "t-1",
	senderId: "u-founder",
	clientKey: "k-p",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:01:00.000Z",
	type: "plain",
	payload: { text: "hi" },
};

describe("ThreadShell", () => {
	it("populated-issue: mounts ThreadHostBanner + RichMessageCard + Composer when there is an unresolved review", () => {
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
		// Review title rendered inside the in-stream RichMessageCard
		expect(screen.getByTestId("rich-message-card")).toBeInTheDocument();
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

	// sender-grouping per approved.md §2.4 + §8 hard-rule 3.
	it("sender-grouping: shows the sender header on the FIRST of three same-sender messages within 5 minutes", () => {
		const thread = baseThread;
		const make = (id: string, ts: string): Message => ({
			id,
			threadId: thread.id,
			senderId: "u-founder",
			clientKey: id,
			blockId: null,
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

	// a 6+ minute gap breaks the group → 2 headers.
	it("sender-grouping: a 6-minute gap creates a new group", () => {
		const thread = baseThread;
		const make = (id: string, ts: string): Message => ({
			id,
			threadId: thread.id,
			senderId: "u-founder",
			clientKey: id,
			blockId: null,
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

	// The legacy 'Unresolved review · acting required' link is removed. The
	// card sits in-stream, so there is nothing for the link to scroll to.
	// This inverts the previous fallback test: assert the link is NEVER
	// rendered, even when the most recent message is an unresolved review.
	it("'Unresolved review' link is NOT rendered — the card replaces the sticky bar", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[reviewMessage]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		expect(screen.queryByText(/unresolved review/i)).toBeNull();
	});

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

	// isBlocking wired into the host banner.
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
		// Both the banner AND the in-stream RichMessageCard surface the
		// blocking signal as a "BLOCKED" chip (text + colour, not colour-only).
		// Assert at least one renders; the banner one specifically lives in the
		// host-banner region.
		const chips = screen.getAllByText("BLOCKED");
		expect(chips.length).toBeGreaterThan(0);
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

	// shape-transition region carries aria-live="polite".
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

describe("computeSenderGrouping", () => {
	const make = (id: string, senderId: string, ts: string): Message => ({
		id,
		threadId: "t-1",
		senderId,
		clientKey: id,
		blockId: null,
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

// ---------------------------------------------------------------------------
// Promotion rule: at most one RichMessageCard per thread
// ---------------------------------------------------------------------------

function review(id: string, createdAt: string, resolvedAt: string | null = null): Message {
	return {
		id,
		threadId: "t-1",
		senderId: "agent-1",
		clientKey: id,
		blockId: null,
		deletedAt: null,
		redactedAt: null,
		resolvedAt,
		createdAt,
		type: "review",
		payload: {
			title: `Review ${id}`,
			reasoning: ["short"],
			producedItemId: `art-${id}`,
		},
	};
}

describe("ThreadShell promotion", () => {
	it("mounts at most ONE RichMessageCard for a thread with two unresolved reviews", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[
					review("r-old", "2026-04-19T12:00:00.000Z"),
					review("r-new", "2026-04-19T12:30:00.000Z"),
				]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		expect(screen.queryAllByTestId("rich-message-card").length).toBe(1);
	});

	it("the OLDEST unresolved review is the one promoted to a card", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[
					review("r-old", "2026-04-19T12:00:00.000Z"),
					review("r-new", "2026-04-19T12:30:00.000Z"),
				]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		const card = screen.getByTestId("rich-message-card");
		expect(within(card).getByText("Review r-old")).toBeInTheDocument();
	});

	it("non-promoted unresolved reviews render as a CommentRow, not a second RichMessageCard", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[
					review("r-old", "2026-04-19T12:00:00.000Z"),
					review("r-new", "2026-04-19T12:30:00.000Z"),
				]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		const newRow = screen.getByText("Review r-new").closest("[data-testid='comment-row']");
		expect(newRow).toBeInTheDocument();
	});

	it("does NOT mount the legacy thread-head section — that file is deleted", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[review("r-1", "2026-04-19T12:00:00.000Z")]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		expect(screen.queryByTestId("thread-head")).toBeNull();
	});

	it("does NOT render the legacy 'Unresolved review · acting required' link", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[review("r-1", "2026-04-19T12:00:00.000Z")]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		expect(screen.queryByText(/unresolved review/i)).toBeNull();
	});

	it("renders zero RichMessageCards when no rich messages exist (chat-shape)", () => {
		const plain: Message = {
			id: "p1",
			threadId: "t-1",
			senderId: "u-founder",
			clientKey: "p1",
			blockId: null,
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: "2026-04-19T12:00:00.000Z",
			type: "plain",
			payload: { text: "hi" },
		};
		render(
			<ThreadShell
				thread={baseThread}
				messages={[plain]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		expect(screen.queryAllByTestId("rich-message-card").length).toBe(0);
	});

	it("renders zero RichMessageCards when every rich message is resolved", () => {
		render(
			<ThreadShell
				thread={baseThread}
				messages={[review("r-resolved", "2026-04-19T12:00:00.000Z", "2026-04-19T12:30:00.000Z")]}
				identities={identities}
				onAppendMessage={vi.fn()}
			/>,
		);
		expect(screen.queryAllByTestId("rich-message-card").length).toBe(0);
	});
});
