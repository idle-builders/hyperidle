/**
 * AM1 — Conversation Experience, Variant C: "Editorial" — story.
 *
 * Renders the canonical fixture conversation (brief §"Canonical fixture") as a
 * beautifully typeset reading document: a generous centered column, prose
 * turns with almost no per-message chrome, the quiet "RESPONSE · WORKED FOR 1M
 * 12S" Fold label, full-bleed inline embeds (artifact diff with real +/− lines,
 * referenced block with real content, a single quiet session-reference line),
 * the review → verdict, and a bottom-pinned composer.
 *
 * Per the REDO brief + [[memory: designer scope is story-only]] this exports a
 * SINGLE `Populated` variant — no Empty / Loading / Error, no skeletons.
 */

import type React from "react";
import Am1ConversationCalmDocument from "./Am1ConversationCalmDocument.js";

export default {
	title: "AM1 Conversation — Calm Document (C)",
	group: "Conversations" as const,
};

export const Populated = (): React.JSX.Element => (
	<div className="h-[820px] w-full overflow-y-auto" style={{ background: "var(--surface-page)" }}>
		<Am1ConversationCalmDocument />
	</div>
);
