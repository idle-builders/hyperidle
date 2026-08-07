// AM5 — Graph / Sparkline base primitive (EXTRACT from data-renderer.tsx Sparkline SVG).
//
// Lifted from `kinds/data-renderer.tsx:28-58` — the hand-rolled `Sparkline()` SVG.
// 80×24 polyline, auto-scaled to own min/max, 1.5px `--accent-primary` stroke.
// No new tokens, no state branches.
//
// K0 purity: a base primitive is pure content — NO empty/error/loading branch.
// The composition guarantees a non-empty values array before invoking this primitive.
//
// Future chart types (bar / line / multi-series) extend off this seam — noted, deferred (K6).
//
// Used in 2+ contexts:
//   - `data` artifact (composeArtifactBody — Task 5)
//   - `metrics_moved` review delta trend display

import type { JSX } from "react";

export interface SparklineProps {
	values: ReadonlyArray<number>;
	label: string;
}

export function Sparkline({ values, label }: SparklineProps): JSX.Element {
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
