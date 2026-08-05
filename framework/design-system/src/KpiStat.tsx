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

export interface KpiStatProps {
	metrics: ReadonlyArray<{ label: string; value: string }>;
}

export function KpiStat({ metrics }: KpiStatProps): JSX.Element {
	return (
		<section aria-label="Key metrics">
			<div className="flex flex-wrap gap-3">
				{metrics.map((m) => (
					<div key={m.label} className="flex flex-col">
						<span className="text-[11px] font-mono uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
							{m.label}
						</span>
						<span className="text-base font-semibold text-[var(--text-primary)] tabular-nums">
							{m.value}
						</span>
					</div>
				))}
			</div>
		</section>
	);
}
