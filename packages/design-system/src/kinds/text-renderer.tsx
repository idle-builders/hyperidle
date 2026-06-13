// AE6 — TextRenderer: renders text/markdown artifact previews.
// Maps from old kinds: contract, drafted_email, decision, data_analysis, comm_draft
//
// @lore AE6: Design spec §3a requires prose rendering. A full markdown-to-HTML pipeline
// (remark/unified) is available in @hyperidle/shared but not exposed as a React component.
// We apply token-based paragraph styles on a div with whitespace-pre-wrap to preserve
// newlines without the <pre> monospace font. When a proper Block primitive lands in the
// design-system, swap this div for it.
//
// @lore AI6: Removed `prose prose-sm prose-invert max-w-none` — these Tailwind Typography
// plugin classes are not installed in Hearth's Tailwind config and rendered as nothing.
// `prose-invert` is a dark-only class that would break Hearth's light-first theme.
// Replaced with token-based paragraph styles matching block/ParagraphPayload.

import type { TextPreview } from "@hyperidle/shared";
import type { JSX } from "react";

export interface TextRendererProps {
	preview: TextPreview | null;
	kind: string;
}

export function TextRenderer({ preview }: TextRendererProps): JSX.Element {
	if (!preview) {
		return (
			<p className="text-sm text-[var(--text-tertiary)] italic">No content preview available.</p>
		);
	}

	return (
		<section aria-label="Text content">
			<div className="text-[var(--text-primary)] leading-[var(--leading-body)] whitespace-pre-wrap break-words">
				{preview.body}
			</div>
		</section>
	);
}
