import type { JSX } from "react";
import { ReviewMetricsMoved } from "./ReviewMetricsMoved";

export default { title: "Review/Metrics Moved", group: "Conversations" };

// Default: L1 headlines (materiality-sorted) + L2 roll-forward/tie-out + the revenue figure
// pre-expanded to its provenance, so all three layers are visible in one screenshot.
export function Populated(): JSX.Element {
	return <ReviewMetricsMoved />;
}

// Collapsed: same canvas, no figure expanded — L1 + L2 only (the default reviewer entry).
export function HeadlinesCollapsed(): JSX.Element {
	return <ReviewMetricsMoved initialExpandedFigureId={null} />;
}
