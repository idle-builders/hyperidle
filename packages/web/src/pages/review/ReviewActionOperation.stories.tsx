// AL1 review canvas #3 — story.
// Presentational isolation: callbacks no-op, local useState owns the L3 expand.
// Renders L1 (action + amount + irreversible) + L2 (receipt) with L3
// (blast-radius + reversibility + verdict gate) expanded so the 3-layer
// drill-down reads in a single screenshot.

import type { JSX } from "react";
import { MOCK_REVIEW_SUBJECT } from "./__fixtures__/review-subject.fixture";
import { ReviewActionOperation } from "./ReviewActionOperation";
import type { ActionOperationPayload, ReviewArtifact } from "./review-artifact";

export default {
	title: "Review/Action Operation",
	group: "Conversations",
};

// @lore AL5: cast needed because MOCK_REVIEW_SUBJECT.artifacts uses ReviewArtifact<unknown>;
// isActionOperationPayload() guards the payload at runtime. The canvas defaults to REFUND
// fixture when the payload doesn't match.
const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "action_operation",
)! as ReviewArtifact<ActionOperationPayload>;

export function Populated(): JSX.Element {
	return (
		<div className="bg-[var(--surface-page)] p-[24px]">
			<ReviewActionOperation artifact={artifact} />
		</div>
	);
}
