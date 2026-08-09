/**
 * L1a — `CommentRow` stories (stub).
 */

import type { Message } from "@hyperidle/domain-model";
import { CommentRow } from "./CommentRow.js";

export default {
	title: "CommentRow",
	tier: "3" as const,
	order: ["Plain", "AgentMessage", "Verdict", "InlineComment", "Redacted", "WithMention"],
};

const sender = { id: "u-founder", name: "Founder", role: "founder" };
const agentSender = { id: "u-agent", name: "Atlas", role: "builder", isAgent: true };

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
export const AgentMessage = (): React.JSX.Element => (
	<CommentRow
		message={{
			...plainMsg,
			id: "m-agent",
			senderId: "u-agent",
			payload: {
				text: "I've drafted a 3-phase plan: shadow enrollment, dual-auth window, then password deprecation. Existing sessions stay valid through phase 2. Estimated 6 weeks end-to-end.",
			},
		}}
		sender={agentSender}
		showSenderHeader={true}
	/>
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

/** AE5: @mention tokens render inline in plain messages. */
const mentionMsg: Message = {
	...plainMsg,
	id: "m-mention",
	payload: {
		text: "Hey @Aria and @Atlas — can you review the passkey plan?",
		refs: [
			{
				kind: "mention" as const,
				identityId: "u-aria",
				displayName: "Aria",
				sourceText: "@Aria",
			},
			{
				kind: "mention" as const,
				identityId: "u-atlas",
				displayName: "Atlas",
				sourceText: "@Atlas",
			},
		],
	},
};
export const WithMention = (): React.JSX.Element => (
	<CommentRow message={mentionMsg} sender={sender} showSenderHeader={true} />
);
