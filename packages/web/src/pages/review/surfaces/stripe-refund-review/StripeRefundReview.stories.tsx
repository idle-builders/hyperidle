/**
 * AL5 — StripeRefundReview stories.
 *
 * Renders the Stripe Refund Review surface against its sample fixture.
 * This is the preview surface used by the browse dialog's iframe (:8098).
 * The manifest.sampleFixture references "stripe-refund" — the story name
 * used to discover this variant in the `:8098` TSX viewer.
 *
 * Stories cover the four key states the WARN-1 AL7-preservation proof
 * checks: no-outcome (captured), granted (executing), executed (ok outcome),
 * failed (failed outcome).
 *
 * Per design doc: shows refund-specific lead (Charge, Customer) + routing note.
 * Slot overrides are visible only in the "non-base" surface (this component).
 */

import type { JSX } from "react";
import type { ActionOperationPayload, ReviewArtifact } from "../../review-artifact.js";
import type { ProposedCallOutcomeView, ProposedCallView } from "../../review-composition.js";
import { StripeRefundReview } from "./StripeRefundReview.js";

export default {
	title: "StripeRefundReview",
	group: "Surfaces" as const,
};

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const STRIPE_ARTIFACT: ReviewArtifact<ActionOperationPayload> = {
	id: "artifact:stripe-refund:1",
	tool: "stripe",
	app: "Stripe",
	sourceHref: "https://dashboard.stripe.com/refunds/re_test",
	title: "Refund payment · ch_3Qspee…",
	kind: "action_operation",
	payload: {
		verb: "Refund payment",
		amountWire: { currency: "USD", units: 124000, formatted: "$1,240.00" },
		irreversible: true,
		reversible: false,
		blastRadius: ["Affects 1 customer, 1 charge."],
		receiptFields: [
			{ label: "Charge", value: "ch_3Qspee2eZvKYlo2C0kCXqKjq" },
			{ label: "Customer", value: "cus_Rdk4p2Y5s82G5P" },
		],
	},
};

const PROPOSED_CALL: ProposedCallView = {
	proposedCallId: "pc-stripe-refund-1",
	toolId: "stripe.refunds.create",
	args: {
		charge: "ch_3Qspee2eZvKYlo2C0kCXqKjq",
		amount: 124000,
		reason: "duplicate",
	},
	status: "captured",
};

const OK_OUTCOME: ProposedCallOutcomeView = {
	status: "ok",
	receipt: "re_3Qsq1aJ2a7kLmN0p · refunded",
	executedAt: "2 min ago",
};

const FAILED_OUTCOME: ProposedCallOutcomeView = {
	status: "failed",
	error: "Stripe error: card_declined\nYour card was declined.\nDecline code: card_not_supported",
	executedAt: "1 min ago",
};

// ---------------------------------------------------------------------------
// Stories — the four WARN-1 states
// ---------------------------------------------------------------------------

export const Default = (): JSX.Element => (
	<div className="w-[600px] bg-[var(--surface-page)]" style={{ fontFamily: "var(--font-sans)" }}>
		<StripeRefundReview
			artifact={STRIPE_ARTIFACT}
			status={undefined}
			outcome={undefined}
			proposedCall={PROPOSED_CALL}
		/>
	</div>
);
Default.storyName = "Stripe Refund Review — Captured (awaiting approval)";

export const Executing = (): JSX.Element => (
	<div className="w-[600px] bg-[var(--surface-page)]" style={{ fontFamily: "var(--font-sans)" }}>
		<StripeRefundReview
			artifact={STRIPE_ARTIFACT}
			status="granted"
			outcome={undefined}
			proposedCall={PROPOSED_CALL}
		/>
	</div>
);
Executing.storyName = "Stripe Refund Review — Executing (granted)";

export const Executed = (): JSX.Element => (
	<div className="w-[600px] bg-[var(--surface-page)]" style={{ fontFamily: "var(--font-sans)" }}>
		<StripeRefundReview
			artifact={STRIPE_ARTIFACT}
			status="executed"
			outcome={OK_OUTCOME}
			proposedCall={{ ...PROPOSED_CALL, status: "executed" }}
		/>
	</div>
);
Executed.storyName = "Stripe Refund Review — Executed (ok outcome)";

export const Failed = (): JSX.Element => (
	<div className="w-[600px] bg-[var(--surface-page)]" style={{ fontFamily: "var(--font-sans)" }}>
		<StripeRefundReview
			artifact={STRIPE_ARTIFACT}
			status="failed"
			outcome={FAILED_OUTCOME}
			proposedCall={{ ...PROPOSED_CALL, status: "failed" }}
		/>
	</div>
);
Failed.storyName = "Stripe Refund Review — Execution failed";
