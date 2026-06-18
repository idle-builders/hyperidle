// AL1 review canvas #6 — ReviewVisualDiff story.
// Live viewer: `npm run ds:serve` (:8098) · Conversations → "Review / Visual Diff".
//
// Populated shows the full 3-layer drill-down in one frame:
//   L1 thumbnails (Design ↔ Build) + Figma logo + "3 regions differ"
//   L2 Side-by-side at-size compare (toggle to Overlay / Swipe)
//   L3 the 3 flagged region chips — click one to highlight its band on both renders.

import type { JSX } from "react";
import { MOCK_REVIEW_SUBJECT } from "./__fixtures__/review-subject.fixture";
import { ReviewVisualDiff } from "./ReviewVisualDiff";

export default { title: "Review/Visual Diff", group: "Conversations" as const };

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find((a) => a.kind === "visual_diff")!;

export function Populated(): JSX.Element {
	return (
		<div className="bg-[var(--surface-page)] p-[24px]">
			<ReviewVisualDiff artifact={artifact} />
		</div>
	);
}
