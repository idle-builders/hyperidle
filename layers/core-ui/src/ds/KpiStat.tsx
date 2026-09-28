// @lore: KpiStat is a pure content primitive — no empty/error/loading branch; callers guarantee non-empty metrics

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
