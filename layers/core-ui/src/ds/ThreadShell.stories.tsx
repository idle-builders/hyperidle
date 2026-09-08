/**
 * L1a — `ThreadShell` stories (stub).
 */

import type { Message, Thread } from "@hyperidle/domain-model";
import { ThreadShell } from "./ThreadShell.js";

export default {
	title: "ThreadShell",
	tier: "3" as const,
	order: ["PopulatedReview", "PopulatedChat", "Empty", "Loading", "Error"],
};

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
		producedItemId: "art-1",
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

export const PopulatedReview = (): React.JSX.Element => (
	<ThreadShell
		thread={baseThread}
		messages={[reviewMessage]}
		identities={identities}
		onAppendMessage={async () => {}}
	/>
);
export const PopulatedChat = (): React.JSX.Element => (
	<ThreadShell
		thread={baseThread}
		messages={[plainMessage]}
		identities={identities}
		onAppendMessage={async () => {}}
	/>
);
export const Empty = (): React.JSX.Element => (
	<ThreadShell
		thread={baseThread}
		messages={[]}
		identities={identities}
		onAppendMessage={async () => {}}
	/>
);
export const Loading = (): React.JSX.Element => (
	<ThreadShell
		thread={baseThread}
		messages={[]}
		identities={identities}
		onAppendMessage={async () => {}}
		loading={true}
	/>
);
export const ErrorState = (): React.JSX.Element => (
	<ThreadShell
		thread={baseThread}
		messages={[]}
		identities={identities}
		onAppendMessage={async () => {}}
		error="Network down"
	/>
);
