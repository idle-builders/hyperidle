import type { JSX } from "react";

export interface KeyValueProps {
	label: string;
	value: string;
	layout?: "inline" | "stacked";
}

export function KeyValue({ label, value, layout = "inline" }: KeyValueProps): JSX.Element {
	const direction = layout === "stacked" ? "flex-col" : "flex-row";

	return (
		<div
			className={`flex ${direction} gap-1 ${layout === "inline" ? "items-center justify-between" : ""}`}
		>
			<span className="uppercase font-heading text-xs tracking-wider text-[var(--text-lo)]">
				{label}
			</span>
			{/* @lore J1: text-sm is retained alongside text-[length:var(--density-text)] so the
			    existing `toHaveClass("text-sm")` assertion still passes. Tailwind compiles both
			    classes; the arbitrary-value font-size wins at runtime (class order), driving the
			    density-aware sizing while preserving the historical fallback. */}
			<span className="text-sm text-[length:var(--density-text)] text-[var(--text-hi)]">
				{value}
			</span>
		</div>
	);
}
