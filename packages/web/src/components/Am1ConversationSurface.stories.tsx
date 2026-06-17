/**
 * AM1 — Conversation, v3: Full Surface (C) stories.
 *
 * The FULL-SCOPE conversation scoped to the conversation pane (the app-shell
 * sidebar — conversation list + nav — is intentionally OUT of this design: it is
 * app-shell chrome that lives elsewhere). Rendered at desktop width on
 * --surface-page. Only the real populated conversation; no empty / loading /
 * error variants ([[memory]]: initial designs render only populated).
 *
 * Two embodiments:
 *  - Populated (default): the WHOLE conversation at natural height (no internal
 *    scroll clip) with a RESTING composer — so the full thread is legible in one
 *    frame for design review.
 *  - ComposerInsertBlock: the conversation tail + the composer in its ACTIVE
 *    Insert-Block state (reply banner · inserted rich code block · attachment ·
 *    open Insert menu · Send) — the composer's killer feature.
 */

import type { JSX } from "react";
import Am1ConversationSurface from "./Am1ConversationSurface.js";

export default {
	title: "AM1 Conversation — Full Surface (C)",
	group: "Conversations" as const,
};

// The full conversation, resting composer — natural height (nothing clipped).
export const Populated = (): JSX.Element => (
	<div className="w-full bg-[var(--surface-page)] p-[24px]">
		<div className="mx-auto w-full max-w-[1440px] overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] shadow-[var(--shadow-default)]">
			<Am1ConversationSurface />
		</div>
	</div>
);

// The composer's killer feature: active Insert-Block state, anchored under the
// conversation tail (fixed-height scroll so the composer detail dominates).
export const ComposerInsertBlock = (): JSX.Element => (
	<div className="w-full bg-[var(--surface-page)] p-[24px]">
		<div
			className="mx-auto w-full max-w-[1440px] overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] shadow-[var(--shadow-default)]"
			style={{ height: 760 }}
		>
			<Am1ConversationSurface scroll composerActive />
		</div>
	</div>
);
