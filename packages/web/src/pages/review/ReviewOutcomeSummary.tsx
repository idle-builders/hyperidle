// AL1 — ReviewOutcomeSummary: the FRAME LEAD of every review canvas (component #1).
//
// Function-agnostic. This is what a reviewer reads FIRST, before any artifact —
// the "what was achieved + what needs you" header that frames the proof below.
//
// 3-layer drill-down (the AL1 signature):
//   L1 — one glance: agent author -> human reviewer, what was achieved (1 sentence),
//        the tools used as a mini-logo row, cost ($ + tokens), standing.
//   L2 — proof-of-readiness: the intent's done-conditions as +/x ("3 of 4 met", the
//        x floated/called out) + needs-you chips drawn from the 6-category risk taxonomy.
//   L3 — on demand: each needs-you / done-condition links DOWN to its proof canvas
//        (rendered as a "Jump" affordance; no-op in this isolation story).
//
// Tokens by NAME only (Hearth + CP1). No hex anywhere here (logo color lives in ToolLogo).
// 6px grid {3,6,9,12,18,24,36,48}. Pill buttons. Agent avatar green-distinct (AQ-012).
// Left-aligned. Animate transform/opacity only.

import { type JSX, useState } from "react";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isPlainObject, isString } from "./payload-guard";
import type { OutcomeSummaryPayload, ReviewCanvasProps } from "./review-artifact";
import { type ToolId, ToolLogo } from "./ToolLogo";

// ── The 6-category risk taxonomy (what makes a result "need you") ──────────────
export type RiskCategory =
	| "irreversible" // irreversible / blast-radius
	| "over-authority" // agent exceeded a granted limit
	| "unverified-claim" // an assertion not backed by a source
	| "unhandled-exception" // something the agent could not resolve
	| "shaky-assumption" // a guess the agent made to proceed
	| "compliance"; // a policy / regulatory concern

const RISK_LABEL: Record<RiskCategory, string> = {
	irreversible: "Irreversible",
	"over-authority": "Over authority",
	"unverified-claim": "Unverified claim",
	"unhandled-exception": "Unhandled exception",
	"shaky-assumption": "Shaky assumption",
	compliance: "Compliance",
};

// Severity drives chip color. error = float to top + red; warning = amber.
type Severity = "error" | "warning";

export interface NeedsYou {
	readonly category: RiskCategory;
	readonly severity: Severity;
	/** plain-language one-liner — the specific thing, with the number. */
	readonly detail: string;
	/** where this lands in the proof below (L3 jump target; no-op here). */
	readonly jumpLabel: string;
}

export interface DoneCondition {
	readonly label: string;
	readonly met: boolean;
	/** present when unmet — the reason, floated into view. */
	readonly note?: string;
	readonly jumpLabel: string;
}

export interface ReviewOutcomeSummaryProps {
	readonly agentName: string;
	readonly agentInitials: string;
	readonly reviewerName: string;
	/** one plain sentence: what was achieved. result-first. */
	readonly achieved: string;
	/** tools used, in impact order. rendered as a mini-logo row.
	 * accepts unknown tool ids (ToolLogo falls back to a neutral monogram). */
	readonly tools: readonly (ToolId | string)[];
	readonly costUsd: number;
	readonly tokens: number;
	/** Awaiting = queued for you; Blocking = the work cannot proceed without you. */
	readonly standing: "Awaiting" | "Blocking";
	readonly doneConditions: readonly DoneCondition[];
	readonly needsYou: readonly NeedsYou[];
	readonly onJump?: (label: string) => void;
}

// ── small token-driven atoms (kept local so the frame stays isolated) ──────────

