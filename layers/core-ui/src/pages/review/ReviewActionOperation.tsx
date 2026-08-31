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
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isPlainObject, isString } from "./payload-guard";
import { ReviewUnknownCanvas } from "./ReviewUnknownCanvas";
import type { ActionOperationPayload, ReviewCanvasProps } from "./review-artifact";

interface RefundField {
	readonly label: string;
	readonly value: string;
	/** monospace identifier (charge id, key) vs. prose. */
	readonly mono?: boolean;
	/** secondary line under the value (e.g. customer name under cus_…). */
	readonly sub?: string;
}

interface Operation {
	readonly action: string;
	readonly amount: string;
	readonly currency: string;
	readonly intent: string;
	readonly fields: readonly RefundField[];
	readonly blastRadius: readonly string[];
	readonly reversibility: string;
	/** Both `IrreversibleBadge` and the L3 section title read this alongside
	 * `reversibility` below, which already carries the same fact — keeping
	 * both conditional on it avoids one contradicting the other. */
	readonly irreversible: boolean;
}

// ── canvas ──────────────────────────────────────────────────────────────────

export interface ReviewActionOperationProps {
	readonly operation: Operation;
	readonly onApprove?: () => void;
	readonly onReject?: () => void;
}

function ReviewActionOperationView({
	operation,
	onApprove,
	onReject,
}: ReviewActionOperationProps): JSX.Element {
	// L3 starts expanded so the layering is visible in a single screenshot;
	// in the thread it collapses to keep the canvas at L1+L2 by default.
	const [showDetail, setShowDetail] = useState<boolean>(true);

	return (
		<article
			className="border-width-thin w-full max-w-[560px] overflow-hidden  border-[var(--border-default)] bg-[var(--surface-container)]"
			style={{
				borderRadius: "var(--r-default)",
				boxShadow: "var(--shadow-default)",
			}}
		>
			{/* ── L1 · one glance: action + amount + tool + irreversible ── */}
			<header className="px-[18px] pt-[18px] pb-[12px]">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-[6px]">
						<h2 className="type-subheading    text-[var(--text-primary)]">{operation.action}</h2>
						{operation.irreversible ? <IrreversibleBadge /> : null}
					</div>
					<p className="type-small mt-[6px]   text-[var(--text-secondary)]">{operation.intent}</p>
				</div>
			</header>

			{/* the amount — the single loudest element on the canvas */}
			<div
				className="border-width-thin mx-[18px] flex items-baseline justify-between  px-[18px] py-[12px]"
				style={{
					borderRadius: "var(--r-subtle)",
					borderColor: "var(--accent-secondary-dim)",
					background: "var(--accent-secondary-dim)",
				}}
			>
				{/* No caption here: the payload names no operation type, so no
				    generic label is supplied either — the figure and its currency
				    below are the payload's own. */}
				<span
					className="type-metric    text-[var(--text-primary)]"
					style={{ fontVariantNumeric: "tabular-nums" }}
				>
					{operation.amount}
					<span className="type-small ml-[6px]   text-[var(--text-tertiary)]">
						{operation.currency}
					</span>
				</span>
			</div>

			{/* ── L2 · the receipt: the fields that define the operation ── */}
			<dl className="mt-[12px] px-[18px]">
				{operation.fields.map((field, i) => (
					<div
						key={field.label}
						className="border-none flex items-start justify-between gap-[12px] py-[9px]"
						style={{
							borderTop: i === 0 ? undefined : "var(--bw-thin) solid var(--border-subtle)",
						}}
					>
						<dt className="type-small shrink-0 pt-[1px]  text-[var(--text-tertiary)]">
							{field.label}
						</dt>
						<dd className="min-w-0 text-right">
							<div
								className={`type-data ${
									field.mono
										? "truncate   text-[var(--text-primary)]"
										: "  text-[var(--text-primary)]"
								}`}
								style={field.mono ? { fontVariantNumeric: "tabular-nums" } : undefined}
							>
								{field.value}
							</div>
							{field.sub ? (
								<div className="type-metadata mt-[3px]  text-[var(--text-secondary)]">
									{field.sub}
								</div>
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
				className="motion-feedback type-control mt-[6px] flex w-full items-center justify-between px-[18px] py-[9px] text-left   text-[var(--text-secondary)]  hover:opacity-80"
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
								<li key={item} className="type-small flex gap-[9px]   text-[var(--text-secondary)]">
									<span
										aria-hidden="true"
										data-spacing-role="optical-offset"
										className="mt-[7px] h-[4px] w-[4px] shrink-0 rounded-[var(--r-pill)] bg-[var(--text-tertiary)]"
									/>
									<span>{item}</span>
								</li>
							))}
						</ul>
					</section>

					<section
						className="border-width-thin flex gap-[9px]  px-[12px] py-[9px]"
						style={{
							borderRadius: "var(--r-subtle)",
							borderColor: "var(--status-error-dim)",
							background: "var(--status-error-dim)",
						}}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 12 12"
							className="mt-[3px] h-[12px] w-[12px] shrink-0"
						>
							<circle
								cx="6"
								cy="6"
								r="4.5"
								fill="none"
								stroke="var(--status-error)"
								strokeWidth="2"
							/>
						</svg>
						<div>
							{operation.irreversible ? (
								<div className="type-label   uppercase  text-[var(--status-error)]">
									Irreversible
								</div>
							) : null}
							<p className="type-small mt-[3px]   text-[var(--text-secondary)]">
								{operation.reversibility}
							</p>
						</div>
					</section>
				</div>
			) : null}

			{/* ── L3 · the pre-commit verdict gate ── */}
			<footer className="border-width-thin-t mt-[6px] flex items-center justify-end gap-[9px]  border-[var(--border-subtle)] px-[18px] py-[12px]">
				<button
					type="button"
					onClick={onReject}
					className="motion-feedback type-control px-[18px] py-[7px]   text-[var(--text-secondary)]  hover:opacity-80"
					style={{ borderRadius: "var(--r-pill)" }}
				>
					Reject
				</button>
				<button
					type="button"
					onClick={onApprove}
					className="motion-feedback type-control px-[18px] py-[7px]   text-[var(--text-on-accent)]  hover:opacity-90"
					style={{
						borderRadius: "var(--r-pill)",
						background: "var(--accent-primary)",
					}}
				>
					Approve
				</button>
			</footer>
		</article>
	);
}

