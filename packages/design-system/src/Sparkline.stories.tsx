// AM5 — EXTRACT primitive: Graph / Sparkline (the inline trend chart).
//
// Design embodiment ONLY (a story that renders). Sparkline is the second of the
// two genuinely-new base primitives AM5 EXTRACTS from the collapsing `data`
// kind. Today it is the unexported `Sparkline()` SVG inside
// `kinds/data-renderer.tsx` (~28–58): an 80×24 polyline, auto-scaled to its
// own min/max, stroked in `--accent-primary`.
//
// This story embodies that buried SVG as a standalone, reviewable base
// primitive with fixture props. The polyline math + tokens are reproduced
// EXACTLY — same 80×24 viewBox, same auto-scale, same accent stroke. NO new
// tokens. The builder does the real extraction out of `data-renderer.tsx`;
// this story is the design artifact the founder reviews.
//
// Purity (K0): a base primitive is pure content — NO empty/error/loading branch
// (states are composition-owned). The composition guarantees a non-empty series
// before invoking the primitive; this story renders only the populated state.
//
// Future chart types (bar / line / multi-series) extend off this Graph seam —
// noted, not scoped for AM5.

import type { JSX } from "react";
import { Sparkline } from "./Sparkline.js";

export default { title: "Sparkline", group: "Primitives" as const };

// A labelled trend row — the exact shape a `data` artifact composes
// (`data-renderer.tsx` charts: mono caps label left, sparkline right).
function TrendRow({ label, values }: { label: string; values: number[] }): JSX.Element {
	return (
		<div className="flex items-center gap-2">
			<span className="w-32 shrink-0 font-mono text-xs uppercase text-[var(--text-tertiary)]">
				{label}
			</span>
			<Sparkline values={values} label={label} />
		</div>
	);
}

// Trend — a rising series (the common growth case).
export const Trend = (): JSX.Element => (
	<TrendRow label="Signups" values={[12, 18, 16, 24, 31, 28, 37, 45, 52, 61]} />
);

// Flat — a near-constant series; auto-scale (range || 1) keeps it horizontal,
// proving the primitive degrades cleanly when there is little variance.
export const Flat = (): JSX.Element => (
	<TrendRow label="Uptime %" values={[99, 99, 100, 99, 100, 99, 99, 100, 99, 100]} />
);

// Volatile — a high-variance series, exercising the full auto-scaled range.
export const Volatile = (): JSX.Element => (
	<TrendRow label="Latency ms" values={[40, 220, 65, 180, 30, 260, 90, 140, 50, 210]} />
);
