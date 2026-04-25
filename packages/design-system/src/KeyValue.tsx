import type { JSX } from "react";
import { dsProps } from "./ds-attrs";

export interface KeyValueProps {
	label: string;
	value: string;
	layout?: "inline" | "stacked";
}

export function KeyValue({ label, value, layout = "inline" }: KeyValueProps): JSX.Element {
	const direction = layout === "stacked" ? "flex-col" : "flex-row";

	return (
		<div
			{...dsProps("KeyValue", "1")}
			className={`flex ${direction} gap-[var(--density-card-gap)] ${layout === "inline" ? "items-center justify-between" : ""}`}
		>
			{/* @lore K7 / AESTHETICS.md § Typography row "Letter-spacing for caps":
			    +0.02em (designer-call) on uppercase labels. tracking-[0.05em] → tracking-[var(--tracking-caps)]. */}
			<span className="uppercase font-heading text-[11px] tracking-[var(--tracking-caps)] font-medium text-[var(--text-lo)]">
				{label}
			</span>
			{/* @lore J1→px-fix: text-[14px] replaces text-sm so the fallback font-size is correct
			    under 14px-base viewers. text-[length:var(--density-text)] still wins at runtime
			    for density-aware sizing. Tests updated to assert text-[14px]. */}
			<span className="text-[14px] text-[length:var(--density-text)] text-[var(--text-hi)]">
				{value}
			</span>
		</div>
	);
}
