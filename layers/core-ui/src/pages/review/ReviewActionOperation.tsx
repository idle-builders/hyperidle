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

import type { ProposedCallStatus } from "@hyperidle/shared";
import { type JSX, useState } from "react";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isPlainObject, isString } from "./payload-guard";
import type { ActionOperationPayload, ReviewCanvasProps } from "./review-artifact";
import type { ProposedCallOutcomeView, ProposedCallView } from "./review-composition";

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

// ── AL7 trust-first: the Proposed Call execution outcome ──────────────────────
// The terminal result of an executed Proposed Call, surfaced on the same
// canvas that rendered the pre-commit receipt. Hard rule #8: a failure is an
// Outcome with status="failed" + a surfaced error — NEVER a missing/silent
// outcome, never a toast. The band is a persistent part of the card so a
// re-opened review shows the terminal state instead of re-prompting.
//
// @lore AL7 N2: ProposedCallStatus is imported from @hyperidle/shared (the
// shared PROPOSED_CALL_STATUSES const tuple), NOT defined inline here.
// This ensures the canvas cannot drift from the router's status values.
// ProposedCallOutcomeView is imported from review-composition — the loader
// uses the same shape, so canvas and loader cannot drift either.

export interface ReviewActionOperationProps {
	readonly operation?: RefundOperation;
	/** AL7 trust-first: drives the outcome band. `captured` renders the AL2 canvas unchanged. */
	readonly status?: ProposedCallStatus;
	readonly outcome?: ProposedCallOutcomeView;
	readonly onApprove?: () => void;
	readonly onReject?: () => void;
}

function ReviewActionOperationView({
	operation = REFUND,
	status = "captured",
	outcome,
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
			<header className="px-[18px] pt-[18px] pb-[12px]">
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

			{/* ── AL7 trust-first · the execution outcome band (granted | executed | failed) ── */}
			{/* @lore AL7: `granted` is transient — the agent is provisioned for session 2.
			    `executed` = ok outcome, `failed` = outcome with error. */}
			{status === "granted" ? <ExecutingBand /> : null}
			{status === "executed" && outcome ? <OutcomeBand outcome={outcome} ok /> : null}
			{status === "failed" && outcome ? <OutcomeBand outcome={outcome} /> : null}

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

// AL7: the executing band — transient in-flight state. Shown while dispatch is
// running; converted to failed by the boot sweep if a crash strands the op.
function ExecutingBand(): JSX.Element {
	return (
		<section
			className="mx-[18px] mt-[12px] flex items-center gap-[9px] border px-[12px] py-[9px]"
			style={{
				borderRadius: "var(--r-subtle)",
				borderColor: "var(--border-default)",
				background: "var(--surface-container)",
			}}
		>
			<span
				aria-label="executing"
				className="h-[14px] w-[14px] shrink-0 rounded-full border-2 border-[var(--text-tertiary)] border-t-transparent"
				style={{ animation: "spin 0.75s linear infinite" }}
			/>
			<span className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
				Executing…
			</span>
		</section>
	);
}

// AL7: the outcome band. Success is calm (forest-green success family — a done
// refund is now history); failure is loud (status-error). Success uses the
// success/primary fill (`--accent-primary-dim`), NOT the warning fill the amount
// block + IrreversibleBadge use (`--accent-secondary-dim`) — a succeeded op must
// not read in the danger/money color family. The surfaced error renders verbatim
// AND un-truncated (rule #8: failure must be impossible to miss — never clipped).
function OutcomeBand({
	outcome,
	ok = false,
}: {
	readonly outcome: ProposedCallOutcomeView;
	readonly ok?: boolean;
}): JSX.Element {
	return (
		<section
			className="mx-[18px] mt-[12px] flex gap-[9px] border px-[12px] py-[9px]"
			style={{
				borderRadius: "var(--r-subtle)",
				borderColor: ok ? "var(--accent-primary)" : "var(--status-error)",
				background: ok ? "var(--accent-primary-dim)" : "var(--status-error-dim)",
			}}
		>
			<span
				aria-hidden="true"
				className="mt-[2px] flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full"
				style={{ background: ok ? "var(--accent-primary)" : "var(--status-error)" }}
			>
				<svg width="9" height="9" viewBox="0 0 12 12" fill="none">
					<title>{ok ? "executed" : "failed"}</title>
					{ok ? (
						<path
							d="M2.5 6.5 5 9l4.5-5"
							stroke="var(--text-on-accent)"
							strokeWidth="1.8"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					) : (
						<path
							d="M3 3l6 6M9 3l-6 6"
							stroke="var(--text-on-accent)"
							strokeWidth="1.8"
							strokeLinecap="round"
						/>
					)}
				</svg>
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-[9px]">
					<span
						className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps-sm)]"
						style={{ color: ok ? "var(--accent-primary)" : "var(--status-error)" }}
					>
						{ok ? "Executed" : "Execution failed"}
					</span>
					<span
						className="shrink-0 text-[12px] text-[var(--text-tertiary)]"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{outcome.executedAt}
					</span>
				</div>
				{ok ? (
					// the receipt is a short identity (e.g. `re_3Qs… · refunded`) — one line is fine.
					<p className="mt-[3px] truncate font-[var(--font-mono)] text-[13px] text-[var(--text-primary)]">
						{outcome.receipt}
					</p>
				) : (
					// rule #8: the failure error renders verbatim and un-clipped. A real tool
					// error (Stripe `card_declined` body, GitHub merge-conflict, API stack) wraps
					// across lines — NEVER `truncate`, which would clip the thing the reviewer
					// most needs to read. `whitespace-pre-wrap` preserves the tool's own newlines;
					// `break-words` keeps long unbroken tokens inside the band.
					<p className="mt-[3px] whitespace-pre-wrap break-words font-[var(--font-mono)] text-[13px] text-[var(--text-primary)]">
						{outcome.error}
					</p>
				)}
			</div>
		</section>
	);
}

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

