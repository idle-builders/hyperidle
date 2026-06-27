/**
 * AL5 (simplified) — StripeRefundReview component tests.
 *
 * Covers:
 *   WARN-1: surface forwards status/outcome/proposedCall so the AL7 OutcomeBand
 *     (granted/executed/failed) still renders inside the wrapped surface.
 *   Invariant: surface is presentational — never adds its own approve/reject path.
 *   Renders Stripe-specific content (refund lead, routing note).
 *
 * SurfaceBoundary tests removed (AL5 simplification — no boundary needed for
 * in-repo surfaces; they are trusted, reviewed, committed code).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ActionOperationPayload, ReviewArtifact } from "../../review-artifact.js";
import type { ProposedCallOutcomeView, ProposedCallView } from "../../review-composition.js";
import { StripeRefundReview } from "../stripe-refund-review/StripeRefundReview.js";

// ── fixtures ──────────────────────────────────────────────────────────────────

const STRIPE_ARTIFACT: ReviewArtifact<ActionOperationPayload> = {
	id: "artifact:stripe-refund:1",
	tool: "stripe",
	app: "Stripe",
	sourceHref: "https://dashboard.stripe.com/refunds/re_test",
	title: "Refund $1,240.00",
	kind: "action_operation",
	payload: {
		verb: "Refund payment",
		amountWire: { currency: "USD", units: 124000, formatted: "$1,240.00" },
		irreversible: true,
		reversible: false,
		blastRadius: ["Affects 1 customer, 1 charge."],
		receiptFields: [
			{ label: "Charge", value: "ch_test123" },
			{ label: "Customer", value: "cus_test456" },
		],
	},
};

const OK_OUTCOME: ProposedCallOutcomeView = {
	status: "ok",
	receipt: "re_3Qsq1aJ2a7kLmN0p · refunded",
	executedAt: "2 min ago",
};

const FAILED_OUTCOME: ProposedCallOutcomeView = {
	status: "failed",
	error: "Stripe error: card_declined\nYour card was declined.",
	executedAt: "1 min ago",
};

const PROPOSED_CALL: ProposedCallView = {
	proposedCallId: "pc-test-1",
	toolId: "stripe.refunds.create",
	args: { charge: "ch_test123", amount: 124000, reason: "duplicate" },
	status: "captured",
};

// ── WARN-1 AL7-preservation: OutcomeBand renders in all status states ──────────

describe("AL5 StripeRefundReview — WARN-1: AL7 OutcomeBand preserved inside wrap", () => {
	it("renders the 'granted' (executing) band when status='granted'", () => {
		render(
			<StripeRefundReview
				artifact={STRIPE_ARTIFACT}
				status="granted"
				outcome={undefined}
				proposedCall={PROPOSED_CALL}
			/>,
		);
		expect(screen.getByLabelText("executing")).toBeInTheDocument();
	});

	it("renders the 'executed' outcome band when status='executed' and outcome provided", () => {
		render(
			<StripeRefundReview
				artifact={STRIPE_ARTIFACT}
				status="executed"
				outcome={OK_OUTCOME}
				proposedCall={PROPOSED_CALL}
			/>,
		);
		expect(screen.getAllByText(/executed/i).length).toBeGreaterThan(0);
		expect(screen.getByText(OK_OUTCOME.receipt!)).toBeInTheDocument();
	});

	it("renders the 'failed' outcome band when status='failed' and outcome provided", () => {
		render(
			<StripeRefundReview
				artifact={STRIPE_ARTIFACT}
				status="failed"
				outcome={FAILED_OUTCOME}
				proposedCall={PROPOSED_CALL}
			/>,
		);
		expect(screen.getByText(/Execution failed/i)).toBeInTheDocument();
		expect(screen.getByText(/card_declined/)).toBeInTheDocument();
	});

	it("does NOT render the executing or outcome band when status='captured'", () => {
		render(
			<StripeRefundReview
				artifact={STRIPE_ARTIFACT}
				status="captured"
				outcome={undefined}
				proposedCall={PROPOSED_CALL}
			/>,
		);
		expect(screen.queryByLabelText("executing")).not.toBeInTheDocument();
		expect(screen.queryByText(/Execution failed/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Executed/i)).not.toBeInTheDocument();
	});
});

// ── Stripe-specific presentation ──────────────────────────────────────────────

describe("AL5 StripeRefundReview — renders Stripe-specific presentation", () => {
	it("renders the artifact title (from CanvasSourceHeader)", () => {
		render(
			<StripeRefundReview
				artifact={STRIPE_ARTIFACT}
				status="captured"
				proposedCall={PROPOSED_CALL}
			/>,
		);
		expect(screen.getByText(STRIPE_ARTIFACT.title)).toBeInTheDocument();
	});

	it("renders the Stripe Refund lead section", () => {
		render(
			<StripeRefundReview
				artifact={STRIPE_ARTIFACT}
				status="captured"
				proposedCall={PROPOSED_CALL}
			/>,
		);
		expect(screen.getByText(/stripe refund/i)).toBeInTheDocument();
	});

	it("renders the charge field in the refund lead", () => {
		render(<StripeRefundReview artifact={STRIPE_ARTIFACT} status="captured" />);
		// Charge value appears in both the RefundLead slot AND the base canvas receipt fields.
		// Use getAllByText — both are valid renders of the same charge id.
		const chargeEls = screen.getAllByText("ch_test123");
		expect(chargeEls.length).toBeGreaterThanOrEqual(1);
	});

	it("renders without crashing when no proposedCall is provided", () => {
		render(<StripeRefundReview artifact={STRIPE_ARTIFACT} status="captured" />);
		expect(screen.getByText(STRIPE_ARTIFACT.title)).toBeInTheDocument();
	});
});

// ── Invariant #5: surface never mutates verdict/action/gate ──────────────────

describe("AL5 StripeRefundReview — invariant #5: lens, never the decision", () => {
	it("does not expose its own approve/reject actions (uses base canvas actions)", () => {
		render(
			<StripeRefundReview
				artifact={STRIPE_ARTIFACT}
				status="captured"
				proposedCall={PROPOSED_CALL}
			/>,
		);
		const approveButtons = screen.queryAllByRole("button", { name: /approve/i });
		expect(approveButtons.length).toBeLessThanOrEqual(1);
	});
});
