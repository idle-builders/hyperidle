/**
 * L1a — `CommentRow` stories (stub).
 */

import type { Message } from "@hyperidle/shared";
import { CommentRow } from "./CommentRow.js";

export default {
	title: "CommentRow",
	tier: "3" as const,
	order: ["Plain", "Verdict", "InlineComment", "Redacted"],
};

const sender = { id: "u-founder", name: "Founder", role: "founder" };

const plainMsg: Message = {
	id: "m-p",
	threadId: "t-1",
	senderId: "u-founder",
	clientKey: "k",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "plain",
	payload: { text: "hello world" },
};

const verdictMsg: Message = {
	...plainMsg,
	id: "m-v",
	type: "verdict",
	payload: { decision: "approve", resolvesMessageId: "m-rev" },
};

const redactedMsg: Message = {
	...plainMsg,
	id: "m-r",
	redactedAt: "2026-04-19T13:00:00.000Z",
	type: "plain",
	payload: {
		redacted: true,
		redactedBy: "u-founder",
		redactedAt: "2026-04-19T13:00:00.000Z",
		reason: "PII",
	},
};

export const Plain = (): React.JSX.Element => (
	<CommentRow message={plainMsg} sender={sender} showSenderHeader={true} />
);
export const Verdict = (): React.JSX.Element => (
	<CommentRow message={verdictMsg} sender={sender} showSenderHeader={true} />
);
export const InlineComment = (): React.JSX.Element => (
	<CommentRow
		message={plainMsg}
		sender={sender}
		showSenderHeader={true}
		inlineAnchor="src/foo.ts:42"
	/>
);
export const Redacted = (): React.JSX.Element => (
	<CommentRow message={redactedMsg} sender={sender} showSenderHeader={true} />
);
