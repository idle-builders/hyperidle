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
			<span className="type-label uppercase     text-[var(--text-tertiary)]">{label}</span>
			<span className="type-copy  text-[var(--text-primary)]">{value}</span>
		</div>
	);
}
