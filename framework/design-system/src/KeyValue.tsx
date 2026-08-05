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
			className={`flex ${direction} gap-[6px] ${layout === "inline" ? "items-center justify-between" : ""}`}
		>
			{/* @lore K7 / AESTHETICS.md § Typography row "Letter-spacing for caps":
			    +0.02em (designer-call) on uppercase labels. */}
			<span className="uppercase font-[family-name:var(--font-mono)] text-[11px] tracking-[var(--tracking-caps)] font-medium text-[var(--text-tertiary)]">
				{label}
			</span>
			<span className="text-[15px] text-[var(--text-primary)]">{value}</span>
		</div>
	);
}
