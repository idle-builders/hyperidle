import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactTimestampProps {
	value: string; // ISO 8601
	format?: "relative" | "absolute";
}

const BASE =
	"font-mono text-[11px] text-[var(--text-secondary)] [font-variant-numeric:tabular-nums]";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function relative(value: string): string {
	const t = Date.parse(value);
	if (Number.isNaN(t)) return value;
	const diff = Date.now() - t;
	if (diff < MIN) return "just now";
	if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;
	if (diff < DAY) return `${Math.floor(diff / HOUR)} hr ago`;
	return `${Math.floor(diff / DAY)} d ago`;
}

function absolute(value: string): string {
	const t = new Date(value);
	if (Number.isNaN(t.getTime())) return value;
	const yyyy = t.getUTCFullYear();
	const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(t.getUTCDate()).padStart(2, "0");
	const hh = String(t.getUTCHours()).padStart(2, "0");
	const mi = String(t.getUTCMinutes()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function ArtifactTimestamp({
	value,
	format = "relative",
}: ArtifactTimestampProps): JSX.Element {
	const text = format === "absolute" ? absolute(value) : relative(value);
	return (
		<span {...dsProps("ArtifactTimestamp", "1")} className={BASE} title={value}>
			{text}
		</span>
	);
}
