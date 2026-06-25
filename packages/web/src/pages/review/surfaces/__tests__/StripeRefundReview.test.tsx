/**
 * AL5 — StripeRefundReview component tests (WARN-1 AL7 preservation).
 *
 * Covers:
 *   Architecture §2.1 WARN-1: surface forwards status/outcome/proposedCall so the
 *     AL7 OutcomeBand (granted/executed/failed) still renders inside the wrapped surface.
 *   Architecture §6 step 8: AL7-preservation proof — OutcomeBand testid present in
 *     granted/executed/failed states AND through the degrade path.
 *   Invariant #4: wrap preserves the base canvas's behavior incl. AL7.
 *   Invariant #5: surface never mutates verdict/action/gate (presentational only).
 *
 * RED PHASE: StripeRefundReview does not exist yet. All tests fail at import.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StripeRefundReview } from "../stripe-refund-review/StripeRefundReview.js";
import { SurfaceBoundary } from "../SurfaceBoundary.js";
import type { ActionOperationPayload, ReviewArtifact } from "../../review-artifact.js";
import type { ProposedCallOutcomeView, ProposedCallView } from "../../review-composition.js";
import type { ProposedCallStatus } from "@hyperidle/shared";

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
		// Architecture §6 step 8: render in granted state → AL7 band is present.
		// The executing band has aria-label="executing" on the spinner.
		render(
			<StripeRefundReview
				artifact={STRIPE_ARTIFACT}
				status="granted"
				outcome={undefined}
				proposedCall={PROPOSED_CALL}
			/>,
		);
		// The ExecutingBand has aria-label="executing" span.
		expect(screen.getByLabelText("executing")).toBeInTheDocument();
	});

	it("renders the 'executed' outcome band when status='executed' and outcome provided", () => {
		// Architecture §6 step 8: executed state → OutcomeBand with receipt renders.
		render(
			<StripeRefundReview
				artifact={STRIPE_ARTIFACT}
				status="executed"
				outcome={OK_OUTCOME}
				proposedCall={PROPOSED_CALL}
			/>,
		);
		// OutcomeBand contains "Executed" label + receipt text.
		expect(screen.getAllByText(/executed/i).length).toBeGreaterThan(0);
		expect(screen.getByText(OK_OUTCOME.receipt!)).toBeInTheDocument();
	});

	it("renders the 'failed' outcome band when status='failed' and outcome provided", () => {
		// Architecture §6 step 8: failed state → OutcomeBand with error text renders.
		render(
			<StripeRefundReview
				artifact={STRIPE_ARTIFACT}
				status="failed"
				outcome={FAILED_OUTCOME}
				proposedCall={PROPOSED_CALL}
			/>,
		);
		// OutcomeBand contains "Execution failed" and the verbatim error.
		expect(screen.getByText(/Execution failed/i)).toBeInTheDocument();
		// The error text (which contains newlines) must be rendered un-truncated.
		expect(screen.getByText(/card_declined/)).toBeInTheDocument();
	});

	it("does NOT render the executing or outcome band when status='captured' (default AL2 view)", () => {
		// When status=captured (or undefined), the AL2 canvas renders unchanged — no band shown.
		render(
			<StripeRefundReview
				artifact={STRIPE_ARTIFACT}
				status="captured"
				outcome={undefined}
				proposedCall={PROPOSED_CALL}
			/>,
		);
		// No executing spinner, no outcome bands.
		expect(screen.queryByLabelText("executing")).not.toBeInTheDocument();
		expect(screen.queryByText(/Execution failed/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Executed/i)).not.toBeInTheDocument();
	});
});

// ── WARN-1 AL7-preservation through the degrade (throw→base) path ─────────────

describe("AL5 StripeRefundReview — WARN-1: degrade path also preserves AL7 OutcomeBand", () => {
	it("degrade path (surface throws) → base canvas still shows AL7 OutcomeBand", () => {
		// Architecture §4.3: the fallback path renders the base ReviewActionOperation with
		// the SAME AL7 props, so degrade preserves the OutcomeBand.
		//
		// Test strategy: construct the fallback element that SurfaceBoundary would render
		// (the base canvas with AL7 props), and assert the outcome band is present.
		// This mirrors what the render site (§4.3) does: fallback = base canvas with same props.
		const { ReviewActionOperation } = require("../../ReviewActionOperation.js") as {
			ReviewActionOperation: React.ComponentType<{
				artifact: typeof STRIPE_ARTIFACT;
				status: ProposedCallStatus;
				outcome: ProposedCallOutcomeView;
				proposedCall?: ProposedCallView;
			}>;
		};

		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		try {
			// ThrowingVariant: a StripeRefundReview that throws — simulating a broken surface.
			function ThrowingVariant(): never {
				throw new Error("Simulated surface failure");
			}

			// The fallback = base ReviewActionOperation with AL7 props (as per §4.3).
			const fallbackEl = (
				<ReviewActionOperation
					artifact={STRIPE_ARTIFACT}
					status="executed"
					outcome={OK_OUTCOME}
					proposedCall={PROPOSED_CALL}
				/>
			);

			render(<SurfaceBoundary fallback={fallbackEl}><ThrowingVariant /></SurfaceBoundary>);

			// The base canvas's OutcomeBand must render in the degrade path.
			expect(screen.getAllByText(/executed/i).length).toBeGreaterThan(0);
			expect(screen.getByText(OK_OUTCOME.receipt!)).toBeInTheDocument();
		} finally {
			spy.mockRestore();
		}
	});
});

// ── Surface renders its Stripe-specific content (proof vehicle) ────────────────

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

	it("renders without crashing when no proposedCall is provided", () => {
		// The proposedCall prop is optional — the surface should not break without it.
		render(
			<StripeRefundReview
				artifact={STRIPE_ARTIFACT}
				status="captured"
			/>,
		);
		expect(screen.getByText(STRIPE_ARTIFACT.title)).toBeInTheDocument();
	});
});

// ── Invariant #5: surface never mutates verdict/action/gate ──────────────────

describe("AL5 StripeRefundReview — invariant #5: lens, never the decision", () => {
	it("does not expose its own approve/reject actions (uses base canvas actions)", () => {
		// The surface wraps ReviewActionOperation; it does not add its own action path.
		// The base canvas's Approve/Reject buttons come from ReviewActionOperation.
		render(
			<StripeRefundReview
				artifact={STRIPE_ARTIFACT}
				status="captured"
				proposedCall={PROPOSED_CALL}
			/>,
		);
		// The base canvas provides the Approve/Reject affordance.
		// Surface does not introduce a second Approve button.
		const approveButtons = screen.queryAllByRole("button", { name: /approve/i });
		// Either 0 or 1 approve button — never MORE than 1 (no duplicate action path).
		expect(approveButtons.length).toBeLessThanOrEqual(1);
	});
});
