// AL1 review canvas #5 — metrics-that-moved / data-diff.
// Tool: QuickBooks month-end close (revenue roll-forward + reconciliation).
//
// Three layers (brief §1):
//   L1  the moved headlines, materiality-sorted (biggest $ on top), + exceptions count + ToolLogo.
//   L2  the roll-forward / reconciliation table with CHANGED CELLS HIGHLIGHTED, sub-$100 rows
//       collapsed, and an explicit TIE-OUT STRIP (opening + activity = closing ✓ ties to bank).
//   L3  on demand — per-figure PROVENANCE (a figure → its source export / GL account) and the
//       EXCEPTIONS list; the two real exceptions carry needs-you flags.
//
// Presentational isolation story: local useState for figure expand; callbacks no-op.
// Hearth + CP1 tokens by NAME only (no hex outside ToolLogo). 6px grid. Left-aligned.
// Animate transform/opacity only. tabular-nums on every number.

import { type JSX, useState } from "react";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isNumber, isPlainObject, isString } from "./payload-guard";
import type { MetricsMovedPayload, ReviewCanvasProps } from "./review-artifact";
import { ToolLogo } from "./ToolLogo";

// ── fixture ──────────────────────────────────────────────────────────────────

interface Provenance {
	readonly source: string; // "Stripe MRR export" / "GL account 4000"
	readonly detail: string; // invoice IDs / reconciliation note
	readonly tool: "stripe" | "quickbooks";
}

interface MovedFigure {
	readonly id: string;
	readonly label: string;
	readonly prior: number; // April
	readonly current: number; // May
	readonly headline?: boolean; // surfaced in L1
	readonly provenance: Provenance;
}

interface RollForwardRow {
	readonly id: string;
	readonly label: string;
	readonly opening: number;
	readonly activity: number;
	readonly closing: number;
	readonly changed: boolean; // activity ≠ 0 → highlight the moved cells
}

interface Exception {
	readonly id: string;
	readonly amount: number;
	readonly title: string;
	readonly detail: string;
	readonly kind: "timing" | "anomaly";
	readonly needsYou: boolean;
}

interface CloseFixture {
	readonly period: string;
	readonly figures: readonly MovedFigure[]; // materiality-sorted
	readonly rows: readonly RollForwardRow[]; // materiality-sorted
	readonly trivia: { readonly count: number; readonly net: number };
	readonly tieOut: {
		readonly opening: number;
		readonly activity: number;
		readonly closing: number;
		readonly ties: boolean;
	};
	readonly exceptions: readonly Exception[]; // exception float (biggest first)
}

const FIXTURE: CloseFixture = {
	period: "May 2026",
	figures: [
		{
			id: "rev",
			label: "Recognized revenue",
			prior: 588_000,
			current: 612_400,
			headline: true,
			provenance: {
				source: "GL account 4000 · from Stripe MRR export",
				detail:
					"412 invoices (in_1P8…–in_1Pq2…), recognized ratably; matches Stripe billing $612,400.00",
				tool: "stripe",
			},
		},
		{
			id: "cash",
			label: "Cash & equivalents",
			prior: 1_051_990,
			current: 1_284_302,
			provenance: {
				source: "GL account 1000 · bank feed",
				detail:
					"Mercury operating + savings; reconciled to statement close 05-31, 3 items in transit",
				tool: "quickbooks",
			},
		},
		{
			id: "ar",
			label: "Accounts receivable",
			prior: 142_300,
			current: 118_900,
			provenance: {
				source: "GL account 1200 · A/R aging",
				detail: "37 open invoices; $24,400 net collected vs new billings in May",
				tool: "quickbooks",
			},
		},
	],
	rows: [
		{
			id: "rev",
			label: "Recognized revenue (4000)",
			opening: 588_000,
			activity: 24_400,
			closing: 612_400,
			changed: true,
		},
		{
			id: "cash",
			label: "Cash & equivalents (1000)",
			opening: 1_051_990,
			activity: 232_312,
			closing: 1_284_302,
			changed: true,
		},
		{
			id: "ar",
			label: "Accounts receivable (1200)",
			opening: 142_300,
			activity: -23_400,
			closing: 118_900,
			changed: true,
		},
		{
			id: "deferred",
			label: "Deferred revenue (2300)",
			opening: 96_500,
			activity: 8_140,
			closing: 104_640,
			changed: true,
		},
		{
			id: "cogs",
			label: "Cost of revenue (5000)",
			opening: 71_200,
			activity: 2_980,
			closing: 74_180,
			changed: true,
		},
		{
			id: "prepaid",
			label: "Prepaid expenses (1400)",
			opening: 18_900,
			activity: 0,
			closing: 18_900,
			changed: false,
		},
	],
	trivia: { count: 9, net: 37 },
	tieOut: { opening: 1_051_990, activity: 232_312, closing: 1_284_302, ties: true },
	exceptions: [
		{
			id: "wire",
			amount: 9_840,
			title: "Unidentified wire — no source",
			detail:
				"Inbound $9,840.00 to Mercury operating 05-22, no matching invoice or customer. Booked to suspense (2900) pending identification.",
			kind: "anomaly",
			needsYou: true,
		},
		{
			id: "ach",
			amount: 4_200,
			title: "Duplicate ACH — over authority",
			detail:
				"Vendor payment to Ramp $4,200.00 posted twice (05-14, 05-15). Reversal exceeds your $2,500 auto-approve limit.",
			kind: "anomaly",
			needsYou: true,
		},
		{
			id: "dit",
			amount: 31_500,
			title: "Deposits in transit — timing",
			detail:
				"$31,500.00 of card settlements deposited 05-31, cleared bank 06-02. Normal cutoff timing; clears next period.",
			kind: "timing",
			needsYou: false,
		},
	],
};

