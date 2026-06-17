// AL1 review canvas #3 — the action / operation canvas.
//
// Proof family: a staged, PRE-COMMIT *receipt* for an irreversible side-effect
// with money attached (here: a Stripe refund). NOT a post-hoc diff — nothing has
// happened yet. The reviewer's verdict is what fires the side-effect, so money +
// reversibility must be the loudest things on the canvas.
//
// 3-layer drill-down (brief §1):
//   L1 — one glance: action headline + the AMOUNT (large, tabular) + Stripe logo +
//        an irreversible marker. You can approve/reject on L1 alone.
//   L2 — the receipt: the structured fields that define the operation (charge,
//        customer, reason, idempotency key, net-after).
//   L3 — on demand: blast-radius (what it touches) + reversibility/undo (why it's
//        irreversible) + the pre-commit Approve / Reject gate (pill buttons).
//
// Tokens by NAME only (Hearth + CP1). Money + irreversibility lean on
// --status-warning / --status-error per the brief. Brand color lives only in ToolLogo.

import { type JSX, useState } from "react";
import { ToolLogo } from "./ToolLogo";

// ── fixture ─────────────────────────────────────────────────────────────────
// A realistic Stripe refund staged for human verdict.

interface RefundField {
	readonly label: string;
	readonly value: string;
	/** monospace identifier (charge id, key) vs. prose. */
	readonly mono?: boolean;
	/** secondary line under the value (e.g. customer name under cus_…). */
	readonly sub?: string;
}

interface RefundOperation {
	readonly tool: "stripe";
	readonly action: string;
	readonly amount: string;
	readonly currency: string;
	readonly intent: string;
	readonly fields: readonly RefundField[];
	readonly blastRadius: readonly string[];
	readonly reversibility: string;
}

const REFUND: RefundOperation = {
	tool: "stripe",
	action: "Refund payment",
	amount: "$1,240.00",
	currency: "USD",
	intent: "Refund the duplicate charge on invoice INV-4471 back to the original card.",
	fields: [
		{ label: "Charge", value: "ch_3QspeeJ2a7kLmN0p", mono: true },
		{
			label: "Customer",
			value: "cus_PnWq8xR2vTbA1c",
			mono: true,
			sub: "Northwind Logistics",
		},
		{ label: "Reason", value: "duplicate" },
		{ label: "Idempotency key", value: "refund_2026_INV4471_dup", mono: true },
		{ label: "Net after refund", value: "$0.00", sub: "charge fully refunded" },
	],
	blastRadius: [
		"Affects 1 customer, 1 charge.",
		"Reverses the ledger entry on the May close (revenue −$1,240.00).",
		"Emails a Stripe refund receipt to billing@northwind-logistics.com.",
	],
	reversibility:
		"Irreversible once submitted — Stripe processes the refund immediately and a refund cannot be cancelled. Re-charging the customer is a new, separate payment.",
};

// ── canvas ──────────────────────────────────────────────────────────────────

export interface ReviewActionOperationProps {
	readonly operation?: RefundOperation;
	readonly onApprove?: () => void;
	readonly onReject?: () => void;
}

