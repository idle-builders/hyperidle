import type { ReactNode } from "react";

export type TagKind = "pattern" | "decision" | "failure";

export interface TagKindMeta {
	icon: ReactNode;
	tintClass: string;
	/** Screen-reader prefix, rendered as an sr-only `${ariaLabel}: ` span before the label. */
	ariaLabel: string;
}

export const TAG_KIND_ICONS: Record<TagKind, TagKindMeta> = {
	pattern: {
		icon: (
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
		),
		tintClass: "tag-tint-pattern text-[var(--text-secondary)]",
		ariaLabel: "Pattern",
	},
	decision: {
		icon: (
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
		),
		tintClass: "tag-tint-decision text-[var(--accent-deep)]",
		ariaLabel: "Decision",
	},
	failure: {
		icon: (
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
				<circle cx="6" cy="9" r="0.6" fill="currentColor" stroke="none" />
			</svg>
		),
		tintClass: "tag-tint-failure text-[var(--status-error)]",
		ariaLabel: "Failure",
	},
};
