/**
 * SectionLabel — Tier 1 DS component (AI7).
 *
 * Canonical uppercase section heading used across all primary pages.
 * Encodes the one section-label treatment: 13px / 600 / uppercase /
 * tracking-[var(--tracking-caps-sm)] (= 0.06em token form).
 *
 * Renders the `as` element (default h3 — nested one level below the PageHeader
 * h2). Pages where SectionLabel IS the top heading pass as="h2" explicitly
 * (e.g. DocumentDetail sidebar).
 *
 * Optional `divider` adds a border-bottom rule for section separators that
 * were previously inlined on section headings.
 *
 * @lore AI7: The token form `tracking-[var(--tracking-caps-sm)]` is required
 * because design/no-hardcoded-tracking is error on DS src and forbids positive-em
 * literals like `tracking-[0.06em]`. The rendered value is identical (0.06em).
 * See architecture.md § Plan reconciliation.
 *
 * @lore AI7: Default is h3 (not h2) because the PageHeader title is the single
 * h2 on each page — a section opener nests one level below it. Pages with
 * SectionLabel as the page's top heading pass as="h2" explicitly.
 */

import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";

export interface SectionLabelProps {
	/** Uppercase label text. */
	label: ReactNode;
	/**
	 * Heading element for the document outline. Default "h3".
	 * Pages where SectionLabel IS the top heading pass as="h2" explicitly.
	 */
	as?: "h2" | "h3" | "h4";
	/** Same-row trailing slot (count, "New"/"Create" button). */
	trailing?: ReactNode;
	/** Optional bottom rule. Default false (de-facto majority). */
	divider?: boolean;
	/** Test hook passthrough. */
	"data-testid"?: string;
}

export function SectionLabel({
	label,
	as: Tag = "h3",
	trailing,
	divider = false,
	"data-testid": testId,
}: SectionLabelProps): JSX.Element {
	const headingClass = [
		"flex items-center justify-between gap-[12px]",
		"uppercase text-[var(--text-tertiary)]",
		"mb-[9px]",
		divider ? "pb-[6px] border-width-thin-b border-[var(--border-subtle)]" : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<Tag
			className={`type-label ${headingClass}`}
			{...dsProps("SectionLabel", "1")}
			{...(testId ? { "data-testid": testId } : {})}
		>
			<span>{label}</span>
			{trailing}
		</Tag>
	);
}