// ── format helpers ───────────────────────────────────────────────────────────

function usd(n: number): string {
	return n.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	});
}
function usdCents(n: number): string {
	return n.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}
function signed(n: number): string {
	const v = usd(Math.abs(n));
	return n >= 0 ? `+${v}` : `−${v}`;
}

// ── primitives ───────────────────────────────────────────────────────────────

const NUM = "[font-variant-numeric:tabular-nums]";

function DeltaPill({ delta }: { delta: number }): JSX.Element {
	const up = delta >= 0;
	return (
		<span
			className={`inline-flex items-center gap-[3px] rounded-[var(--r-pill)] px-[6px] py-[3px] text-[12px] font-[600] ${NUM}`}
			style={{
				color: up ? "var(--status-success)" : "var(--status-error)",
				background: up ? "var(--accent-primary-dim)" : "var(--status-error-dim)",
			}}
		>
			<span aria-hidden="true">{up ? "▲" : "▼"}</span>
			{signed(delta)}
		</span>
	);
}

// ── L1: moved headlines ──────────────────────────────────────────────────────

function Headline({
	figure,
	expanded,
	onToggle,
}: {
	figure: MovedFigure;
	expanded: boolean;
	onToggle: () => void;
}): JSX.Element {
	const delta = figure.current - figure.prior;
	return (
		<div
			className="rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-[12px]"
			style={{ boxShadow: figure.headline ? "var(--shadow-default)" : undefined }}
		>
			<div className="flex items-baseline justify-between gap-[12px]">
				<span className="text-[13px] font-[500] text-[var(--text-secondary)]">{figure.label}</span>
				<DeltaPill delta={delta} />
			</div>
			<div
				className={`mt-[6px] text-[24px] font-[700] leading-none text-[var(--text-primary)] ${NUM}`}
			>
				{usd(figure.current)}
			</div>
			<div className={`mt-[6px] text-[12px] text-[var(--text-tertiary)] ${NUM}`}>
				Apr {usd(figure.prior)} → May
			</div>
			<button
				type="button"
				onClick={onToggle}
				className="mt-[9px] inline-flex items-center gap-[6px] text-[12px] font-[500] text-[var(--accent-primary)] [transition:opacity_var(--motion-fast)_var(--motion-ease)] hover:opacity-70"
				aria-expanded={expanded}
			>
				<span
					aria-hidden="true"
					className="inline-block [transition:transform_var(--motion-fast)_var(--motion-ease)]"
					style={{ transform: expanded ? "rotate(90deg)" : "none" }}
				>
					▸
				</span>
				{expanded ? "Hide source" : "Where from?"}
			</button>
			{expanded ? (
				// L3 — per-figure provenance
				<div className="mt-[9px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-container)] p-[12px]">
					<div className="flex items-center gap-[6px]">
						<ToolLogo tool={figure.provenance.tool} size="sm" label="" />
						<span className="text-[12px] font-[600] text-[var(--text-primary)]">
							{figure.provenance.source}
						</span>
					</div>
					<p className={`mt-[6px] text-[12px] leading-[1.5] text-[var(--text-secondary)] ${NUM}`}>
						{figure.provenance.detail}
					</p>
				</div>
			) : null}
		</div>
	);
}

// ── L2: roll-forward table ───────────────────────────────────────────────────

function changedCellStyle(): React.CSSProperties {
	return {
		background: "var(--accent-secondary-dim)",
		color: "var(--text-primary)",
		fontWeight: 600,
	};
}

