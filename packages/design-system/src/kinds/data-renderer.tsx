// AE6 — DataRenderer: renders structured metrics/tables artifact previews.
// Maps from old kinds: verification (test-results label), data_analysis

import type { JSX } from "react";

type DataHeadline = {
	label: string;
	value: string;
};

type DataChart = {
	label: string;
	values: number[];
};

type DataPreview = {
	kind: "data";
	headlines: DataHeadline[];
	rows?: Record<string, string>[];
	charts?: DataChart[];
};

export interface DataRendererProps {
	preview: DataPreview | null;
	kind: string;
}

function Sparkline({ values, label }: { values: number[]; label: string }): JSX.Element | null {
	if (values.length === 0) return null;

	const max = Math.max(...values);
	const min = Math.min(...values);
	const range = max - min || 1;
	const width = 80;
	const height = 24;
	const step = width / Math.max(values.length - 1, 1);

	const points = values
		.map((v, i) => {
			const x = i * step;
			const y = height - ((v - min) / range) * height;
			return `${x},${y}`;
		})
		.join(" ");

	return (
		<svg
			role="img"
			aria-label={`${label} sparkline`}
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			className="inline-block"
		>
			<polyline fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" points={points} />
		</svg>
	);
}

export function DataRenderer({ preview }: DataRendererProps): JSX.Element {
	if (!preview || (preview.headlines.length === 0 && !preview.charts?.length)) {
		return (
			<section aria-label="Data metrics">
				<p className="text-sm text-[var(--text-tertiary)] italic">No metrics available.</p>
			</section>
		);
	}

	return (
		<section aria-label="Data metrics">
			{preview.headlines.length > 0 && (
				<div className="flex flex-wrap gap-3 mb-3">
					{preview.headlines.map((h) => (
						<div key={h.label} className="flex flex-col">
							<span className="text-[11px] font-mono uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
								{h.label}
							</span>
							<span className="text-base font-semibold text-[var(--text-primary)] tabular-nums">
								{h.value}
							</span>
						</div>
					))}
				</div>
			)}
			{preview.rows && preview.rows.length > 0 && (
				<div className="overflow-x-auto rounded-[var(--r-default)] border border-[var(--border-subtle)]">
					<table className="w-full text-sm border-collapse">
						<tbody>
							{preview.rows.map((row, ri) => (
								<tr key={ri} className="border-t border-[var(--border-subtle)]">
									{Object.entries(row).map(([k, v]) => (
										<td key={k} className="py-1 pr-3 px-2 text-[var(--text-primary)]">
											{v}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{preview.charts && preview.charts.length > 0 && (
				<div className="flex flex-col gap-2 mt-2">
					{preview.charts.map((chart) => (
						<div key={chart.label} className="flex items-center gap-2">
							<span className="text-xs text-[var(--text-tertiary)] font-mono uppercase w-32 shrink-0">
								{chart.label}
							</span>
							<Sparkline values={chart.values} label={chart.label} />
						</div>
					))}
				</div>
			)}
		</section>
	);
}
