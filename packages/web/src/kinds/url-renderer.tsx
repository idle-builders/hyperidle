// AE6 — UrlRenderer: renders URL/service reference artifact previews.
// Maps from old kind: running_service (label: service)

import type { UrlPreview } from "@hyperidle/shared";
import type { JSX } from "react";

export interface UrlRendererProps {
	preview: UrlPreview | null;
	kind: string;
}

export function UrlRenderer({ preview }: UrlRendererProps): JSX.Element {
	if (!preview) {
		return <p className="text-sm text-[var(--text-tertiary)] italic">No URL available.</p>;
	}

	return (
		<section aria-label="URL reference" className="flex flex-col gap-1">
			<a
				href={preview.url}
				target="_blank"
				rel="noopener noreferrer"
				className="text-sm text-[var(--accent-primary)] underline underline-offset-2 break-all hover:opacity-80 transition-opacity"
			>
				{preview.url}
			</a>
			{preview.statusLabel && (
				<span className="text-xs text-[var(--text-secondary)] font-mono">
					{preview.statusLabel}
				</span>
			)}
		</section>
	);
}
