import type { JSX, ReactNode } from "react";

/**
 * J1 — Tier-2 Tag kinds. The taxonomy is intentionally small (three kinds) so
 * the visual language stays legible without a colour key.
 *
 * @lore Centralised here so Tag.tsx, tests, and any downstream knowledge
 * taxonomy consumer import from ONE constant. Inline 16×16 SVG follows the
 * existing pattern from shell-types.ts — we deliberately avoid adding
 * lucide-react because only three glyphs are needed.
 */
export type TagKind = "pattern" | "decision" | "failure";

export interface TagKindMeta {
	/** Inline SVG, rendered at 12x12 with fill="currentColor" so tint cascades. */
	icon: ReactNode;
	/** Tailwind class string applied to the badge span. */
	tintClass: string;
	/** Screen-reader prefix; the wrapper's aria-label becomes `${ariaLabel}: ${label}`. */
	ariaLabel: string;
}

function PatternIcon(): JSX.Element {
	// Three stacked horizontal lines — recurring structure.
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="currentColor"
			aria-hidden="true"
		>
			<rect x="1" y="2" width="10" height="1.5" rx="0.5" />
			<rect x="1" y="5.25" width="10" height="1.5" rx="0.5" />
			<rect x="1" y="8.5" width="10" height="1.5" rx="0.5" />
		</svg>
	);
}

function DecisionIcon(): JSX.Element {
	// Check mark inside a diamond — commitment / gate.
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.25"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M6 1 L11 6 L6 11 L1 6 Z" />
			<path d="M3.75 6 L5.5 7.5 L8.25 4.75" />
		</svg>
	);
}

function FailureIcon(): JSX.Element {
	// Triangle with an exclamation — muted warning.
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.25"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M6 1.5 L11 10.5 L1 10.5 Z" />
			<path d="M6 5 L6 7.5" />
			<path d="M6 9 L6 9.25" />
		</svg>
	);
}

export const TAG_KIND_ICONS: Record<TagKind, TagKindMeta> = {
	pattern: {
		icon: <PatternIcon />,
		tintClass: "bg-[var(--surface-4)] text-[var(--text-mid)]",
		ariaLabel: "Pattern",
	},
	decision: {
		icon: <DecisionIcon />,
		tintClass: "bg-[var(--surface-4)] text-[var(--p)]",
		ariaLabel: "Decision",
	},
	failure: {
		icon: <FailureIcon />,
		tintClass: "bg-[var(--surface-4)] text-[var(--er)]",
		ariaLabel: "Failure",
	},
};
