/**
 * AM1 — Variant A "Quiet prose" story.
 *
 * Single Populated variant = the full canonical fixture conversation (founder
 * ask → Atlas work-turn with the quiet Fold label → diff / block / session
 * reference lines → review with verdict actions → founder approved). Rendered
 * as flowing prose in a narrow centered column on --surface-page. No empty /
 * loading / error states — only the real, populated conversation matters.
 */

import type React from "react";
import Am1ConversationQuietStream from "./Am1ConversationQuietStream.js";

export default {
	title: "AM1 Conversation — Quiet Prose (A)",
	group: "Conversations" as const,
};

export const Populated = (): React.JSX.Element => (
	<div className="min-h-screen w-full bg-[var(--surface-page)]">
		<Am1ConversationQuietStream resolved={true} />
	</div>
);
