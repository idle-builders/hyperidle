/**
 * AM1 — Conversation, v3: Full Surface (C) stories.
 *
 * The FULL-SCOPE conversation scoped to TWO regions — the conversation pane
 * (primary) · right contextual pane — rendered at desktop width on --surface-page.
 * The app-shell sidebar (conversation list + nav) is intentionally OUT of this
 * design: it is app-shell chrome that lives elsewhere, excluded so the conversation
 * gets the viewer width. Only the real populated conversation; no empty / loading /
 * error variants ([[memory]]: initial designs render only populated).
 */

import type { JSX } from "react";
import Am1ConversationSurface from "./Am1ConversationSurface.js";

export default {
	title: "AM1 Conversation — Full Surface (C)",
	group: "Conversations" as const,
};

export const Populated = (): JSX.Element => (
	<div className="w-full bg-[var(--surface-page)] p-[24px]">
		<div
			className="mx-auto w-full max-w-[1440px] overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] shadow-[var(--shadow-default)]"
			style={{ height: 820 }}
		>
			<Am1ConversationSurface />
		</div>
	</div>
);
