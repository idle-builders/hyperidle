// AE6 — HtmlRenderer: renders rich HTML artifact previews in a sandboxed iframe.
// Maps from old kinds: deck, dashboard
//
// Security: the iframe sandbox only allows "allow-scripts" to support chart rendering.
// "allow-same-origin" is intentionally excluded to prevent access to parent origin cookies.
// "allow-forms" and "allow-popups" are excluded to prevent data exfiltration.
//
// @lore AE6 F2: Uses srcdoc (inline HTML) instead of URL to avoid requiring a
// separate server route for HTML artifact content. The iframe is sandboxed with
// allow-scripts only — no allow-same-origin, no allow-forms, no allow-popups.

import type { HtmlPreview } from "@hyperidle/shared";
import type { JSX } from "react";

export interface HtmlRendererProps {
	preview: HtmlPreview | null;
	kind: string;
}

export function HtmlRenderer({ preview }: HtmlRendererProps): JSX.Element {
	if (!preview) {
		return <p className="text-sm text-[var(--text-tertiary)] italic">HTML preview pending.</p>;
	}

	return (
		<section aria-label="HTML preview">
			{preview.title && (
				<p className="text-xs font-mono text-[var(--text-secondary)] mb-2">{preview.title}</p>
			)}
			<iframe
				title={preview.title ?? "HTML artifact preview"}
				srcDoc={preview.html}
				sandbox="allow-scripts"
				className="w-full rounded-[var(--r-default)] border border-[var(--border-subtle)]"
				style={{ minHeight: 300 }}
			/>
		</section>
	);
}
