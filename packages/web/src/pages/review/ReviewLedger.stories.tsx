// AL1 Variant C — The Reasoning Ledger stories.
//
// Populated proves the signature: a confidence-sorted Decision Ledger (45%
// partial-refund row first, hot meter), that row expanded showing the real diff
// + Robin's anchored blocking comment, the Intent checklist + Needs-attention +
// Subject artifacts in the right rail, and the sticky verdict bar on top.

import type { JSX } from "react";
import { ReviewLedger } from "./ReviewLedger.js";

// group: a Review is a conversation over a Subject (IA §D) → Conversations domain.
// `pages/review/` carries no path-derived group, so this escape-hatch is required.
export default { title: "Page: Review/C — Reasoning Ledger", group: "Conversations" };

/** Default awaiting-verdict view: confidence-ascending, the 45% row expanded. */
export function Populated(): JSX.Element {
	return <ReviewLedger initialSort="confidence" initialExpanded="r2" state="populated" />;
}

/** Risk-only filter: the ledger collapses to just the risk-flagged decision. */
export function RiskOnly(): JSX.Element {
	return <ReviewLedger initialSort="risk" initialExpanded="r2" state="populated" />;
}

/** Human-authored work: no rationale — fall back to the artifact list. */
export function NoRationale(): JSX.Element {
	return <ReviewLedger state="no-rationale" />;
}
