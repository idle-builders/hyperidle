/**
 * L3 — "X of N blocking" counter at the top of the Conversations submenu.
 *
 * @lore L3: position is shown only when the active row is itself in the
 * Blocking section. Otherwise the position field renders as "—" so the
 * total still communicates the queue depth at a glance.
 *
 * Tabular numerals (AQ-006) keep the digits stable across selection
 * changes — no jitter when "1 of 12" replaces "10 of 12".
 */
import type { JSX } from "react";

export interface BlockingCounterProps {
	total: number;
	position: number | null;
}

export function BlockingCounter({ total, position }: BlockingCounterProps): JSX.Element {
	const left = position === null ? "—" : String(position);
	// @lore L3 review (design O8): the inline `fontVariantNumeric` and the
	// `tabular-nums` Tailwind class are belt-and-braces. Tailwind already
	// emits `font-variant-numeric: tabular-nums` so the inline style was
	// redundant; align with KeyValue's pattern (Tailwind utility only).
	return (
		<output
			data-testid="blocking-counter"
			className="font-mono text-xs text-[var(--text-mid)] tabular-nums"
		>
			{`${left} of ${total} blocking`}
		</output>
	);
}
