// AL1 — ReviewOutcomeSummary stories. Two examples prove the frame is
// FUNCTION-AGNOSTIC: a Finance close and a Support sweep render through the
// same lead with the same 3-layer grammar (L1 glance → L2 readiness → L3 jump).

import type { JSX } from "react";
import { MOCK_REVIEW_SUBJECT } from "./__fixtures__/review-subject.fixture";
import { ReviewOutcomeSummary } from "./ReviewOutcomeSummary";
import type { ReviewArtifact } from "./review-artifact";

export default {
	title: "Review/Outcome Summary",
	group: "Conversations" as const,
};

const baseOutcomeArtifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "outcome_summary",
)!;

// ── Example A — Finance close (agent Atlas · QuickBooks + Stripe) ──────────────
export const FinanceClose = (): JSX.Element => (
	<div className="bg-[var(--surface-page)] p-[24px]">
		<ReviewOutcomeSummary artifact={baseOutcomeArtifact} />
	</div>
);

// ── Example B — Support sweep (agent Atlas · Zendesk + Slack) ──────────────────
export const SupportSweep = (): JSX.Element => {
	const artifact: ReviewArtifact = {
		...baseOutcomeArtifact,
		id: "artifact:outcome:support",
		title: "Overnight support triage",
		tool: "zendesk",
		app: "Zendesk",
		payload: {
			...((baseOutcomeArtifact.payload as Record<string, unknown>) ?? {}),
			agentName: "Atlas",
			agentInitials: "AT",
			reviewerName: "You",
			achieved: "Cleared 41 overnight tickets — 18 auto-resolved, 19 drafted, 4 flagged.",
			tools: ["zendesk", "slack"],
			tokens: 96400,
			standing: "Blocking",
		},
	};
	return (
		<div className="bg-[var(--surface-page)] p-[24px]">
			<ReviewOutcomeSummary artifact={artifact} />
		</div>
	);
};
