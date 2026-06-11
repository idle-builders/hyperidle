/**
 * L11 step5 (write-tests) — `CommentRow` rich-row variant (AC-7).
 *
 * Approved.md §2.2: when a rich message is NOT promoted to a card (per the
 * promotion rule), it renders as a `CommentRow` with three optional slots
 * filled — `richHeader`, `richBody`, `richActions`. Plan §5.4 + §6.2.
 *
 * @lore L11 step5: failing on the unknown extra props (`richHeader` etc.)
 * until plan T5 extends `CommentRowProps`.
 */

import { CommentRow } from "@hyperidle/design-system";
import type { Message } from "@hyperidle/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const sender = { id: "agent-1", name: "Aria", role: "builder" };

function review(): Message {
	return {
		id: "m-rev-2",
		threadId: "t-1",
		senderId: "agent-1",
		clientKey: "k-rev-2",
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-04-19T12:30:00.000Z",
		type: "review",
		payload: {
			title: "Second review",
			reasoning: ["Renders as a rich row"],
			artifactRef: { id: "art-2", kind: "text_diff" },
		},
	};
}

function questionnaire(): Message {
	return {
		id: "m-q-2",
		threadId: "t-1",
		senderId: "agent-1",
		clientKey: "k-q-2",
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-04-19T12:31:00.000Z",
		type: "questionnaire",
		payload: {
			title: "Second question",
			question: "Confirm rollout?",
			options: ["yes", "no"],
		},
	};
}

describe("CommentRow rich-row variant (approved.md §2.2, AC-7)", () => {
	it("renders the richHeader / richBody / richActions slots when supplied for a review message", () => {
		render(
			<CommentRow
				message={review()}
				sender={sender}
				showSenderHeader={true}
				richHeader={<div data-testid="rh">richHeader-slot</div>}
				richBody={<div data-testid="rb">richBody-slot</div>}
				richActions={<div data-testid="ra">richActions-slot</div>}
			/>,
		);
		expect(screen.getByTestId("rh")).toBeInTheDocument();
		expect(screen.getByTestId("rb")).toBeInTheDocument();
		expect(screen.getByTestId("ra")).toBeInTheDocument();
	});

	it("marks the row with data-variant='rich-review' when slots are filled for a review message", () => {
		render(
			<CommentRow
				message={review()}
				sender={sender}
				showSenderHeader={true}
				richHeader={<div>h</div>}
				richBody={<div>b</div>}
				richActions={<div>a</div>}
			/>,
		);
		const rows = screen.getAllByTestId("comment-row");
		const row = rows[0]!;
		expect(row.getAttribute("data-variant")).toBe("rich-review");
	});

	it("marks the row with data-variant='rich-questionnaire' when slots are filled for a questionnaire", () => {
		render(
			<CommentRow
				message={questionnaire()}
				sender={sender}
				showSenderHeader={true}
				richHeader={<div>h</div>}
				richBody={<div>b</div>}
				richActions={<div>a</div>}
			/>,
		);
		const row = screen.getAllByTestId("comment-row")[0]!;
		expect(row.getAttribute("data-variant")).toBe("rich-questionnaire");
	});

	it("ignores rich slots for plain messages (defensive — slots only apply to review/questionnaire)", () => {
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
			payload: { text: "hello" },
		};
		render(
			<CommentRow
				message={plain}
				sender={{ id: "u-founder", name: "Founder" }}
				showSenderHeader={true}
				richHeader={<div data-testid="rh">should-not-render</div>}
			/>,
		);
		expect(screen.queryByTestId("rh")).toBeNull();
		// Plain text body renders as before.
		const row = screen.getAllByTestId("comment-row")[0]!;
		expect(within(row).getByText("hello")).toBeInTheDocument();
	});

	it("renders the standard row chrome (avatar / sender header) alongside the rich slots", () => {
		render(
			<CommentRow
				message={review()}
				sender={sender}
				showSenderHeader={true}
				richHeader={<div>rh</div>}
				richBody={<div>rb</div>}
				richActions={<div>ra</div>}
			/>,
		);
		// Sender name still rendered — the row chrome is unchanged per §2.2.
		expect(screen.getByText("Aria")).toBeInTheDocument();
	});
});
