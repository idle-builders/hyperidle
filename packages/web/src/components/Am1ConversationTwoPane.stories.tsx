/**
 * AM1 — Conversation Experience, Variant B "Two-Pane (B)" stories.
 *
 * Renders the variant at a desktop width wide enough to show BOTH panes
 * (~1100px container). `Populated` shows the full canonical fixture in the
 * dense left column + the contextual panel open to the artifact diff.
 */

import type { JSX } from "react";
import Am1ConversationTwoPane from "./Am1ConversationTwoPane.js";

export default {
	title: "AM1 Conversation — Two-Pane (B)",
	group: "Conversations" as const,
	order: ["Populated", "Empty", "Loading", "Error"],
};

function Frame({ children }: { children: React.ReactNode }): JSX.Element {
	return (
		<div className="w-[1100px] max-w-full bg-[var(--surface-page)] p-[18px]">{children}</div>
	);
}

export const Populated = (): JSX.Element => (
	<Frame>
		<Am1ConversationTwoPane state="populated" panelOpen={true} panelTab="diff" />
	</Frame>
);

export const Empty = (): JSX.Element => (
	<Frame>
		<Am1ConversationTwoPane state="empty" />
	</Frame>
);

export const Loading = (): JSX.Element => (
	<Frame>
		<Am1ConversationTwoPane state="loading" />
	</Frame>
);

export const Error = (): JSX.Element => (
	<Frame>
		<Am1ConversationTwoPane state="error" />
	</Frame>
);
