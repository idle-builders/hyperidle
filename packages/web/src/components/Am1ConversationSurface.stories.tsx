/**
 * AM1 — Conversation, v3: Full Surface (C) stories.
 *
 * The FULL-SCOPE conversation embodied in the REAL app container — left
 * conversation sidebar · center conversation pane · right contextual pane —
 * rendered at ~1440px desktop width on --surface-page. Only the real populated
 * conversation; no empty / loading / error variants ([[memory]]: initial designs
 * render only populated).
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
