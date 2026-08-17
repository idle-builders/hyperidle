// AM5 — EXTRACT primitive: KPI / Stat (the headline metric figure grid).
//
// Design embodiment ONLY (a story that renders). KPI/Stat is one of the two
// genuinely-new base primitives AM5 EXTRACTS from the collapsing `data` kind.
// Today it is buried inside `kinds/data-renderer.tsx` (~71–83) as the
// "headlines flex-grid": a `flex flex-wrap gap-3` row of `{label, value}`
// figures — mono caps label over a semibold tabular-nums value.
//
// This story embodies that buried pattern as a standalone, reviewable base
// primitive with fixture props. It mirrors the existing figure tokens EXACTLY
// (mono caps label + tabular-nums value) — NO new chrome, NO new tokens. The
// builder does the real extraction out of `data-renderer.tsx`; this story is
// the design artifact the founder reviews.
//
// Purity (K0): a base primitive is pure content — NO empty/error/loading branch
// (states are composition-owned). This story renders only the populated state.
//
// NB: `KeyValue.tsx` is a bare inline label:value pair, NOT this figure grid —
// different shape (stacked caps-label over big tabular value, laid out as a
// flex-wrap row of metrics), which is why KPI is its own primitive.

import type { JSX } from "react";
import { KpiStat } from "./KpiStat.js";

export default { title: "KpiStat", group: "Primitives" as const };

// SingleMetric — one headline figure (the primitive's atomic unit).
export const SingleMetric = (): JSX.Element => (
	<KpiStat metrics={[{ label: "MRR", value: "$42,180" }]} />
);

// MetricRow — the buried headlines pattern: a row of caps-label + semibold-value
// figures wrapping on the 12px gap. The real shape a `data` artifact composes.
export const MetricRow = (): JSX.Element => (
	<KpiStat
		metrics={[
			{ label: "MRR", value: "$42,180" },
			{ label: "Active users", value: "1,284" },
			{ label: "Conversion", value: "3.7%" },
			{ label: "Churn", value: "1.9%" },
			{ label: "Avg ticket", value: "4h 12m" },
		]}
	/>
);

// WithSub — metric with an optional sub-line for contextual annotation.
// Matches the WorkTeam stat-strip pattern (e.g. "2 / 4" capacity + "active bets" sub).
export const WithSub = (): JSX.Element => (
	<KpiStat
		metrics={[
			{ label: "Capacity", value: "2 / 4", sub: "active bets" },
			{ label: "Agent Health", value: "On track", sub: "1 idle agent" },
		]}
	/>
);
