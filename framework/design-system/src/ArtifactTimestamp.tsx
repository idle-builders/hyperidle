import { absoluteDate, relativeLong } from "@hyperidle/shared";
import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactTimestampProps {
	value: string; // ISO 8601
	format?: "relative" | "absolute";
}

const BASE =
	"font-mono text-[11px] text-[var(--text-secondary)] [font-variant-numeric:tabular-nums]";

export function ArtifactTimestamp({
	value,
	format = "relative",
}: ArtifactTimestampProps): JSX.Element {
	const text = format === "absolute" ? absoluteDate(value) : relativeLong(value);
	return (
		<span {...dsProps("ArtifactTimestamp", "1")} className={BASE} title={value}>
			{text}
		</span>
	);
}
