// AL1 review canvas #8 — ReviewBatch story.
// Populated is the default: L1 rollup + the 4 flagged pinned (red) + the 18/19
// routine collapsed to two group rows, with the top flagged item ($48k churn
// threat) expanded to its L3 context+reply so the drill-down reads in one frame.

import type { JSX } from "react";
import { MOCK_REVIEW_SUBJECT } from "./__fixtures__/review-subject.fixture";
import { ReviewBatch } from "./ReviewBatch";

export default { title: "Review/Batch", group: "Conversations" };

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find((a) => a.kind === "batch")!;

export function Populated(): JSX.Element {
	return (
		<div className="p-[24px] bg-[var(--surface-page)] min-h-screen">
			<ReviewBatch artifact={artifact} />
		</div>
	);
}
