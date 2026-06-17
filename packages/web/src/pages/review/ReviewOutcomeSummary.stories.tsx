// AL1 — ReviewOutcomeSummary stories. Two examples prove the frame is
// FUNCTION-AGNOSTIC: a Finance close and a Support sweep render through the
// same lead with the same 3-layer grammar (L1 glance → L2 readiness → L3 jump).

import type { JSX } from "react";
import { ReviewOutcomeSummary } from "./ReviewOutcomeSummary";

export default {
	title: "Review/Outcome Summary",
	group: "Conversations" as const,
};

// ── Example A — Finance close (agent Atlas · QuickBooks + Stripe) ──────────────
export const FinanceClose = (): JSX.Element => (
	<div className="bg-[var(--surface-page)] p-[24px]">
		<ReviewOutcomeSummary
			agentName="Atlas"
			agentInitials="AT"
			reviewerName="You"
			achieved="Reconciled the operating account and tied May revenue; 4 items need you before close."
			tools={["quickbooks", "stripe"]}
			costUsd={3.18}
			tokens={184200}
			standing="Blocking"
			doneConditions={[
				{
					label: "Bank feed reconciled to ledger (312 transactions)",
					met: true,
					jumpLabel: "reconciliation",
				},
				{
					label: "May revenue tied to Stripe payouts (Σ = control)",
					met: true,
					jumpLabel: "revenue-tieout",
				},
				{ label: "All journal entries posted and approved", met: true, jumpLabel: "journals" },
				{
					label: "Zero unexplained variances",
					met: false,
					note: "2 variances remain: a $9,840 inbound wire with no matching invoice and a $4,200 duplicate ACH.",
					jumpLabel: "variances",
				},
			]}
			needsYou={[
				{
					category: "unhandled-exception",
					severity: "error",
					detail: "$9,840 inbound wire on May 28 has no matching invoice or source — could not classify.",
					jumpLabel: "variances",
				},
				{
					category: "over-authority",
					severity: "warning",
					detail: "$4,200 duplicate ACH exceeds the $2,000 auto-resolve limit — needs your sign-off to void.",
					jumpLabel: "duplicate-ach",
				},
			]}
			onJump={() => {}}
		/>
	</div>
);

// ── Example B — Support sweep (agent Atlas · Zendesk + Slack) ──────────────────
export const SupportSweep = (): JSX.Element => (
	<div className="bg-[var(--surface-page)] p-[24px]">
		<ReviewOutcomeSummary
			agentName="Atlas"
			agentInitials="AT"
			reviewerName="You"
			achieved="Cleared 41 overnight tickets — 18 auto-resolved, 19 drafted, 4 flagged."
			tools={["zendesk", "slack"]}
			costUsd={1.92}
			tokens={96400}
			standing="Blocking"
			doneConditions={[
				{ label: "All 41 overnight tickets triaged", met: true, jumpLabel: "triage" },
				{
					label: "18 known-issue tickets auto-resolved (Checkout-500 macro)",
					met: true,
					jumpLabel: "auto-resolved",
				},
				{ label: "19 replies drafted and queued", met: true, jumpLabel: "drafts" },
				{
					label: "No high-value account left unaddressed",
					met: false,
					note: "1 enterprise renewal (Northwind, $48k) is at churn risk and needs a human reply.",
					jumpLabel: "flagged",
				},
			]}
			needsYou={[
				{
					category: "irreversible",
					severity: "error",
					detail: "Northwind ($48k renewal) threatened to churn — reply ships to the account owner, not reversible.",
					jumpLabel: "flagged",
				},
				{
					category: "over-authority",
					severity: "warning",
					detail: "$180 goodwill refund requested exceeds the agent's $50 limit — approve to issue.",
					jumpLabel: "refund",
				},
			]}
			onJump={() => {}}
		/>
	</div>
);
