// AL7 — Review execution loop · the outcome band design variant.
// Extends the AL2 action-operation canvas with the post-commit Operation Outcome
// (spec: docs/process-layer/staged-operation.md). Renders ONLY the
// populated terminal states the reviewer must read — executed (ok) and failed —
// plus the unchanged pending canvas for continuity. No skeleton/loading states
// (those are build concerns). DESIGN-CLASS: routine.

import type { JSX } from "react";
import { ReviewActionOperation } from "./ReviewActionOperation";
import type { ActionOperationPayload } from "./review-artifact";

export default {
	title: "Review/Action Operation — Execution Outcome (AL7)",
	group: "Conversations",
};

const REFUND_PAYLOAD: ActionOperationPayload = {
	verb: "Refund payment",
	amountWire: { currency: "USD", units: 124000, formatted: "$1,240.00" },
	irreversible: true,
	reversible: false,
	blastRadius: [
		"Affects 1 customer, 1 charge.",
		"Reverses the ledger entry on the May close (revenue −$1,240.00).",
		"Emails a Stripe refund receipt to billing@northwind-logistics.com.",
	],
	receiptFields: [
		{ label: "Charge", value: "ch_3QspeeJ2a7kLmN0p" },
		{ label: "Customer", value: "cus_PnWq8xR2vTbA1c" },
		{ label: "Reason", value: "duplicate" },
		{ label: "Idempotency key", value: "refund_2026_INV4471_dup" },
		{ label: "Net after refund", value: "$0.00" },
	],
};

const artifact = {
	id: "artifact:action:1",
	kind: "action_operation" as const,
	title: "Refund INV-4471",
	tool: "stripe",
	app: "Stripe",
	sourceHref: "https://dashboard.stripe.com/payments/ch_3QspeeJ2a7kLmN0p",
	payload: REFUND_PAYLOAD,
};

// Terminal state 1 — executed: the calm success band proves the refund happened
// (the tool's return identity + when), tied back to the same idempotency key the
// at-most-once guard dedupes on.
export function Executed(): JSX.Element {
	return (
		<div className="bg-[var(--surface-page)] p-[24px]">
			<ReviewActionOperation
				artifact={artifact}
				status="executed"
				outcome={{
					status: "ok",
					receipt: "re_3Qsq1aJ2a7kLmN0p · refunded",
					executedAt: "2026-06-23 14:02",
				}}
			/>
		</div>
	);
}

// Terminal state 2 — failed: the loud failure band surfaces the tool's error
// verbatim and never as a toast. Hard rule #8 — failure surfaces, never silently
// swallowed; persists on the canvas across re-open.
//
// Design finding #5: the error is realistic + multi-line — a real Stripe API response
// includes the error code, a human-readable message, the request-id, and a stack
// trace. whitespace-pre-wrap + break-words ensures every line is readable;
// never truncated (`no truncate` per rule #8). This variant proves the layout
// holds on real tool error bodies.
export function Failed(): JSX.Element {
	return (
		<div className="bg-[var(--surface-page)] p-[24px]">
			<ReviewActionOperation
				artifact={artifact}
				status="failed"
				outcome={{
					status: "failed",
					error:
						"Stripe API error: charge_already_refunded\n" +
						"ch_3QspeeJ2a7kLmN0p has a prior refund of $1,240.00 posted on 2026-06-22.\n" +
						"Code: charge_already_refunded\n" +
						"Request-ID: req_Km7aNpXe3fQr1vT9\n" +
						"Idempotency-Key: refund_2026_INV4471_dup\n" +
						"Doc: https://stripe.com/docs/error-codes#charge-already-refunded",
					executedAt: "2026-06-23 14:02",
				}}
			/>
		</div>
	);
}

// Continuity — the pending canvas is the already-shipped AL2 receipt, unchanged.
export function PendingUnchanged(): JSX.Element {
	return (
		<div className="bg-[var(--surface-page)] p-[24px]">
			<ReviewActionOperation artifact={artifact} />
		</div>
	);
}
