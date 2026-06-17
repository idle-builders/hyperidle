// AL1 — composition, REFINED (round 3). Two states of the converged review:
//   Overview   — the whole review, right pane CLOSED, center full-width.
//   Examining  — the right pane OPEN on the code artifact, center narrowed. The pane
//                renders the REAL <ReviewCodeDiff /> + the conversation anchored to it.
//
// Full-height story: wrap in 100vh flex so the center scrolls independently of the pane.

import type { JSX } from "react";
import { ReviewCompositionRefined } from "./ReviewCompositionRefined.js";

export default { title: "Review/Composition — Refined", group: "Conversations" };

export function Overview(): JSX.Element {
	return (
		<div style={{ height: "100vh", display: "flex" }}>
			<ReviewCompositionRefined />
		</div>
	);
}

export function Examining(): JSX.Element {
	return (
		<div style={{ height: "100vh", display: "flex" }}>
			<ReviewCompositionRefined initialOpenArtifactId="a_code" />
		</div>
	);
}