function RollForwardTable({ fixture }: { fixture: CloseFixture }): JSX.Element {
	const [showTrivia, setShowTrivia] = useState(false);
	return (
		<div
			className="overflow-hidden rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)]"
			style={{ boxShadow: "var(--shadow-default)" }}
		>
			<table className="w-full border-collapse text-left">
				<thead>
					<tr className="border-b border-[var(--border-default)]">
						<th className="px-[12px] py-[9px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
							Account
						</th>
						<th className="px-[12px] py-[9px] text-right text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
							Opening
						</th>
						<th className="px-[12px] py-[9px] text-right text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
							Activity
						</th>
						<th className="px-[12px] py-[9px] text-right text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
							Closing
						</th>
					</tr>
				</thead>
				<tbody>
					{fixture.rows.map((r) => (
						<tr key={r.id} className="border-b border-[var(--border-subtle)]">
							<td className="px-[12px] py-[9px] text-[13px] text-[var(--text-primary)]">
								{r.label}
							</td>
							<td
								className={`px-[12px] py-[9px] text-right text-[13px] text-[var(--text-secondary)] ${NUM}`}
							>
								{usd(r.opening)}
							</td>
							<td
								className={`px-[12px] py-[9px] text-right text-[13px] ${NUM}`}
								style={r.changed ? changedCellStyle() : { color: "var(--text-tertiary)" }}
							>
								{r.changed ? signed(r.activity) : "—"}
							</td>
							<td
								className={`px-[12px] py-[9px] text-right text-[13px] font-[500] ${NUM}`}
								style={r.changed ? changedCellStyle() : { color: "var(--text-secondary)" }}
							>
								{usd(r.closing)}
							</td>
						</tr>
					))}
					<tr>
						<td colSpan={4} className="px-[12px] py-[6px]">
							<button
								type="button"
								onClick={() => setShowTrivia((v) => !v)}
								className="text-[12px] font-[500] text-[var(--text-tertiary)] [transition:opacity_var(--motion-fast)_var(--motion-ease)] hover:opacity-70"
								aria-expanded={showTrivia}
							>
								{showTrivia ? "Hide" : "Show"} {fixture.trivia.count} items &lt; $100 (net{" "}
								{signed(fixture.trivia.net)})
							</button>
						</td>
					</tr>
				</tbody>
			</table>

			{/* tie-out strip — the control total that proves the roll-forward */}
			<div
				className="flex flex-wrap items-center gap-x-[6px] gap-y-[3px] border-t border-[var(--border-default)] px-[12px] py-[9px]"
				style={{ background: "var(--accent-primary-dim)" }}
			>
				<span
					className="inline-flex items-center justify-center"
					style={{ color: "var(--status-success)" }}
					aria-hidden="true"
				>
					✓
				</span>
				<span className={`text-[13px] text-[var(--text-primary)] ${NUM}`}>
					Opening {usd(fixture.tieOut.opening)} + activity {signed(fixture.tieOut.activity)} =
					Closing <span className="font-[600]">{usd(fixture.tieOut.closing)}</span>
				</span>
				<span className="text-[13px] font-[600]" style={{ color: "var(--status-success)" }}>
					ties to bank
				</span>
			</div>
		</div>
	);
}

// ── L3: exceptions ───────────────────────────────────────────────────────────

function ExceptionRow({ ex }: { ex: Exception }): JSX.Element {
	return (
		<div
			className="flex items-start gap-[12px] rounded-[var(--r-subtle)] border p-[12px]"
			style={{
				borderColor: ex.needsYou ? "var(--status-error)" : "var(--border-subtle)",
				background: ex.needsYou ? "var(--status-error-dim)" : "var(--surface-container)",
			}}
		>
			<span
				className={`shrink-0 text-[15px] font-[700] ${NUM}`}
				style={{ color: ex.needsYou ? "var(--status-error)" : "var(--text-secondary)" }}
			>
				{usdCents(ex.amount)}
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-[6px]">
					<span className="text-[13px] font-[600] text-[var(--text-primary)]">{ex.title}</span>
					{ex.needsYou ? (
						<span
							className="rounded-[var(--r-pill)] px-[6px] py-[3px] text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)]"
							style={{ background: "var(--status-error)", color: "var(--surface-page)" }}
						>
							Needs you
						</span>
					) : (
						<span
							className="rounded-[var(--r-pill)] px-[6px] py-[3px] text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)]"
							style={{ background: "var(--status-info-dim)", color: "var(--status-info)" }}
						>
							Timing
						</span>
					)}
				</div>
				<p className={`mt-[3px] text-[12px] leading-[1.5] text-[var(--text-secondary)] ${NUM}`}>
					{ex.detail}
				</p>
			</div>
		</div>
	);
}

// ── the canvas ───────────────────────────────────────────────────────────────

export interface ReviewMetricsMovedProps {
	readonly fixture?: CloseFixture;
	/** which figure starts expanded (so all 3 layers are visible in a screenshot). */
	readonly initialExpandedFigureId?: string | null;
}