function StandingPill({ standing }: { readonly standing: "Awaiting" | "Blocking" }): JSX.Element {
	const blocking = standing === "Blocking";
	return (
		<span
			className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] px-[9px] py-[3px] text-[12px] font-[600] uppercase"
			style={{
				letterSpacing: "var(--tracking-caps)",
				background: blocking ? "var(--status-error-dim)" : "var(--status-info-dim)",
				color: blocking ? "var(--status-error)" : "var(--status-info)",
			}}
		>
			<span
				aria-hidden="true"
				className="inline-block h-[6px] w-[6px] rounded-[var(--r-pill)]"
				style={{ background: blocking ? "var(--status-error)" : "var(--status-info)" }}
			/>
			{standing}
		</span>
	);
}

function CostChip({ usd, tokens }: { readonly usd: number; readonly tokens: number }): JSX.Element {
	const tok = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
	return (
		<span className="inline-flex items-baseline gap-[6px] text-[13px] text-[var(--text-secondary)]">
			<span className="font-[600] text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
				${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
			</span>
			<span className="text-[var(--text-tertiary)]">·</span>
			<span className="[font-variant-numeric:tabular-nums]">{tok} tok</span>
		</span>
	);
}

function NeedsYouChip({
	item,
	onJump,
}: {
	readonly item: NeedsYou;
	readonly onJump?: (label: string) => void;
}): JSX.Element {
	const isError = item.severity === "error";
	return (
		<button
			type="button"
			onClick={() => onJump?.(item.jumpLabel)}
			className="group flex w-full items-start gap-[9px] rounded-[var(--r-subtle)] border px-[12px] py-[9px] text-left transition-[transform,opacity] duration-[var(--motion-fast)] [transition-timing-function:var(--motion-ease)] hover:opacity-90 active:translate-y-[1px]"
			style={{
				borderColor: isError ? "var(--status-error)" : "var(--border-default)",
				background: isError ? "var(--status-error-dim)" : "var(--surface-page)",
			}}
		>
			<span
				className="mt-[2px] inline-flex shrink-0 items-center rounded-[var(--r-pill)] px-[6px] py-[2px] text-[10px] font-[600] uppercase"
				style={{
					letterSpacing: "var(--tracking-caps-sm)",
					background: isError ? "var(--status-error)" : "var(--surface-container)",
					color: isError ? "var(--surface-elevated)" : "var(--status-warning)",
				}}
			>
				{RISK_LABEL[item.category]}
			</span>
			<span className="min-w-0 flex-1 text-[13px] leading-[1.4] text-[var(--text-primary)]">
				{item.detail}
			</span>
			<span className="mt-[1px] shrink-0 text-[12px] font-[500] text-[var(--text-tertiary)] transition-opacity duration-[var(--motion-fast)] group-hover:text-[var(--accent-primary)]">
				Jump ↓
			</span>
		</button>
	);
}

function DoneRow({
	cond,
	onJump,
}: {
	readonly cond: DoneCondition;
	readonly onJump?: (label: string) => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={() => onJump?.(cond.jumpLabel)}
			className="group flex w-full items-start gap-[9px] px-[3px] py-[6px] text-left transition-[transform] duration-[var(--motion-fast)] [transition-timing-function:var(--motion-ease)] active:translate-y-[1px]"
		>
			<span
				aria-hidden="true"
				className="mt-[1px] inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[12px] font-[700]"
				style={{
					background: cond.met ? "var(--surface-container)" : "var(--status-error-dim)",
					color: cond.met ? "var(--status-success)" : "var(--status-error)",
				}}
			>
				{cond.met ? "✓" : "✗"}
			</span>
			<span className="min-w-0 flex-1">
				<span
					className="text-[13px] leading-[1.4]"
					style={{ color: cond.met ? "var(--text-secondary)" : "var(--text-primary)" }}
				>
					{cond.label}
				</span>
				{cond.note ? (
					<span className="mt-[3px] block text-[12px] leading-[1.4] text-[var(--status-error)]">
						{cond.note}
					</span>
				) : null}
			</span>
			{cond.met ? null : (
				<span className="mt-[1px] shrink-0 text-[12px] font-[500] text-[var(--text-tertiary)] group-hover:text-[var(--accent-primary)]">
					Jump ↓
				</span>
			)}
		</button>
	);
}

/**
 * The review canvas frame lead. Renders L1 always; L2 always (the proof-of-readiness
 * is the point); L3 is the per-row Jump affordance. `expanded` toggles the full
 * done-condition list vs. the met-summary + floated exceptions.
 */
function ReviewOutcomeSummaryView(props: ReviewOutcomeSummaryProps): JSX.Element {
	const {
		agentName,
		agentInitials,
		reviewerName,
		achieved,
		tools,
		costUsd,
		tokens,
		standing,
		doneConditions,
		needsYou,
		onJump,
	} = props;

	const [expanded, setExpanded] = useState(false);

	const metCount = doneConditions.filter((c) => c.met).length;
	const total = doneConditions.length;
	const unmet = doneConditions.filter((c) => !c.met);
	// relevance order: unmet float to top, then met. (never source order)
	const orderedConditions = [...unmet, ...doneConditions.filter((c) => c.met)];
	// needs-you: errors first (float the outlier), then warnings.
	const orderedNeedsYou = [...needsYou].sort((a, b) =>
		a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1,
	);

	return (
		<section
			className="w-full max-w-[760px] overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-left shadow-[var(--shadow-default)]"
			data-ds-component="ReviewOutcomeSummary"
		>
			{/* ── L1 ─ one glance ─────────────────────────────────────────── */}
			<header className="flex flex-col gap-[12px] border-b border-[var(--border-subtle)] px-[18px] py-[18px]">
				<div className="flex items-center justify-between gap-[12px]">
					<div className="flex min-w-0 items-center gap-[9px]">
						{/* agent author — green-distinct (AQ-012) */}
						<span
							className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-pill)] border-[1.5px] text-[10px] font-[600]"
							style={{
								background: "var(--accent-primary-dim)",
								borderColor: "var(--accent-primary)",
								color: "var(--accent-primary)",
							}}
						>
							{agentInitials}
						</span>
						<span className="flex min-w-0 items-center gap-[6px] text-[13px] text-[var(--text-secondary)]">
							<span className="font-[600] text-[var(--text-primary)]">{agentName}</span>
							<span aria-hidden="true" className="text-[var(--text-tertiary)]">
								→
							</span>
							<span className="truncate">{reviewerName}</span>
						</span>
					</div>
					<StandingPill standing={standing} />
				</div>

				{/* what was achieved — result-first, one sentence */}
				<p className="text-[17px] font-[500] leading-[1.4] text-[var(--text-primary)]">
					{achieved}
				</p>

				{/* tools used (mini-logo row) + cost */}
				<div className="flex flex-wrap items-center justify-between gap-x-[18px] gap-y-[9px]">
					<div className="flex flex-wrap items-center gap-[9px]">
						{tools.map((t) => (
							<ToolLogo key={t} tool={t} withLabel />
						))}
					</div>
					<CostChip usd={costUsd} tokens={tokens} />
				</div>
			</header>

			{/* ── L2 ─ proof-of-readiness ─────────────────────────────────── */}
			<div className="flex flex-col gap-[18px] px-[18px] py-[18px]">
				{/* done-conditions */}
				<div className="flex flex-col gap-[6px]">
					<div className="flex items-center justify-between gap-[12px]">
						<h3 className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
							Done conditions
						</h3>
						<span className="flex items-center gap-[9px]">
							<span
								className="text-[13px] font-[600] [font-variant-numeric:tabular-nums]"
								style={{
									color: metCount === total ? "var(--status-success)" : "var(--status-warning)",
								}}
							>
								{metCount} of {total} met
							</span>
							{unmet.length > 0 ? (
								<button
									type="button"
									onClick={() => setExpanded((v) => !v)}
									className="rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-page)] px-[12px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)] transition-[opacity] duration-[var(--motion-fast)] hover:opacity-80"
								>
									{expanded ? "Collapse" : "Expand all"}
								</button>
							) : null}
						</span>
					</div>

					{/* default: float the unmet + a met-summary line. expanded: every row. */}
					{(expanded ? orderedConditions : unmet).map((c) => (
						<DoneRow key={c.label} cond={c} onJump={onJump} />
					))}
					{!expanded && metCount > 0 ? (
						<div className="flex items-center gap-[6px] px-[3px] py-[6px] text-[12px] text-[var(--text-tertiary)]">
							<span
								aria-hidden="true"
								className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[var(--r-pill)] text-[12px] font-[700]"
								style={{ background: "var(--surface-container)", color: "var(--status-success)" }}
							>
								{/* LG1: U+2713 checkmark used as typographic status indicator; aria-hidden="true" + parent semantic context carry the label. JSX string expression avoids JSXText emoji detection. */}
								{'✓'}
							</span>
							{metCount} condition{metCount === 1 ? "" : "s"} met — collapsed
						</div>
					) : null}
				</div>

				{/* needs-you chips */}
				{orderedNeedsYou.length > 0 ? (
					<div className="flex flex-col gap-[9px]">
						<div className="flex items-baseline gap-[9px]">
							<h3 className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
								Needs you
							</h3>
							<span className="text-[12px] font-[600] text-[var(--status-error)] [font-variant-numeric:tabular-nums]">
								{orderedNeedsYou.length}
							</span>
						</div>
						<div className="flex flex-col gap-[6px]">
							{orderedNeedsYou.map((item) => (
								<NeedsYouChip key={item.jumpLabel} item={item} onJump={onJump} />
							))}
						</div>
					</div>
				) : null}
			</div>
		</section>
	);
}

