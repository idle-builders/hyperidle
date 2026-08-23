// AM5 — KPI / Stat base primitive (EXTRACT from data-renderer.tsx headlines flex-grid).
//
// Lifted from `kinds/data-renderer.tsx:71-83` — the `headlines` flex-wrap grid of
// `{label, value}` metric figures. 11px mono caps label over base semibold tabular-nums
// value. Existing tokens, no new chrome.
//
// K0 purity: a base primitive is pure content — NO empty/error/loading branch.
// The composition guarantees non-empty metrics before invoking this primitive.
//
// Used in 2+ contexts:
//   - `data` artifact (composeArtifactBody — Task 5)
//   - `metrics_moved` review delta (Task 2/6)

import type { JSX } from "react";

export interface KpiStatMetric {
	label: string;
	value: string;
	/** Optional subtitle rendered below the metric value in label-size muted text. */
	sub?: string;
}

export interface KpiStatProps {
	metrics: ReadonlyArray<KpiStatMetric>;
}

export function KpiStat({ metrics }: KpiStatProps): JSX.Element {
	return (
		<section aria-label="Key metrics">
			<div className="flex flex-wrap gap-3">
				{metrics.map((m) => (
					<div key={m.label} className="flex flex-col">
						<span className="type-label   uppercase  text-[var(--text-tertiary)]">{m.label}</span>
						<span className="type-metric   text-[var(--text-primary)] tabular-nums">{m.value}</span>
						{m.sub !== undefined && (
							<span className="type-label  text-[var(--text-tertiary)] tabular-nums">{m.sub}</span>
						)}
					</div>
				))}
			</div>
		</section>
	);
}