// AL2 — review artifact wrapper.
function isActionOperationPayload(payload: unknown): payload is ActionOperationPayload {
	return (
		isPlainObject(payload) &&
		isString(payload.verb) &&
		isPlainObject(payload.amountWire) &&
		isString((payload.amountWire as Record<string, unknown>).formatted) &&
		Array.isArray(payload.receiptFields) &&
		Array.isArray(payload.blastRadius) &&
		typeof payload.irreversible === "boolean"
	);
}

function mapActionPayload(payload: ActionOperationPayload): RefundOperation {
	return {
		tool: "stripe",
		action: payload.verb,
		amount: payload.amountWire.formatted,
		currency: payload.amountWire.currency,
		intent: payload.verb,
		fields: payload.receiptFields,
		blastRadius: payload.blastRadius,
		reversibility: payload.irreversible
			? "Irreversible once submitted — confirm to proceed."
			: "Reversible before the operation is executed.",
	};
}

/**
 * AC10b (WARNING-2, ETHOS §3): When a Proposed Call is present, render the
 * concrete captured toolId + args BEFORE the standard operation card.
 * The human approves what they actually see — no summary, no fabricated data.
 *
 * @lore AL7 CRITICAL-3: Previously only `status`+`outcome` were passed and the
 * component defaulted to the hardcoded REFUND fixture. The approver saw fake
 * Stripe ids/amount, not the agent's real call. This section renders the verbatim
 * captured args so gross divergence is visible to human judgment.
 */
function ProposedCallArgsPanel({
	proposedCall,
}: {
	readonly proposedCall: ProposedCallView;
}): JSX.Element {
	const argEntries = Object.entries(proposedCall.args);
	return (
		<section
			className="overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-elevated)]"
			style={{ borderRadius: "var(--r-subtle)" }}
			aria-label="Proposed call details"
		>
			<div className="flex items-center gap-[9px] border-b border-[var(--border-subtle)] px-[12px] py-[9px]">
				<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
					Tool
				</span>
				<span
					className="font-[var(--font-mono)] text-[13px] text-[var(--text-primary)]"
					data-testid="proposed-call-tool-id"
				>
					{proposedCall.toolId}
				</span>
			</div>
			{argEntries.length > 0 ? (
				<dl className="px-[12px]">
					{argEntries.map(([key, value], i) => (
						<div
							key={key}
							className="flex items-start justify-between gap-[12px] py-[9px]"
							style={{
								borderTop: i === 0 ? undefined : "1px solid var(--border-subtle)",
							}}
						>
							<dt className="shrink-0 pt-[1px] text-[13px] text-[var(--text-tertiary)]">{key}</dt>
							<dd
								className="min-w-0 text-right font-[var(--font-mono)] text-[13px] text-[var(--text-primary)] break-all"
								data-testid={`proposed-call-arg-${key}`}
							>
								{typeof value === "string" ? value : JSON.stringify(value)}
							</dd>
						</div>
					))}
				</dl>
			) : null}
		</section>
	);
}

export function ReviewActionOperation({
	artifact,
	status,
	outcome,
	proposedCall,
}: ReviewCanvasProps &
	Pick<ReviewActionOperationProps, "status" | "outcome"> & {
		readonly proposedCall?: ProposedCallView;
	}): JSX.Element {
	const operation = isActionOperationPayload(artifact.payload)
		? mapActionPayload(artifact.payload)
		: REFUND;
	return (
		<div className="flex flex-col gap-[12px]">
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			{/* AC10b WARNING-2: render the concrete captured args (verbatim, not a summary)
			    so the human approves what the agent actually called. */}
			{proposedCall ? <ProposedCallArgsPanel proposedCall={proposedCall} /> : null}
			<ReviewActionOperationView operation={operation} status={status} outcome={outcome} />
		</div>
	);
}
