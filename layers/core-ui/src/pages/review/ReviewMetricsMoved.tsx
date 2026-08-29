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
import { ReviewUnknownCanvas } from "./ReviewUnknownCanvas";
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
	readonly prior: number;
	readonly current: number;
	readonly headline?: boolean; // surfaced in L1
	/** BA2 T4e-a: undefined when the payload carries no per-figure provenance —
	 * an agent-supplied `MetricsMovedPayload.headlines[]` entry has no source
	 * field at all, so there is nothing honest to show here (§2.8.2 D). */
	readonly provenance?: Provenance;
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

// ── format helpers ───────────────────────────────────────────────────────────
//
// @lore BA2 T4e-a: `MetricsMovedPayload` carries no currency field at all, so
// formatting every number as USD (`style: "currency"`) asserted a fact
// (§2.8.2 D) the payload never supplied. These format grouping only.

function fmt(n: number): string {
	return n.toLocaleString("en-US", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	});
}
function fmtCents(n: number): string {
	return n.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}
function signed(n: number): string {
	const v = fmt(Math.abs(n));
	return n >= 0 ? `+${v}` : `−${v}`;
}

// ── primitives ───────────────────────────────────────────────────────────────

const NUM = "[font-variant-numeric:tabular-nums]";

function DeltaPill({ delta }: { delta: number }): JSX.Element {
	const up = delta >= 0;
	return (
		<span
			className={`type-metadata ${`inline-flex items-center gap-[3px] rounded-[var(--r-pill)] px-[6px] py-[3px]   ${NUM}`}`}
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
			className="border-width-thin rounded-[var(--r-subtle)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-[12px]"
			style={{ boxShadow: figure.headline ? "var(--shadow-default)" : undefined }}
		>
			<div className="flex items-baseline justify-between gap-[12px]">
				<span className="type-small   text-[var(--text-secondary)]">{figure.label}</span>
				<DeltaPill delta={delta} />
			</div>
			<div className={`type-metric ${`mt-[6px]    text-[var(--text-primary)] ${NUM}`}`}>
				{fmt(figure.current)}
			</div>
			<div className={`type-metadata ${`mt-[6px]  text-[var(--text-tertiary)] ${NUM}`}`}>
				{fmt(figure.prior)} → {fmt(figure.current)}
			</div>
			<button
				type="button"
				onClick={onToggle}
				className="motion-feedback type-control mt-[9px] inline-flex items-center gap-[6px] text-[var(--accent-deep)]"
				aria-expanded={expanded}
			>
				<span
					aria-hidden="true"
					className="motion-move inline-block"
					style={{ transform: expanded ? "rotate(90deg)" : "none" }}
				>
					▸
				</span>
				{expanded ? "Hide source" : "Where from?"}
			</button>
			{/* BA2 T4e-a: an agent-supplied payload carries no per-figure provenance
			    (§2.8.2 D) — render the disclosure's content only when there is one,
			    never a fabricated tool/source/detail. */}
			{expanded && figure.provenance ? (
				// L3 — per-figure provenance
				<div className="border-width-thin mt-[9px] rounded-[var(--r-subtle)]  border-[var(--border-subtle)] bg-[var(--surface-container)] p-[12px]">
					<div className="flex items-center gap-[6px]">
						<ToolLogo tool={figure.provenance.tool} size="sm" label="" />
						<span className="type-metadata   text-[var(--text-primary)]">
							{figure.provenance.source}
						</span>
					</div>
					<p className={`type-metadata ${`mt-[6px]   text-[var(--text-secondary)] ${NUM}`}`}>
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
			className="border-width-thin overflow-hidden rounded-[var(--r-default)]  border-[var(--border-default)] bg-[var(--surface-elevated)]"
			style={{ boxShadow: "var(--shadow-default)" }}
		>
			<table className="w-full border-collapse text-left">
				<thead>
					<tr className="border-width-thin-b  border-[var(--border-default)]">
						<th className="type-label px-[12px] py-[9px]   uppercase  text-[var(--text-tertiary)]">
							Account
						</th>
						<th className="type-label px-[12px] py-[9px] text-right   uppercase  text-[var(--text-tertiary)]">
							Opening
						</th>
						<th className="type-label px-[12px] py-[9px] text-right   uppercase  text-[var(--text-tertiary)]">
							Activity
						</th>
						<th className="type-label px-[12px] py-[9px] text-right   uppercase  text-[var(--text-tertiary)]">
							Closing
						</th>
					</tr>
				</thead>
				<tbody>
					{fixture.rows.map((r) => (
						<tr key={r.id} className="border-width-thin-b  border-[var(--border-subtle)]">
							<td className="type-small px-[12px] py-[9px]  text-[var(--text-primary)]">
								{r.label}
							</td>
							<td
								className={`type-small ${`px-[12px] py-[9px] text-right  text-[var(--text-secondary)] ${NUM}`}`}
							>
								{fmt(r.opening)}
							</td>
							<td
								className={`type-small ${`px-[12px] py-[9px] text-right  ${NUM}`}`}
								style={r.changed ? changedCellStyle() : { color: "var(--text-tertiary)" }}
							>
								{r.changed ? signed(r.activity) : "—"}
							</td>
							<td
								className={`type-small ${`px-[12px] py-[9px] text-right   ${NUM}`}`}
								style={r.changed ? changedCellStyle() : { color: "var(--text-secondary)" }}
							>
								{fmt(r.closing)}
							</td>
						</tr>
					))}
					<tr>
						<td colSpan={4} className="px-[12px] py-[6px]">
							{/* BA2 T4e-a: the fixed "< $100" sub-threshold figure asserted a
							    materiality cutoff `MetricsMovedPayload` has no field for — the
							    mapper never actually groups rows by it either (§2.8.2 D). */}
							<button
								type="button"
								onClick={() => setShowTrivia((v) => !v)}
								className="motion-feedback type-control text-[var(--text-tertiary)]"
								aria-expanded={showTrivia}
							>
								{showTrivia ? "Hide" : "Show"} {fixture.trivia.count} items (net{" "}
								{signed(fixture.trivia.net)})
							</button>
						</td>
					</tr>
				</tbody>
			</table>

			{/* tie-out strip — the control total that proves the roll-forward */}
			<div
				className="border-width-thin-t flex flex-wrap items-center gap-x-[6px] gap-y-[3px]  border-[var(--border-default)] px-[12px] py-[9px]"
				style={{ background: "var(--accent-primary-dim)" }}
			>
				<span
					className="inline-flex items-center justify-center"
					style={{ color: "var(--status-success)" }}
					aria-hidden="true"
				>
					✓
				</span>
				<span className={`type-small ${` text-[var(--text-primary)] ${NUM}`}`}>
					Opening {fmt(fixture.tieOut.opening)} + activity {signed(fixture.tieOut.activity)} =
					Closing <span className="type-small ">{fmt(fixture.tieOut.closing)}</span>
				</span>
				{/* BA2 T4e-a (founder-decided ambiguity #2): `tieOut.ties` is a real
				    payload boolean — a conditional tie indicator is honest. "bank" was
				    an invented noun the payload never named and is not restored. */}
				{fixture.tieOut.ties ? (
					<span className="type-small  " style={{ color: "var(--status-success)" }}>
						ties
					</span>
				) : null}
			</div>
		</div>
	);
}

// ── L3: exceptions ───────────────────────────────────────────────────────────

function ExceptionRow({ ex }: { ex: Exception }): JSX.Element {
	return (
		<div
			className="border-width-thin flex items-start gap-[12px] rounded-[var(--r-subtle)]  p-[12px]"
			style={{
				borderColor: ex.needsYou ? "var(--status-error)" : "var(--border-subtle)",
				background: ex.needsYou ? "var(--status-error-dim)" : "var(--surface-container)",
			}}
		>
			<span
				className={`type-copy ${`shrink-0   ${NUM}`}`}
				style={{ color: ex.needsYou ? "var(--status-error)" : "var(--text-secondary)" }}
			>
				{fmtCents(ex.amount)}
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-[6px]">
					<span className="type-small   text-[var(--text-primary)]">{ex.title}</span>
					{/* BA2 T4e-a: `needsYou` is `optional` on the payload — its absence means
					    "unknown", not "confirmed routine". A "Timing" badge asserted the
					    latter unconditionally; only the confirmed-true case renders now. */}
					{ex.needsYou ? (
						<span
							className="type-label rounded-[var(--r-pill)] px-[6px] py-[3px]   uppercase "
							style={{ background: "var(--status-error)", color: "var(--surface-page)" }}
						>
							Needs you
						</span>
					) : null}
				</div>
				<p className={`type-metadata ${`mt-[3px]   text-[var(--text-secondary)] ${NUM}`}`}>
					{ex.detail}
				</p>
			</div>
		</div>
	);
}

// ── the canvas ───────────────────────────────────────────────────────────────

export interface ReviewMetricsMovedProps {
	readonly fixture: CloseFixture;
	/** which figure starts expanded (so all 3 layers are visible in a screenshot). */
	readonly initialExpandedFigureId?: string | null;
}

function ReviewMetricsMovedView({
	fixture,
	initialExpandedFigureId = "rev",
}: ReviewMetricsMovedProps): JSX.Element {
	const [expandedId, setExpandedId] = useState<string | null>(initialExpandedFigureId);

	return (
		<div className="max-w-[760px] bg-[var(--surface-page)] text-[var(--text-primary)]">
			<div className="p-[18px]">
				{/* BA2 T4e-a: the former L1 narrative ("Recognized revenue closed at …
				    from April. The period ties to bank; biggest open item is a $0.00
				    wire with no source.") asserted a full sentence of facts no payload
				    field backs — fixed month names, a bank tie claim, a coerced-to-zero
				    exception amount. Subtracted rather than reworded (§2.8.2 D); the
				    figure cards below already carry the real headline numbers. */}
				<div className="grid grid-cols-3 gap-[9px]">
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
				<div className="type-label mt-[18px] mb-[9px]   uppercase  text-[var(--text-tertiary)]">
					Roll-forward · reconciliation · {fixture.period}
				</div>
				<RollForwardTable fixture={fixture} />

				{/* ── L3 ── exceptions list (floated, biggest $ first) ── */}
				<div className="mt-[18px] mb-[9px] flex items-baseline gap-[6px]">
					<span className="type-label   uppercase  text-[var(--text-tertiary)]">Exceptions</span>
					<span className={`type-metadata ${` text-[var(--text-tertiary)] ${NUM}`}`}>
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
	// BA2 T4e-a: `MetricsMovedPayload.headlines[]` carries no per-figure source
	// at all — the old mapper invented one (`tool: "quickbooks"`, `source:
	// payload.period`). `provenance` is left undefined; the view renders the
	// disclosure only when there is real provenance to show (§2.8.2 D).
	const figures: MovedFigure[] = payload.headlines.map((h, i) => ({
		id: `fig-${i}`,
		label: h.label,
		prior: h.prior,
		current: h.current,
		headline: true,
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
	if (!isMetricsMovedPayload(artifact.payload)) {
		// BA2 T4e-a (ruling 14): a malformed payload gets the honest unknown-canvas
		// fallback, never the May-close demo fixture.
		return <ReviewUnknownCanvas artifact={artifact} />;
	}
	const fixture = mapMetricsPayload(artifact.payload);
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
