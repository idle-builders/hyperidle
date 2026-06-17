// AL1 — Variant C "Focus-flow" composition story. Two pinned surfaces of ONE whole
// review so the founder sees both states of the drill-and-return rhythm:
//   Home  — the scannable ~820px review home (frame → outcome → intent → needs-you →
//           Artifacts·4 collapsed rows → verdict bar). Approvable at a glance.
//   Focus — the full-screen focus open on the code artifact (the real <ReviewCodeDiff />
//           at full size + a conversation rail anchored to it + a compact verdict bar).
//
// Both wrap in a 100vh box so the focus surface reads at true full-screen scale.
// Home → Focus also works INTERACTIVELY (click any "Examine →" row); these exports
// just pin each state for the side-by-side review. Presentational isolation only.

import type { JSX } from "react";
import { ReviewCompositionFocus } from "./ReviewCompositionFocus";

export default { title: "Review/Composition — Focus", group: "Conversations" };

/** The collapsed, scannable review home — fully approvable without opening anything. */
export function Home(): JSX.Element {
	return (
		<div style={{ height: "100vh" }}>
			<ReviewCompositionFocus />
		</div>
	);
}

/** The full-screen focus open on the code artifact (index 0 = the real ReviewCodeDiff). */
export function Focus(): JSX.Element {
	return (
		<div style={{ height: "100vh" }}>
			<ReviewCompositionFocus initialFocusIndex={0} />
		</div>
	);
}
