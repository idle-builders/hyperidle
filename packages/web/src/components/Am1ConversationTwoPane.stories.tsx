/**
 * AM1 — Conversation Experience, Variant B "Quiet Turns" stories.
 *
 * REDO v2: the v1 two-pane / side-panel is dropped. Renders a single calm
 * centered reading column on --surface-page. Only the real conversation
 * (Populated) — no empty / loading / error variants (founder feedback).
 */

import type { JSX } from "react";
import Am1ConversationTwoPane from "./Am1ConversationTwoPane.js";

export default {
	title: "AM1 Conversation — Quiet Turns (B)",
	group: "Conversations" as const,
};

export const Populated = (): JSX.Element => (
	<div className="min-h-screen w-full bg-[var(--surface-page)]">
		<Am1ConversationTwoPane />
	</div>
);