// ── small parts ───────────────────────────────────────────────────────────

function IrreversibleBadge(): JSX.Element {
	return (
		<span
			data-spacing-role="compact-pill"
			className="type-label inline-flex items-center gap-[4px] px-[6px] py-[3px]   uppercase "
			style={{
				borderRadius: "var(--r-pill)",
				color: "var(--status-warning)",
				background: "var(--accent-secondary-dim)",
			}}
		>
			<span
				aria-hidden="true"
				className="h-[5px] w-[5px] rounded-[var(--r-pill)] bg-[var(--status-warning)]"
			/>
			Irreversible
		</span>
	);
}

function SectionCap({ children }: { readonly children: string }): JSX.Element {
	return <span className="type-label   uppercase  text-[var(--text-tertiary)]">{children}</span>;
}

function Chevron({ open }: { readonly open: boolean }): JSX.Element {
	return (
		<svg
			aria-hidden="true"
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			className="motion-move "
			style={{
				transform: open ? "rotate(180deg)" : "rotate(0deg)",
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

function mapActionPayload(payload: ActionOperationPayload): Operation {
	return {
		action: payload.verb,
		amount: payload.amountWire.formatted,
		currency: payload.amountWire.currency,
		intent: payload.verb,
		fields: payload.receiptFields,
		blastRadius: payload.blastRadius,
		reversibility: payload.irreversible
			? "Irreversible once submitted — confirm to proceed."
			: "Reversible before the operation is executed.",
		irreversible: payload.irreversible,
	};
}

export function ReviewActionOperation({ artifact }: ReviewCanvasProps): JSX.Element {
	if (!isActionOperationPayload(artifact.payload)) {
		// A malformed payload gets the honest unknown-canvas
		// fallback, never the REFUND demo fixture.
		return <ReviewUnknownCanvas artifact={artifact} />;
	}
	const operation = mapActionPayload(artifact.payload);
	return (
		<div className="flex flex-col gap-[12px]">
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			<ReviewActionOperationView operation={operation} />
		</div>
	);
}
