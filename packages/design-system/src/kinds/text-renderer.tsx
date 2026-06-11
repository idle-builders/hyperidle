// AE6 — TextRenderer: renders text/markdown artifact previews.
// Maps from old kinds: contract, drafted_email, decision, data_analysis, comm_draft
//
// @lore AE6: Design spec §3a requires prose rendering. A full markdown-to-HTML pipeline
// (remark/unified) is available in @hyperidle/shared but not exposed as a React component.
// We apply Tailwind typography (prose prose-sm prose-invert max-w-none) on a div with
// whitespace-pre-wrap to preserve newlines without the <pre> monospace font. When a proper
// Block primitive lands in the design-system, swap this div for it.

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
			<div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap break-words text-[var(--text-primary)] leading-relaxed">
				{preview.body}
			</div>
		</section>
	);
}