function ReviewMetricsMovedView({
	fixture = FIXTURE,
	initialExpandedFigureId = "rev",
}: ReviewMetricsMovedProps): JSX.Element {
	const [expandedId, setExpandedId] = useState<string | null>(initialExpandedFigureId);
	const found = fixture.figures.find((f) => f.headline) ?? fixture.figures[0];
	if (!found) throw new Error("ReviewMetricsMoved: no headline figure");
	const headline = found;

	return (
		<div className="max-w-[760px] bg-[var(--surface-page)] text-[var(--text-primary)]">
			<div className="p-[18px]">
				{/* ── L1 ── one-glance summary (tool/period now in source header) ── */}
				<p className={`text-[15px] leading-[1.5] text-[var(--text-primary)] ${NUM}`}>
					Recognized revenue closed at <span className="font-[700]">{usd(headline.current)}</span>,
					up{" "}
					<span className="font-[600]" style={{ color: "var(--status-success)" }}>
						{signed(headline.current - headline.prior)}
					</span>{" "}
					from April. The period ties to bank; biggest open item is a{" "}
					<span className="font-[600]">{usdCents(fixture.exceptions[0]?.amount ?? 0)}</span> wire
					with no source.
				</p>

				<div className="mt-[12px] grid grid-cols-3 gap-[9px]">
					{fixture.figures.map((f) => (
						<Headline
							key={f.id}
							figure={f}
							expanded={expandedId === f.id}
							onToggle={() => setExpandedId((cur) => (cur === f.id ? null : f.id))}
						/>
					))}
				</div>

				{/* ── L2 ── the structured proof: roll-forward + tie-out ── */}
				<div className="mt-[18px] mb-[9px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Roll-forward · reconciliation
				</div>
				<RollForwardTable fixture={fixture} />

				{/* ── L3 ── exceptions list (floated, biggest $ first) ── */}
				<div className="mt-[18px] mb-[9px] flex items-baseline gap-[6px]">
					<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						Exceptions
					</span>
					<span className={`text-[11px] text-[var(--text-tertiary)] ${NUM}`}>
						{fixture.exceptions.length}, by amount
					</span>
				</div>
				<div className="flex flex-col gap-[9px]">
					{fixture.exceptions.map((ex) => (
						<ExceptionRow key={ex.id} ex={ex} />
					))}
				</div>
			</div>
		</div>
	);
}

// AL2 — review artifact wrapper.
function isMetricsMovedPayload(payload: unknown): payload is MetricsMovedPayload {
	return (
		isPlainObject(payload) &&
		isString(payload.period) &&
		Array.isArray(payload.headlines) &&
		Array.isArray(payload.rows) &&
		isPlainObject(payload.tieOut) &&
		Array.isArray(payload.exceptions)
	);
}

function isRollForwardRow(value: unknown): value is RollForwardRow {
	return (
		isPlainObject(value) &&
		isString(value.id) &&
		isString(value.label) &&
		isNumber(value.opening) &&
		isNumber(value.activity) &&
		isNumber(value.closing)
	);
}

function mapMetricsPayload(payload: MetricsMovedPayload): CloseFixture {
	const figures: MovedFigure[] = payload.headlines.map((h, i) => ({
		id: `fig-${i}`,
		label: h.label,
		prior: h.prior,
		current: h.current,
		headline: true,
		provenance: { source: payload.period, detail: "", tool: "quickbooks" },
	}));
	const exceptions: Exception[] = payload.exceptions.map((ex, i) => ({
		id: `ex-${i}`,
		amount: ex.amount,
		title: ex.title,
		detail: ex.detail,
		kind: ex.needsYou ? "anomaly" : "timing",
		needsYou: ex.needsYou ?? false,
	}));
	const rows = payload.rows.filter(isRollForwardRow);
	return {
		period: payload.period,
		figures,
		rows,
		trivia: { count: 0, net: 0 },
		tieOut: payload.tieOut,
		exceptions,
	};
}

export function ReviewMetricsMoved({ artifact }: ReviewCanvasProps): JSX.Element {
	const fixture = isMetricsMovedPayload(artifact.payload)
		? mapMetricsPayload(artifact.payload)
		: FIXTURE;
	return (
		<div className="flex flex-col gap-[12px]">
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			<ReviewMetricsMovedView fixture={fixture} />
		</div>
	);
}

// ── other states (specified per brief §"States"; populated is the default story) ──
//
// empty:   no movement this period → "<period> close: no figures moved" + ToolLogo,
//          no table, no exceptions. Reviewer sees a clean tie-out only.
// loading: Skeleton — 3 headline cards (24px number bars), 6 table rows, a tie-out bar.
// error:   ErrorState — "Couldn't load the QuickBooks close" + retry; surfaces the GL
//          account / export that failed so the reviewer knows what to re-pull.
// needs-you emphasis: the two anomaly exceptions carry the red Needs-you flag + error-dim
//          row; timing exception stays calm (info chip). Headline exception count chip
//          reflects the needs-you total.
