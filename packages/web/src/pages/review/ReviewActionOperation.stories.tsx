// AL1 review canvas #3 — story.
// Presentational isolation: callbacks no-op, local useState owns the L3 expand.
// Renders L1 (action + amount + irreversible) + L2 (receipt) with L3
// (blast-radius + reversibility + verdict gate) expanded so the 3-layer
// drill-down reads in a single screenshot.

import type { JSX } from "react";
import { ReviewActionOperation } from "./ReviewActionOperation";

export default {
	title: "Review/Action Operation",
	group: "Conversations",
};

function noop(): void {}

export function Populated(): JSX.Element {
	return (
		<div className="bg-[var(--surface-page)] p-[24px]">
			<ReviewActionOperation onApprove={noop} onReject={noop} />
		</div>
	);
}
