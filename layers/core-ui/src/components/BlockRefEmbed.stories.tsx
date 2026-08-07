/**
 * T4 — BlockRefEmbed stories.
 *
 * Shows all four states: loading, resolved, degraded, error.
 * Uses mock containers that render each state directly (the real hook is
 * not called — each story directly renders a stand-alone div matching
 * what BlockRefEmbed renders for each status).
 *
 * @lore T4: We don't mock useBlockResolution in stories because the storybook
 * framework here doesn't support module mocking. Instead each story renders
 * the relevant visual state directly by matching the render logic in BlockRefEmbed.
 */

import type { JSX } from "react";

export default {
	title: "T4/BlockRefEmbed",
	tier: "3" as const,
	uses: ["CommentRow"],
};

/** Loading state — skeleton shimmer. */
export function Loading(): JSX.Element {
	return (
		<div style={{ width: 360, padding: 16 }}>
			<div
				data-testid="block-ref-embed-loading"
				aria-busy="true"
				aria-label="Loading block reference"
				className="h-[32px] rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] animate-pulse"
			/>
		</div>
	);
}

/** Resolved state — block content in a bordered card. */
export function Resolved(): JSX.Element {
	return (
		<div style={{ width: 360, padding: 16 }}>
			<div
				data-testid="block-ref-embed-resolved"
				className="border border-[var(--border-subtle)] rounded-[var(--r-subtle)] px-3 py-2 bg-[var(--surface-1)]"
			>
				<div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
					Block from bet pitch
				</div>
				<div className="text-[13px] text-[var(--text-secondary)]">
					This is the first paragraph of the pitch — the referenced content renders here.
				</div>
			</div>
		</div>
	);
}

/** Degraded state — source changed indicator (AC-7). */
export function Degraded(): JSX.Element {
	return (
		<div style={{ width: 360, padding: 16 }}>
			<div
				data-testid="block-ref-embed-degraded"
				className="border border-[var(--border-subtle)] rounded-[var(--r-subtle)] px-3 py-2 bg-[var(--surface-1)]"
			>
				<div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
					Block from knowledge item
				</div>
				<div className="text-[12px] text-[var(--text-tertiary)] italic">
					Source changed — the referenced block no longer exists in the source document.
				</div>
			</div>
		</div>
	);
}

/** Error state — fetch failed with retry button. */
export function FetchError(): JSX.Element {
	return (
		<div style={{ width: 360, padding: 16 }}>
			<div
				data-testid="block-ref-embed-error"
				className="border border-[var(--border-subtle)] rounded-[var(--r-subtle)] px-3 py-2 bg-[var(--surface-1)] flex items-center justify-between gap-2"
			>
				<span className="text-[12px] text-[var(--text-tertiary)]">
					Could not load referenced content
				</span>
				<button type="button" className="btn btn-xs btn-ghost shrink-0">
					Retry
				</button>
			</div>
		</div>
	);
}
