import type { JSX } from "react";
import { absoluteDate, relativeLong } from "../utils/time.js";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactTimestampProps {
	value: string; // ISO 8601
	format?: "relative" | "absolute";
}

const BASE = "text-[var(--text-secondary)] [font-variant-numeric:tabular-nums]";

export function ArtifactTimestamp({
	value,
	format = "relative",
}: ArtifactTimestampProps): JSX.Element {
	const text = format === "absolute" ? absoluteDate(value) : relativeLong(value);
	return (
		<span {...dsProps("ArtifactTimestamp", "1")} className={`type-data ${BASE}`} title={value}>
			{text}
		</span>
	);
}
