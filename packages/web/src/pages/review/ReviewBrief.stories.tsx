// AL1 — Variant A: The Verdict Brief — story variants.
//
// Populated renders with the code-diff artifact EXPANDED (nested-examine
// signature), the "Needs you" panel visible above the diff, and the pinned
// verdict bar visible. NothingNeedsYou flips the panel to the calm green
// state. Resolved collapses the verdict bar to its read-only summary.

import type { JSX } from "react";
import { ReviewBrief } from "./ReviewBrief";

export default { title: "Page: Review/A — Verdict Brief" };

function Frame({ children }: { children: JSX.Element }): JSX.Element {
	return <div style={{ height: "100vh" }}>{children}</div>;
}

export function Populated(): JSX.Element {
	return (
		<Frame>
			<ReviewBrief state="populated" initiallyExpanded={["a_code"]} />
		</Frame>
	);
}

export function NothingNeedsYou(): JSX.Element {
	return (
		<Frame>
			<ReviewBrief state="empty-needs-you" />
		</Frame>
	);
}

export function Resolved(): JSX.Element {
	return (
		<Frame>
			<ReviewBrief state="resolved" />
		</Frame>
	);
}
