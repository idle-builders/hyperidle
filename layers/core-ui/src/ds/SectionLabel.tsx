// @lore: tracking-[var(--tracking-caps-sm)] token form required — design/no-hardcoded-tracking forbids positive-em literals; rendered value identical (0.06em)

// @lore: default h3 not h2 — PageHeader title is h2; section opener is one level below; pages with SectionLabel as top heading pass as="h2"

import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";

export interface SectionLabelProps {
	label: ReactNode;
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
