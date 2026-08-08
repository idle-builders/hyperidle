/**
 * ReferenceChip — the single shared attachment/reference primitive (AM1, AC6).
 *
 * ONE chip for EVERY attachment / reference, everywhere: composer drafts,
 * in-message blocks/artifacts/images, knowledge sources, review change-sets.
 * It replaces five divergent legacy chips (DraftAttachmentChip, AttachmentChip,
 * BlockTitleEmbed, CitationChips, ChangeSetEmbedCard) that drifted apart.
 *
 * Two modes:
 *  - `posted` — whole chip = open; NO remove control. A trailing → reveals on hover.
 *  - `draft`  — body = open, trailing ✕ = remove (TWO distinct hit targets).
 *
 * @lore AM1: `label`/`meta` render as React-escaped TEXT content, never HTML
 * (§8 injection guard). The block chip shows the title only — never code.
 */

import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export type ReferenceChipKind = "artifact" | "image" | "knowledge" | "block";
export type ReferenceChipMode = "draft" | "posted";

export interface ReferenceChipProps {
	kind: ReferenceChipKind;
	label: string;
	meta?: string;
	mode: ReferenceChipMode;
	onOpen?: () => void;
	onRemove?: () => void;
}

// Inline icon set — currentColor, no emoji-as-icon (AQ-105). 16-box.
const ICON: Record<ReferenceChipKind, string> = {
	artifact:
		"M5.2 3.4L1 8l4.2 4.6 1.1-1L3.2 8l3.1-3.6-1.1-1zm5.6 0l-1.1 1L13.8 8l-3.1 3.6 1.1 1L16 8l-4.2-4.6z",
	image:
		"M2.5 2.5h11a1 1 0 011 1v9a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9a1 1 0 011-1zm0 1.5v6.1l3-3 2.2 2.2L11 5.3l3 3V4H2.5zM5.3 5a1.1 1.1 0 110 2.2 1.1 1.1 0 010-2.2z",
	knowledge:
		"M3 1.5h7l3 3v9.5a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5v-12a.5.5 0 01.5-.5zm6.5 1.2V4.5h1.8L9.5 2.7zM4.5 6.3h7v1.2h-7V6.3zm0 2.6h7v1.2h-7V8.9zm0 2.6h4.6v1.2H4.5v-1.2z",
	block: "M2.5 2.5h11v2.2h-11V2.5zm0 3.6h11v2.2h-11V6.1zm0 3.6h7v2.2h-7V9.7z",
};
const ICON_ARROW = "M3 8h8.2L8 4.8 9.2 3.6 14.4 8l-5.2 4.4L8 11.2 11.2 8H3V8z";
const ICON_REMOVE =
	"M4.3 3.2L8 6.9l3.7-3.7 1.1 1.1L9.1 8l3.7 3.7-1.1 1.1L8 9.1l-3.7 3.7-1.1-1.1L6.9 8 3.2 4.3l1.1-1.1z";

function Glyph({ d, size = 13 }: { d: string; size?: number }): JSX.Element {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="currentColor"
			className="shrink-0"
			style={{ width: size, height: size }}
			aria-hidden="true"
		>
			<path d={d} />
		</svg>
	);
}

// Same outer shell in BOTH modes — identical look. Only the trailing slot differs.
const SHELL =
	"group/refchip inline-flex max-w-[260px] items-center gap-[6px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-container)] py-[3px] pl-[9px] pr-[3px] text-[12px] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-default)]";

export function ReferenceChip({
	kind,
	label,
	meta,
	mode,
	onOpen,
	onRemove,
}: ReferenceChipProps): JSX.Element {
	const openBody = (
		<>
			<span className="flex shrink-0 items-center text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] group-hover/refchip:text-[var(--text-secondary)]">
				<Glyph d={ICON[kind]} size={13} />
			</span>
			<span className="truncate font-[500] text-[var(--text-primary)]">{label}</span>
			{meta && <span className="shrink-0 tabular-nums text-[var(--text-tertiary)]">{meta}</span>}
		</>
	);

	if (mode === "posted") {
		// Whole chip = open; no remove. A trailing → reveals on hover.
		return (
			<button
				type="button"
				onClick={onOpen}
				aria-label={`Open ${label}`}
				title={`Open ${label}`}
				{...dsProps("ReferenceChip", "1")}
				data-ds-mode="posted"
				data-ds-kind={kind}
				className={`${SHELL} pr-[9px] text-left`}
			>
				{openBody}
				<span className="flex shrink-0 items-center text-[var(--text-tertiary)] opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/refchip:opacity-100 group-hover/refchip:text-[var(--accent-deep)]">
					<Glyph d={ICON_ARROW} size={11} />
				</span>
			</button>
		);
	}

	// draft mode — body = open, trailing ✕ = remove (two distinct hit targets).
	return (
		<span
			{...dsProps("ReferenceChip", "1")}
			data-ds-mode="draft"
			data-ds-kind={kind}
			className={SHELL}
		>
			<button
				type="button"
				onClick={onOpen}
				aria-label={`Open ${label}`}
				title={`Open ${label}`}
				className="flex min-w-0 items-center gap-[6px] text-left"
			>
				{openBody}
			</button>
			<button
				type="button"
				onClick={onRemove}
				aria-label={`Remove ${label}`}
				title="Remove"
				className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)]"
			>
				<Glyph d={ICON_REMOVE} size={11} />
			</button>
		</span>
	);
}
