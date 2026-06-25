/**
 * AL5 — Stripe Refund Review surface.
 *
 * WRAP: renders action_operation via ReviewActionOperation, overriding `lead`
 * (refund-specific summary) and `footer` (routing note). ALL AL7 trust-first
 * props (status/outcome/proposedCall) are forwarded so the OutcomeBand
 * (granted/executed/failed) renders inside the wrapped surface.
 *
 * AC5: this surface adds NO network calls, fetch, or mutations. The refund's
 * execute path is the existing review→verdict→AL7→broker→connection chain.
 * This component is purely presentational — a lens, never a decision.
 */

import type { JSX } from "react";
import {
	type ActionOperationCanvasProps,
	ReviewActionOperation,
} from "../../ReviewActionOperation.js";

// ── Stripe-specific slot overrides ──────────────────────────────────────────

/**
 * Lead override: refund-specific summary above the main receipt.
 * Shows the refund id, charge, customer in a structured summary row.
 * Falls back gracefully if payload fields are absent.
 */
function RefundLead({
	payload,
}: {
	readonly payload: ActionOperationCanvasProps["artifact"]["payload"];
}): JSX.Element {
	const receiptFields = payload?.receiptFields ?? [];
	const charge = receiptFields.find((f) => f.label === "Charge")?.value;
	const customer = receiptFields.find((f) => f.label === "Customer")?.value;

	return (
		<div
			className="mx-[18px] flex flex-col gap-[6px] border px-[12px] py-[9px]"
			style={{
				borderRadius: "var(--r-subtle)",
				borderColor: "var(--border-subtle)",
				background: "var(--surface-elevated)",
			}}
		>
			<div className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
				Stripe Refund
			</div>
			{charge ? (
				<div className="flex items-baseline gap-[6px]">
					<span className="text-[12px] text-[var(--text-tertiary)]">Charge</span>
					<span
						className="font-[var(--font-mono)] text-[13px] text-[var(--text-primary)]"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{charge}
					</span>
				</div>
			) : null}
			{customer ? (
				<div className="flex items-baseline gap-[6px]">
					<span className="text-[12px] text-[var(--text-tertiary)]">Customer</span>
					<span
						className="font-[var(--font-mono)] text-[13px] text-[var(--text-primary)]"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{customer}
					</span>
				</div>
			) : null}
		</div>
	);
}

/**
 * Footer routing note: informs the reviewer that approval goes through the
 * existing Stripe connection (not a separate action path).
 *
 * AC5: This note is purely informational. The actual execution path is the
 * existing review→verdict→AL7→broker→connection chain — unchanged.
 */
function RefundRoutingNote(): JSX.Element {
	return (
		<div
			className="mx-[18px] mb-[12px] flex items-center gap-[6px] px-[12px] py-[6px]"
			style={{
				borderRadius: "var(--r-subtle)",
				background: "var(--surface-elevated)",
			}}
		>
			<span className="text-[12px] text-[var(--text-tertiary)]">
				Approving sends the refund via your Stripe connection.
			</span>
		</div>
	);
}

// ── Surface component ─────────────────────────────────────────────────────────

/**
 * StripeRefundReview — wraps ReviewActionOperation with Stripe-specific
 * presentation overrides.
 *
 * @lore AL5 WARN-1: ALL AL7 props (status/outcome/proposedCall) are forwarded.
 * Dropping these would silently remove the OutcomeBand (granted/executed/failed).
 * The surface is a lens — it adds presentation but delegates all trust decisions
 * and execution to the base canvas path.
 */
export function StripeRefundReview(props: ActionOperationCanvasProps): JSX.Element {
	const { artifact, status, outcome, proposedCall } = props;

	return (
		<ReviewActionOperation
			artifact={artifact}
			status={status} // ← forwarded — OutcomeBand must render in the wrap
			outcome={outcome} // ← forwarded
			proposedCall={proposedCall} // ← forwarded — verbatim args panel
			slots={{
				lead: <RefundLead payload={artifact.payload} />,
				footer: (
					<>
						<RefundRoutingNote />
					</>
				),
			}}
		/>
	);
}
