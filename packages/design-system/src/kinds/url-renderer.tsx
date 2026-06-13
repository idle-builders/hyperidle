// AE6 — UrlRenderer: renders URL/service reference artifact previews.
// Maps from old kind: running_service (label: service)
// Design spec §3f: colored status dot (green=ok, amber=degraded, red=down) before the link.

import type { UrlPreview } from "@hyperidle/shared";
import type { JSX } from "react";

export interface UrlRendererProps {
	preview: UrlPreview | null;
	kind: string;
}

/** Maps the url status enum value to a Tailwind background color class using semantic tokens. */
function statusDotClass(status: "ok" | "degraded" | "down"): string {
	switch (status) {
		case "ok":
			return "bg-[var(--status-success)]";
		case "degraded":
			return "bg-[var(--status-warning)]";
		case "down":
			return "bg-[var(--status-error)]";
	}
}

export function UrlRenderer({ preview }: UrlRendererProps): JSX.Element {
	if (!preview) {
		return <p className="text-sm text-[var(--text-tertiary)] italic">No URL available.</p>;
	}

	return (
		<section aria-label="URL reference" className="flex flex-col gap-1">
			<div className="flex items-center gap-2">
				{preview.status && (
					<span
						aria-label={`Status: ${preview.status}`}
						className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${statusDotClass(preview.status)}`}
					/>
				)}
				<a
					href={preview.url}
					target="_blank"
					rel="noopener noreferrer"
					className="text-sm text-[var(--accent-primary)] underline underline-offset-2 break-all hover:opacity-80 transition-opacity"
				>
					{preview.url}
				</a>
			</div>
			{preview.statusLabel && (
				<span className="text-xs text-[var(--text-secondary)] font-mono">
					{preview.statusLabel}
				</span>
			)}
		</section>
	);
}
