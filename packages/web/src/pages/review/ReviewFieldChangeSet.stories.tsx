// AL1 review canvas #2 — story. Renders the field change-set on its Salesforce
// fixture with the Amount (needs-you) row expanded by default, so all three
// layers are visible in a single static render:
//   L1 header summary · L2 before→after field grid · L3 the expanded source line.

import type { JSX } from "react";
import { ReviewFieldChangeSet } from "./ReviewFieldChangeSet";

export default {
	title: "Review/Field Change-Set",
	group: "Conversations",
};

export function Populated(): JSX.Element {
	return (
		<div className="min-h-screen p-[24px]" style={{ background: "var(--surface-page)" }}>
			<ReviewFieldChangeSet />
		</div>
	);
}
