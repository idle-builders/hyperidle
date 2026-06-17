// AL1 — composition VARIANT B: "Outline + Stage". The whole review as a persistent
// outline (left) you pivot through + a big stage (right) where the selected artifact
// opens full-size. Default selection = the code artifact → the REAL <ReviewCodeDiff />.
//
// Full-height story: wrap in 100vh flex so the rail scrolls independently of the stage
// and the pinned verdict block sits at the rail bottom.

import type { JSX } from "react";
import { ReviewCompositionStage } from "./ReviewCompositionStage";

export default { title: "Review/Composition — Stage", group: "Conversations" };

export function Populated(): JSX.Element {
	return (
		<div style={{ height: "100vh", display: "flex" }}>
			<ReviewCompositionStage />
		</div>
	);
}