export function ReviewActionOperation({
	operation = REFUND,
	onApprove,
	onReject,
}: ReviewActionOperationProps): JSX.Element {
	// L3 starts expanded so the layering is visible in a single screenshot;
	// in the thread it collapses to keep the canvas at L1+L2 by default.
	const [showDetail, setShowDetail] = useState<boolean>(true);

	return (
		<article
			className="w-full max-w-[560px] overflow-hidden border border-[var(--border-default)] bg-[var(--surface-container)]"
			style={{
				borderRadius: "var(--r-default)",
				boxShadow: "var(--shadow-default)",
			}}
		>
			{/* ── L1 · one glance: action + amount + tool + irreversible ── */}
			<header className="flex items-start gap-[12px] px-[18px] pt-[18px] pb-[12px]">
				<ToolLogo tool={operation.tool} size="md" />
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-[6px]">
						<h2 className="text-[15px] font-[600] leading-none text-[var(--text-primary)]">
							{operation.action}
						</h2>
						<IrreversibleBadge />
					</div>
					<p className="mt-[6px] text-[13px] leading-[1.45] text-[var(--text-secondary)]">
						{operation.intent}
					</p>
				</div>
			</header>

			{/* the amount — the single loudest element on the canvas */}
			<div
				className="mx-[18px] flex items-baseline justify-between border px-[18px] py-[12px]"
				style={{
					borderRadius: "var(--r-subtle)",
					borderColor: "var(--accent-secondary-dim)",
					background: "var(--accent-secondary-dim)",
				}}
			>
				<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
					Refund amount
				</span>
				<span
					className="text-[30px] font-[700] leading-none text-[var(--text-primary)]"
					style={{ fontVariantNumeric: "tabular-nums" }}
				>
					{operation.amount}
					<span className="ml-[6px] text-[13px] font-[500] text-[var(--text-tertiary)]">
						{operation.currency}
					</span>
				</span>
			</div>

			{/* ── L2 · the receipt: the fields that define the operation ── */}
			<dl className="mt-[12px] px-[18px]">
				{operation.fields.map((field, i) => (
					<div
						key={field.label}
						className="flex items-start justify-between gap-[12px] py-[9px]"
						style={{
							borderTop: i === 0 ? undefined : "1px solid var(--border-subtle)",
						}}
					>
						<dt className="shrink-0 pt-[1px] text-[13px] text-[var(--text-tertiary)]">
							{field.label}
						</dt>
						<dd className="min-w-0 text-right">
							<div
								className={
									field.mono
										? "truncate font-[var(--font-mono)] text-[13px] text-[var(--text-primary)]"
										: "text-[13px] font-[500] text-[var(--text-primary)]"
								}
								style={field.mono ? { fontVariantNumeric: "tabular-nums" } : undefined}
							>
								{field.value}
							</div>
							{field.sub ? (
								<div className="mt-[3px] text-[12px] text-[var(--text-secondary)]">{field.sub}</div>
							) : null}
						</dd>
					</div>
				))}
			</dl>

			{/* ── L3 toggle ── */}
			<button
				type="button"
				onClick={() => setShowDetail((v) => !v)}
				aria-expanded={showDetail}
				className="mt-[6px] flex w-full items-center justify-between px-[18px] py-[9px] text-left text-[12px] font-[500] text-[var(--text-secondary)] transition-opacity hover:opacity-80"
				style={{ transitionDuration: "var(--motion-fast)" }}
			>
				<span>Blast radius &amp; reversibility</span>
				<Chevron open={showDetail} />
			</button>

			{/* ── L3 · on demand: blast-radius + reversibility ── */}
			{showDetail ? (
				<div className="px-[18px] pb-[6px]">
					<section className="mb-[12px]">
						<SectionCap>What this touches</SectionCap>
						<ul className="mt-[6px] flex flex-col gap-[6px]">
							{operation.blastRadius.map((item) => (
								<li
									key={item}
									className="flex gap-[9px] text-[13px] leading-[1.4] text-[var(--text-secondary)]"
								>
									<span
										aria-hidden="true"
										className="mt-[7px] h-[4px] w-[4px] shrink-0 rounded-full bg-[var(--text-tertiary)]"
									/>
									<span>{item}</span>
								</li>
							))}
						</ul>
					</section>

					<section
						className="flex gap-[9px] border px-[12px] py-[9px]"
						style={{
							borderRadius: "var(--r-subtle)",
							borderColor: "var(--status-error-dim)",
							background: "var(--status-error-dim)",
						}}
					>
						<span
							aria-hidden="true"
							className="mt-[3px] h-[12px] w-[12px] shrink-0 rounded-full border-2 border-[var(--status-error)]"
						/>
						<div>
							<div className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--status-error)]">
								Irreversible
							</div>
							<p className="mt-[3px] text-[13px] leading-[1.45] text-[var(--text-secondary)]">
								{operation.reversibility}
							</p>
						</div>
					</section>
				</div>
			) : null}

			{/* ── L3 · the pre-commit verdict gate ── */}
			<footer className="mt-[6px] flex items-center justify-end gap-[9px] border-t border-[var(--border-subtle)] px-[18px] py-[12px]">
				<button
					type="button"
					onClick={onReject}
					className="px-[18px] py-[7px] text-[13px] font-[600] text-[var(--text-secondary)] transition-opacity hover:opacity-80"
					style={{ borderRadius: "var(--r-pill)", transitionDuration: "var(--motion-fast)" }}
				>
					Reject
				</button>
				<button
					type="button"
					onClick={onApprove}
					className="px-[18px] py-[7px] text-[13px] font-[600] text-[var(--text-on-accent)] transition-opacity hover:opacity-90"
					style={{
						borderRadius: "var(--r-pill)",
						background: "var(--accent-primary)",
						transitionDuration: "var(--motion-fast)",
					}}
				>
					Approve refund
				</button>
			</footer>
		</article>
	);
}

// ── small parts ───────────────────────────────────────────────────────────

function IrreversibleBadge(): JSX.Element {
	return (
		<span
			className="inline-flex items-center gap-[4px] px-[6px] py-[3px] text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)]"
			style={{
				borderRadius: "var(--r-pill)",
				color: "var(--status-warning)",
				background: "var(--accent-secondary-dim)",
			}}
		>
			<span
				aria-hidden="true"
				className="h-[5px] w-[5px] rounded-full bg-[var(--status-warning)]"
			/>
			Irreversible
		</span>
	);
}

function SectionCap({ children }: { readonly children: string }): JSX.Element {
	return (
		<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
			{children}
		</span>
	);
}

function Chevron({ open }: { readonly open: boolean }): JSX.Element {
	return (
		<svg
			aria-hidden="true"
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			className="transition-transform"
			style={{
				transform: open ? "rotate(180deg)" : "rotate(0deg)",
				transitionDuration: "var(--motion-fast)",
			}}
		>
			<path
				d="M3 4.5 6 7.5 9 4.5"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
