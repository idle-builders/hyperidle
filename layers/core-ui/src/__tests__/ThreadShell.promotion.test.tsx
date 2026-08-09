/**
 * L11 step5 (write-tests) — `ThreadShell` promotion-rule integration
 * (AC-1, AC-6, AC-7, AC-10).
 *
 * Approved.md §2.6 + §3 + §6 (no top header). Plan §5.5 + §6.2.
 * After L11:
 *   - ThreadShell stops mounting the legacy thread head entirely.
 *   - ThreadShell stops mounting the sticky verdict bar.
 *   - The promoted rich message renders as <RichMessageCard>; other
 *     unresolved review/questionnaire messages render as CommentRow with
 *     rich slots filled.
 *   - At most ONE RichMessageCard per thread, deterministic.
 *
 * @lore L11 step5: this file fails before the green phase because (a) the
 * shell mounts the legacy head/verdict bar and (b) RichMessageCard does
 * not exist. Both are addressed by plan T6.
 */

import { ThreadShell } from "@hyperidle/design-system";
import type { Message, Thread } from "@hyperidle/domain-model";
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
	"agent-1": { name: "Aria", role: "builder" },
};

function review(id: string, createdAt: string, resolvedAt: string | null = null): Message {
	return {
		id,
		threadId: "t-1",
		senderId: "agent-1",
		clientKey: id,
		deletedAt: null,
		redactedAt: null,
		resolvedAt,
		createdAt,
		type: "review",
		payload: {
			title: `Review ${id}`,
			reasoning: ["short"],
			artifactRef: { id: `art-${id}`, kind: "text_diff" },
		},
	};
}

describe("ThreadShell promotion (L11 — approved.md §3, plan §5.5)", () => {
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
		expect(card.getAttribute("data-message-id")).toBe("r-old");
	});

	it("non-promoted unresolved reviews render as a CommentRow with data-variant='rich-review'", () => {
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
		const richRows = screen
			.queryAllByTestId("comment-row")
			.filter((el) => el.getAttribute("data-variant") === "rich-review");
		expect(richRows.length).toBe(1);
	});

	it("does NOT mount the legacy thread-head section after L11 (plan §6.3 — file deleted)", () => {
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

	it("does NOT render the legacy 'Unresolved review · acting required' link (plan §6.2)", () => {
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
