import { dsShellProps } from "@hyperidle/design-system";
import type { JSX } from "react";

/**
 * L5 — Mobile-only single-line "Rail glance" strip rendered above the
 * scrollable content. Tap expands the full Rail content into a sheet.
 *
 * @lore L5 spec: "Rail-glance strip (mobile only): one line — `Blocking N
 * · Burn $X · Anomalies 0` — tap to expand into a full-screen sheet with
 * the desktop Rail content."
 *
 * @lore AQ-015 + AQ-002: tap target ≥44px tall (h-11=44). The burn value
 * and blocking count read from props — the underlying numbers ARE the
 * desktop Rail's content but compressed to one line.
 */

export interface RailGlanceStripProps {
	blockingCount: number;
	/** Pre-formatted spend string (e.g. "$28.40"). Domain-formatted upstream. */
	burnLabel: string;
	anomaliesCount: number;
	onExpand: () => void;
}

export function RailGlanceStrip({
	blockingCount,
	burnLabel,
	anomaliesCount,
	onExpand,
}: RailGlanceStripProps): JSX.Element {
	const summary = `Blocking ${blockingCount} · Burn ${burnLabel} · Anomalies ${anomaliesCount}`;
	return (
		<button
			type="button"
			{...dsShellProps("RailGlanceStrip")}
			data-testid="rail-glance-strip"
			aria-label={`Open rail glance: ${summary}`}
			onClick={onExpand}
			className="flex h-11 min-h-[44px] w-full items-center justify-between gap-2 border-b border-[var(--border-default)] bg-[var(--surface-1)] px-3 font-mono text-xs text-[var(--text-mid)]"
		>
			<span className="flex flex-1 items-center gap-2 truncate text-left">
				<span data-testid="rail-glance-blocking">Blocking {blockingCount}</span>
				<span aria-hidden="true">·</span>
				<span>Burn {burnLabel}</span>
				<span aria-hidden="true">·</span>
				<span>Anomalies {anomaliesCount}</span>
			</span>
			<svg
				aria-hidden="true"
				width={12}
				height={12}
				viewBox="0 0 12 12"
				fill="currentColor"
				className="text-[var(--text-lo)]"
			>
				<path d="M2 4l4 5 4-5H2z" />
			</svg>
		</button>
	);
}
