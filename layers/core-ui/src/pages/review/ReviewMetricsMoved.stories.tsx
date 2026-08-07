import type { JSX } from "react";
import { MOCK_REVIEW_SUBJECT } from "./__fixtures__/review-subject.fixture";
import { ReviewMetricsMoved } from "./ReviewMetricsMoved";

export default { title: "Review/Metrics Moved", group: "Conversations" };

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find((a) => a.kind === "metrics_moved")!;

// Default: L1 headlines (materiality-sorted) + L2 roll-forward/tie-out. The
// fixture drives the canvas via the AL2 review-artifact contract.
export function Populated(): JSX.Element {
	return <ReviewMetricsMoved artifact={artifact} />;
}
