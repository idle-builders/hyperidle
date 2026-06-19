// AL1 #7 — ReviewCodeDiff story. Renders the must-win code-diff canvas on its GitHub
// PR fixture: L1 (PR header + CI checks + Collapse all) + L2 (relevance-ranked file
// cards) with the top logic file expanded to its L3 gutter diff — full drill-down in
// one frame. Presentational isolation: no router/context/providers.

import type { JSX } from "react";
import { MOCK_REVIEW_SUBJECT } from "./__fixtures__/review-subject.fixture";
import { ReviewCodeDiff } from "./ReviewCodeDiff";

export default { title: "Review/Code Diff", group: "Conversations" };

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find((a) => a.kind === "code_diff")!;

export function Populated(): JSX.Element {
	return (
		<div className="bg-[var(--surface-container)] p-[24px]">
			<ReviewCodeDiff artifact={artifact} />
		</div>
	);
}