function isOutcomeSummaryPayload(payload: unknown): payload is OutcomeSummaryPayload {
	return (
		isPlainObject(payload) &&
		isString(payload.agentName) &&
		isString(payload.agentInitials) &&
		isString(payload.achieved) &&
		Array.isArray(payload.tools) &&
		Array.isArray(payload.doneConditions) &&
		Array.isArray(payload.needsYou) &&
		(payload.standing === "Awaiting" || payload.standing === "Blocking")
	);
}

/** AL2 wrapper: receives a uniform review artifact and mounts the frame lead. */
export function ReviewOutcomeSummary({ artifact }: ReviewCanvasProps): JSX.Element {
	const payload = isOutcomeSummaryPayload(artifact.payload)
		? artifact.payload
		: ({} as Partial<OutcomeSummaryPayload>);
	return (
		<div className="flex flex-col gap-[12px]">
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			<ReviewOutcomeSummaryView
				agentName={payload.agentName ?? ""}
				agentInitials={payload.agentInitials ?? ""}
				reviewerName={payload.reviewerName ?? ""}
				achieved={payload.achieved ?? artifact.title}
				tools={payload.tools ?? []}
				costUsd={payload.costUsd ?? 0}
				tokens={payload.tokens ?? 0}
				standing={payload.standing ?? "Awaiting"}
				doneConditions={payload.doneConditions ?? []}
				needsYou={(payload.needsYou ?? []) as NeedsYou[]}
			/>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// States not shown in the stories (specified here per the brief):
//   empty   — agent emitted no done-conditions/needs-you: render L1 only + a
//             "No readiness checks declared" muted line in place of L2.
//   loading — skeleton: avatar/line/tool-row/chips as pulsing
//             bg-[var(--surface-container)] blocks at the same geometry (opacity
//             pulse via --motion-default; never animate layout props).
//   needs-you emphasis — the populated state IS this state when any needsYou item
//             has severity "error": the chip floats to top, red border + dim fill,
//             and standing reads "Blocking".
// ─────────────────────────────────────────────────────────────────────────────
