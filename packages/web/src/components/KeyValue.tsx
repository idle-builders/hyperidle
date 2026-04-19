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
			<span className="text-[length:var(--density-text)] text-[var(--text-hi)]">{value}</span>
		</div>
	);
}
