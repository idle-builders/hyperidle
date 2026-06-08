// AE6 — TextRenderer: renders text/markdown artifact previews.
// Maps from old kinds: contract, drafted_email, decision, data_analysis, comm_draft

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
			<pre className="whitespace-pre-wrap break-words text-sm text-[var(--text-primary)] font-sans leading-relaxed">
				{preview.body}
			</pre>
		</section>
	);
}
