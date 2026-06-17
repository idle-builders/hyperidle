// AL1 — composition variant A "Briefing" story. Renders ONE whole review as a single
// ~860px reading column: frame → outcome → artifact stack (code row expanded into the
// real <ReviewCodeDiff /> inline) → conversation → pinned verdict bar. Wrapped at
// 100vh so the sticky verdict bar anchors to the viewport bottom in the viewer.
// Presentational isolation: no router/context/providers.

import type { JSX } from "react";
import { ReviewCompositionBriefing } from "./ReviewCompositionBriefing";

export default { title: "Review/Composition — Briefing", group: "Conversations" };

export function Populated(): JSX.Element {
	return (
		<div style={{ height: "100vh" }}>
			<ReviewCompositionBriefing />
		</div>
	);
}
