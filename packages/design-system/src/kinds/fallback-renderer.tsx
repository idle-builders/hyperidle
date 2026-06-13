// AE6 — FallbackRenderer: renders arbitrary JSON preview data for unregistered kinds.
// Provides a safe key-value display for any preview shape.
//
// @lore AE6: This renderer is the open-vocabulary fallback. Any kind string not
// registered in the Kind Registry falls through to this renderer. It renders
// the raw preview JSON as key-value pairs, making it useful for future extension
// without requiring UI code changes.

import type { JSX } from "react";

export interface FallbackRendererProps {
	preview: Record<string, unknown> | null;
	kind: string;
}

function renderValue(value: unknown): string {
	if (value === null || value === undefined) return "—";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return JSON.stringify(value);
}

export function FallbackRenderer({ preview, kind }: FallbackRendererProps): JSX.Element {
	if (!preview) {
		return (
			<p className="text-sm text-[var(--text-tertiary)] italic">{kind} — no preview available.</p>
		);
	}

	const entries = Object.entries(preview).filter(([k]) => k !== "kind");

	if (entries.length === 0) {
		return <p className="text-sm text-[var(--text-tertiary)] italic">{kind} — no preview data.</p>;
	}

	return (
		<section aria-label={`${kind} preview`} className="flex flex-col gap-1">
			{entries.map(([key, val]) => (
				<div key={key} className="flex gap-3 text-sm">
					<span className="text-[var(--text-tertiary)] font-mono text-[11px] uppercase tracking-[var(--tracking-caps-sm)] w-24 shrink-0 pt-[3px]">
						{key}
					</span>
					<span className="text-[var(--text-primary)] break-all">{renderValue(val)}</span>
				</div>
			))}
		</section>
	);
}
