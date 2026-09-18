/**
 * L1a — `CommentRow` rendering tests.
 *
 * Approved-design: §2.4. Plain text, plain text with inline ref,
 * verdict (status chip + decision label), inline-comment, redacted,
 * grouped vs ungrouped variants.
 */

import type { Message } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommentRow } from "../ds";

const sender = {
	id: "u-founder",
	name: "Founder",
	role: "founder",
};

function plain(text: string): Message {
	return {
		id: "m-p",
		threadId: "t-1",
		senderId: "u-founder",
		clientKey: "k",
		blockId: null,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: null,
		createdAt: "2026-04-19T12:00:00.000Z",
		type: "plain",
		payload: { text },
	};
}

const verdictApprove: Message = {
	id: "m-v",
	threadId: "t-1",
	senderId: "u-founder",
	clientKey: "kv",
	blockId: null,
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "verdict",
	payload: {
		decision: "approve",
		resolvesMessageId: "m-rev",
	},
};

const redactedPlain: Message = {
	id: "m-r",
	threadId: "t-1",
	senderId: "u-founder",
	clientKey: "kr",
	blockId: null,
	deletedAt: null,
	redactedAt: "2026-04-19T13:00:00.000Z",
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "plain",
	payload: {
		redacted: true,
		redactedBy: "u-founder",
		redactedAt: "2026-04-19T13:00:00.000Z",
		reason: "PII",
	},
};

describe("CommentRow (approved.md §2.4)", () => {
	it("renders the sender name + body for plain messages", () => {
		render(<CommentRow message={plain("hello world")} sender={sender} showSenderHeader={true} />);
		expect(screen.getByText("Founder")).toBeInTheDocument();
		expect(screen.getByText("hello world")).toBeInTheDocument();
	});

	it("hides the sender header when showSenderHeader=false (sender-grouping)", () => {
		render(<CommentRow message={plain("ping")} sender={sender} showSenderHeader={false} />);
		expect(screen.queryByText("Founder")).toBeNull();
		expect(screen.getByText("ping")).toBeInTheDocument();
	});

	it("renders a StatusChip for verdict messages with the decision label", () => {
		render(<CommentRow message={verdictApprove} sender={sender} showSenderHeader={true} />);
		// approved.md §2.4: StatusChip + decision label
		expect(screen.getByText("APPROVED")).toBeInTheDocument();
	});

	it("renders the inline-comment anchor label when inlineAnchor is provided", () => {
		render(
			<CommentRow
				message={plain("body")}
				sender={sender}
				showSenderHeader={true}
				inlineAnchor="src/foo.ts:42"
			/>,
		);
		expect(screen.getByText(/INLINE COMMENT ON/i)).toBeInTheDocument();
		expect(screen.getByText(/src\/foo\.ts:42/)).toBeInTheDocument();
	});

	it("renders a 'Redacted' label for redacted messages", () => {
		render(<CommentRow message={redactedPlain} sender={sender} showSenderHeader={true} />);
		expect(screen.getByText(/redacted/i)).toBeInTheDocument();
	});
});
