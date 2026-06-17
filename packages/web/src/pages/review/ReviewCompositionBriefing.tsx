// AL1 — composition variant A: "Briefing". ONE whole review as a single ~860px
// reading column on --surface-page. The frame + Subject (the artifact stack) +
// conversation + verdict compose top-to-bottom into one scannable briefing that
// ends in a binding decision. The code artifact is EXPANDED by default and renders
// the REAL building block <ReviewCodeDiff /> inline — proof that the building blocks
// compose into the review surface; the other 3 artifacts stay collapsed rows.
//
// Three-layer drill-down at the COMPOSITION altitude:
//   L1  the frame   — breadcrumb · work identity · agent→you · standing · tools · cost
//   L2  outcome     — the outcome sentence · intent done-conditions (✓/✗) · NEEDS YOU
//   L2  the stack   — 4 artifacts as collapsible rows, relevance-ordered (code first,
//                     the staged deploy floated for its needs-you, tests + visual lower)
//   L3  on demand   — a row expands; the code row's L3 IS the full ReviewCodeDiff canvas
// then CONVERSATION (anchored comments + composer) and a pinned VERDICT BAR.
//
// Presentational isolation: local useState for collapse/expand; every callback no-op.
// No router/context/providers. Tokens by NAME only (no hex outside ToolLogo). 6px grid.

import { type JSX, useState } from "react";
import { ReviewCodeDiff } from "./ReviewCodeDiff";
import {
	type ArtifactKind,
	type NeedItem,
	type NeedKind,
	REVIEW_SUBJECT,
	type SubjectArtifactRow,
} from "./review-subject.fixture";
import { type ToolId, ToolLogo } from "./ToolLogo";

// ── small shared glyphs ───────────────────────────────────────────────────────────

function Chevron({ open }: { readonly open: boolean }): JSX.Element {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 12 12"
			className="h-[12px] w-[12px] shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
			style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
		>
			<path d="M4 2.5 L8 6 L4 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function CheckGlyph(): JSX.Element {
	return (
		<svg aria-hidden="true" viewBox="0 0 12 12" className="h-[11px] w-[11px]">
			<path d="M2.5 6.2 L5 8.5 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

// ── L1: the frame header ──────────────────────────────────────────────────────────

function FrameHeader(): JSX.Element {
	const s = REVIEW_SUBJECT;
	const initials = s.author.slice(0, 2).toUpperCase();
	return (
		<header className="flex flex-col gap-[12px] border-b border-[var(--border-subtle)] px-[24px] py-[18px]">
			{/* breadcrumb: Bet › Task */}
			<nav aria-label="Breadcrumb" className="flex items-center gap-[6px] text-[12px] text-[var(--text-tertiary)]">
				<span>Checkout reliability</span>
				<span aria-hidden="true">›</span>
				<span className="text-[var(--text-secondary)]">Fix expired-promo checkout</span>
			</nav>

			{/* work identity */}
			<h1 className="text-[20px] font-[600] leading-[1.3] text-[var(--text-primary)]">{s.workIdentity}</h1>

			{/* meta strip: agent→you · standing · tools · cost */}
			<div className="flex flex-wrap items-center gap-x-[18px] gap-y-[9px]">
				<span className="flex items-center gap-[9px] text-[13px] text-[var(--text-secondary)]">
					{/* agent author — green-distinct (AQ-012) */}
					<span
						className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[var(--r-pill)] border-[1.5px] text-[10px] font-[600]"
						style={{
							background: "var(--accent-primary-dim)",
							borderColor: "var(--accent-primary)",
							color: "var(--accent-primary)",
						}}
					>
						{initials}
					</span>
					<span className="font-[600] text-[var(--text-primary)]">{s.author}</span>
					<span aria-hidden="true" className="text-[var(--text-tertiary)]">
						→
					</span>
					<span>{s.reviewer}</span>
				</span>

				{/* standing pill — Awaiting · Blocking */}
				<span
					className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] px-[9px] py-[3px] text-[12px] font-[600]"
					style={{ background: "var(--status-error-dim)", color: "var(--status-error)" }}
				>
					<span
						aria-hidden="true"
						className="inline-block h-[6px] w-[6px] rounded-[var(--r-pill)]"
						style={{ background: "var(--status-error)" }}
					/>
					{s.standing} {s.blocking ? "· Blocking" : ""}
				</span>

				{/* tools row — mini-logos */}
				<span className="flex items-center gap-[9px]">
					{s.tools.map((t: ToolId) => (
						<ToolLogo key={t} tool={t} withLabel />
					))}
				</span>

				{/* cost */}
				<span className="inline-flex items-baseline gap-[6px] text-[13px] text-[var(--text-secondary)]">
					<span className="font-[600] text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">{s.costMoney}</span>
					<span className="text-[var(--text-tertiary)]">·</span>
					<span className="[font-variant-numeric:tabular-nums]">{s.costTokens}</span>
				</span>
			</div>
		</header>
	);
}

// ── L2: outcome block ─────────────────────────────────────────────────────────────

const NEED_LABEL: Record<NeedKind, string> = {
	"blast-radius": "Blast radius",
	"over-authority": "Over authority",
	"unhandled-exception": "Unhandled exception",
	"unverified-claim": "Unverified claim",
};

function NeedChip({ need }: { readonly need: NeedItem }): JSX.Element {
	return (
		<button
			type="button"
			onClick={() => {}}
			className="group flex w-full items-start gap-[9px] rounded-[var(--r-subtle)] border px-[12px] py-[9px] text-left transition-[transform,opacity] duration-[var(--motion-fast)] [transition-timing-function:var(--motion-ease)] hover:opacity-90 active:translate-y-[1px]"
			style={{ borderColor: "var(--status-error)", background: "var(--status-error-dim)" }}
		>
			<span
				className="mt-[1px] inline-flex shrink-0 items-center rounded-[var(--r-pill)] px-[6px] py-[2px] text-[10px] font-[600] uppercase"
				style={{ letterSpacing: "var(--tracking-caps-sm)", background: "var(--status-error)", color: "var(--surface-elevated)" }}
			>
				{NEED_LABEL[need.kind]}
			</span>
			<span className="min-w-0 flex-1">
				<span className="block text-[13px] font-[600] leading-[1.4] text-[var(--text-primary)]">{need.label}</span>
				<span className="mt-[3px] block text-[12px] leading-[1.45] text-[var(--text-secondary)]">{need.detail}</span>
			</span>
			<span className="mt-[1px] shrink-0 text-[12px] font-[500] text-[var(--text-tertiary)] group-hover:text-[var(--accent-primary)]">
				Jump ↓
			</span>
		</button>
	);
}

function OutcomeBlock(): JSX.Element {
	const s = REVIEW_SUBJECT;
	const metCount = s.intent.filter((c) => c.met).length;
	const total = s.intent.length;
	// relevance order: unmet float to top, then met (never source order).
	const ordered = [...s.intent].filter((c) => !c.met).concat(s.intent.filter((c) => c.met));
	return (
		<section className="flex flex-col gap-[18px] border-b border-[var(--border-subtle)] px-[24px] py-[18px]">
			{/* the outcome sentence — primary, result-first */}
			<p className="max-w-[72ch] text-[15px] leading-[1.55] text-[var(--text-primary)]">{s.outcome}</p>

			{/* intent done-conditions */}
			<div className="flex flex-col gap-[6px]">
				<div className="flex items-baseline justify-between gap-[12px]">
					<h2 className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">Done conditions</h2>
					<span
						className="text-[13px] font-[600] [font-variant-numeric:tabular-nums]"
						style={{ color: metCount === total ? "var(--status-success)" : "var(--status-warning)" }}
					>
						{metCount} of {total} met
					</span>
				</div>
				{ordered.map((c) => (
					<div key={c.text} className="flex items-start gap-[9px] px-[3px] py-[3px]">
						<span
							aria-hidden="true"
							className="mt-[1px] inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[12px] font-[700]"
							style={{
								background: c.met ? "var(--surface-container)" : "var(--status-error-dim)",
								color: c.met ? "var(--status-success)" : "var(--status-error)",
							}}
						>
							{c.met ? "✓" : "✗"}
						</span>
						<span
							className="text-[13px] leading-[1.4]"
							style={{ color: c.met ? "var(--text-secondary)" : "var(--text-primary)", fontWeight: c.met ? 400 : 600 }}
						>
							{c.text}
						</span>
					</div>
				))}
			</div>

			{/* NEEDS YOU — the risk chips */}
			<div className="flex flex-col gap-[9px]">
				<div className="flex items-baseline gap-[9px]">
					<h2 className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--status-error)]">Needs you</h2>
					<span className="text-[12px] font-[600] text-[var(--status-error)] [font-variant-numeric:tabular-nums]">{s.needs.length}</span>
				</div>
				<div className="flex flex-col gap-[6px]">
					{s.needs.map((n) => (
						<NeedChip key={n.label} need={n} />
					))}
				</div>
			</div>
		</section>
	);
}

// ── L2: the artifact stack ──────────────────────────────────────────────────────────

const KIND_LABEL: Record<ArtifactKind, string> = {
	code: "Code",
	data: "Data",
	action: "Action",
	visual: "Visual",
};

const KIND_STYLE: Record<ArtifactKind, { bg: string; fg: string }> = {
	code: { bg: "var(--surface-container)", fg: "var(--text-secondary)" },
	data: { bg: "var(--surface-container)", fg: "var(--status-success)" },
	action: { bg: "color-mix(in oklab, var(--status-warning) 14%, transparent)", fg: "var(--status-warning)" },
	visual: { bg: "var(--surface-container)", fg: "var(--status-info)" },
};

function KindBadge({ kind }: { readonly kind: ArtifactKind }): JSX.Element {
	const c = KIND_STYLE[kind];
	return (
		<span
			className="inline-flex shrink-0 items-center rounded-[var(--r-pill)] px-[6px] py-[2px] text-[10px] font-[600] uppercase"
			style={{ letterSpacing: "var(--tracking-caps-sm)", background: c.bg, color: c.fg }}
		>
			{KIND_LABEL[kind]}
		</span>
	);
}

function ArtifactRow({
	row,
	open,
	onToggle,
	children,
}: {
	readonly row: SubjectArtifactRow;
	readonly open: boolean;
	readonly onToggle: () => void;
	/** the real building block, rendered as L3 when expanded (code row only). */
	readonly children?: JSX.Element;
}): JSX.Element {
	const needs = Boolean(row.needsYou);
	return (
		<div
			className="overflow-hidden rounded-[var(--r-subtle)] border bg-[var(--surface-elevated)]"
			style={{
				borderColor: needs ? "var(--status-warning)" : "var(--border-subtle)",
				boxShadow: open ? "var(--shadow-default)" : "none",
			}}
		>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={open}
				className="flex w-full items-center gap-[9px] px-[12px] py-[12px] text-left transition-[opacity] duration-[var(--motion-fast)] hover:opacity-90"
			>
				<Chevron open={open} />
				<KindBadge kind={row.kind} />
				<ToolLogo tool={row.tool} />
				<span className="flex min-w-0 flex-1 flex-col gap-[2px]">
					<span className="truncate font-mono text-[13px] font-[600] text-[var(--text-primary)]">{row.title}</span>
					<span className="truncate text-[12px] leading-[1.35] text-[var(--text-secondary)]">{row.summary}</span>
				</span>

				{/* needs-you flag floats with the row */}
				{needs ? (
					<span
						className="hidden shrink-0 items-center rounded-[var(--r-pill)] px-[9px] py-[3px] text-[11px] font-[600] sm:inline-flex"
						style={{ background: "color-mix(in oklab, var(--status-warning) 14%, transparent)", color: "var(--status-warning)" }}
					>
						Needs you
					</span>
				) : null}

				{/* change badge */}
				<span className="shrink-0 rounded-[var(--r-pill)] bg-[var(--surface-container)] px-[9px] py-[3px] font-mono text-[12px] font-[600] tabular-nums text-[var(--text-secondary)]">
					{row.badge}
				</span>

				{/* reviewed check — white-on-accent when reviewed (mirrors ReviewCodeDiff's ReviewedBox) */}
				<span
					aria-hidden="true"
					className={[
						"inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border-[1.5px]",
						row.reviewed
							? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white"
							: "bg-[var(--surface-elevated)] border-[var(--border-default)] text-transparent",
					].join(" ")}
				>
					<CheckGlyph />
				</span>
			</button>

			{/* L3 — the real building block, full width, inline */}
			{open && children ? <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-container)] p-[18px]">{children}</div> : null}
			{open && !children ? (
				<div className="border-t border-[var(--border-subtle)] bg-[var(--surface-container)] px-[18px] py-[18px] text-[13px] leading-[1.5] text-[var(--text-secondary)]">
					{/* collapsed artifacts: when opened in isolation they'd mount their own building block
					    (ReviewMetricsMoved / ReviewActionOperation / ReviewVisualDiff). Here only the
					    code block is wired inline; the rest show their summary on expand. */}
					{row.summary}
				</div>
			) : null}
		</div>
	);
}

function ArtifactStack(): JSX.Element {
	const s = REVIEW_SUBJECT;
	// relevance order: code first, then the staged deploy floated up (it carries
	// needs-you), then tests + visual lower. Never source/alpha order.
	const RANK: Record<string, number> = { a_code: 0, a_deploy: 1, a_tests: 2, a_visual: 3 };
	const ordered = [...s.artifacts].sort((a, b) => (RANK[a.id] ?? 9) - (RANK[b.id] ?? 9));

	const [open, setOpen] = useState<ReadonlySet<string>>(
		() => new Set(s.artifacts.filter((a) => a.expanded).map((a) => a.id)),
	);
	function toggle(id: string): void {
		setOpen((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}
	function collapseAll(): void {
		setOpen(new Set());
	}

	return (
		<section className="flex flex-col gap-[12px] border-b border-[var(--border-subtle)] px-[24px] py-[18px]">
			<div className="flex items-baseline justify-between gap-[12px]">
				<h2 className="text-[13px] font-[600] text-[var(--text-primary)]">
					What {s.author} produced ·{" "}
					<span className="text-[var(--text-tertiary)] [font-variant-numeric:tabular-nums]">{s.artifacts.length} artifacts</span>
				</h2>
				<button
					type="button"
					onClick={collapseAll}
					className="rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[12px] font-[500] text-[var(--text-secondary)] transition-[opacity] duration-[var(--motion-fast)] hover:opacity-80"
				>
					Collapse all
				</button>
			</div>

			<div className="flex flex-col gap-[9px]">
				{ordered.map((row) => (
					<ArtifactRow key={row.id} row={row} open={open.has(row.id)} onToggle={() => toggle(row.id)}>
						{/* the code artifact's L3 IS the real building block, full width inline */}
						{row.id === "a_code" ? <ReviewCodeDiff /> : undefined}
					</ArtifactRow>
				))}
			</div>
		</section>
	);
}

// ── conversation ────────────────────────────────────────────────────────────────────

function Conversation(): JSX.Element {
	const s = REVIEW_SUBJECT;
	return (
		<section className="flex flex-col gap-[12px] px-[24px] py-[18px]">
			<h2 className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">Conversation</h2>

			<div className="flex flex-col gap-[12px]">
				{s.conversation.map((c) => {
					const initials = c.author.slice(0, 2).toUpperCase();
					return (
						<div key={c.id} className="flex gap-[9px]">
							<span
								className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[10px] font-[600]"
								style={
									c.isAgent
										? { background: "var(--accent-primary-dim)", border: "1.5px solid var(--accent-primary)", color: "var(--accent-primary)" }
										: { background: "var(--surface-container)", border: "1.5px solid var(--border-default)", color: "var(--text-secondary)" }
								}
							>
								{initials}
							</span>
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-baseline gap-[9px]">
									<span className="text-[13px] font-[600] text-[var(--text-primary)]">{c.author}</span>
									{c.anchor ? (
										<span className="inline-flex items-center rounded-[var(--r-pill)] bg-[var(--surface-container)] px-[6px] py-[2px] font-mono text-[11px] text-[var(--text-tertiary)]">
											{c.anchor}
										</span>
									) : null}
									<span className="text-[12px] text-[var(--text-tertiary)]">{c.ago}</span>
								</div>
								<p className="mt-[3px] text-[13px] leading-[1.5] text-[var(--text-secondary)]">{c.body}</p>
							</div>
						</div>
					);
				})}
			</div>

			{/* composer */}
			<div className="flex items-center gap-[9px] rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[9px]">
				<input
					type="text"
					placeholder="Reply, or anchor a comment to a line…"
					className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
				/>
				<button
					type="button"
					onClick={() => {}}
					className="shrink-0 rounded-[var(--r-pill)] bg-[var(--accent-primary)] px-[12px] py-[6px] text-[12px] font-[600] text-white transition-[opacity] duration-[var(--motion-fast)] hover:opacity-90"
				>
					Comment
				</button>
			</div>
		</section>
	);
}

// ── the pinned verdict bar ──────────────────────────────────────────────────────────

type VerdictTone = "approve" | "neutral" | "danger";

interface Verdict {
	readonly label: string;
	readonly tone: VerdictTone;
}

const VERDICTS: readonly Verdict[] = [
	{ label: "Approve", tone: "approve" },
	{ label: "Approve w/ comments", tone: "approve" },
	{ label: "Request changes", tone: "neutral" },
	{ label: "Edit", tone: "neutral" },
	{ label: "Reject", tone: "danger" },
];

const VERDICT_TONE: Record<"primary" | "danger" | "neutral", string> = {
	primary: "bg-[var(--accent-primary)] text-white border border-[var(--accent-primary)]",
	danger: "bg-[var(--surface-elevated)] border border-[var(--status-error)] text-[var(--status-error)]",
	neutral: "bg-[var(--surface-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)]",
};

function VerdictButton({ verdict, primary }: { readonly verdict: Verdict; readonly primary: boolean }): JSX.Element {
	const key = verdict.tone === "approve" && primary ? "primary" : verdict.tone === "danger" ? "danger" : "neutral";
	return (
		<button
			type="button"
			onClick={() => {}}
			className={[
				"rounded-[var(--r-pill)] px-[18px] py-[9px] text-[13px] font-[600] transition-[transform,opacity] duration-[var(--motion-fast)] [transition-timing-function:var(--motion-ease)] active:translate-y-[1px]",
				VERDICT_TONE[key],
			].join(" ")}
		>
			{verdict.label}
		</button>
	);
}

function VerdictBar(): JSX.Element {
	return (
		<div
			className="sticky bottom-0 flex flex-wrap items-center justify-between gap-[12px] border-t border-[var(--border-strong)] bg-[var(--surface-elevated)] px-[24px] py-[12px] shadow-[var(--shadow-elevated)]"
			style={{ zIndex: "var(--z-sticky)" }}
		>
			<span
				className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] px-[9px] py-[3px] text-[12px] font-[600]"
				style={{ background: "color-mix(in oklab, var(--status-warning) 14%, transparent)", color: "var(--status-warning)" }}
			>
				<span aria-hidden="true" className="inline-block h-[6px] w-[6px] rounded-[var(--r-pill)]" style={{ background: "var(--status-warning)" }} />
				Blocking · deploy staged
			</span>
			<div className="flex flex-wrap items-center gap-[9px]">
				{VERDICTS.map((v, i) => (
					<VerdictButton key={v.label} verdict={v} primary={i === 0} />
				))}
			</div>
		</div>
	);
}

// ── the whole review ────────────────────────────────────────────────────────────────

/**
 * Variant A — "Briefing". One review = frame + outcome + artifact stack (Subject) +
 * conversation + pinned verdict, as a single reading column. Examine nests inline:
 * the code artifact expands in place into the real <ReviewCodeDiff /> building block.
 */
export function ReviewCompositionBriefing(): JSX.Element {
	return (
		<div className="flex h-full flex-col bg-[var(--surface-page)]">
			{/* the scrolling reading column */}
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto w-full max-w-[860px]">
					<FrameHeader />
					<OutcomeBlock />
					<ArtifactStack />
					<Conversation />
				</div>
			</div>

			{/* pinned verdict bar — anchored to the column width */}
			<div className="mx-auto w-full max-w-[860px]">
				<VerdictBar />
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────────
// States not shown in the story (specified here per the brief):
//   empty   — a Subject with zero artifacts: frame + outcome render, the stack shows
//             "No artifacts produced" muted line; verdict bar still pins (Approve enabled).
//   loading — skeleton: frame line + 3 pulsing artifact-row blocks (opacity pulse via
//             --motion-default; never animate layout props); verdict bar disabled.
//   error   — "Couldn't load this review." + Retry pill in place of the stack.
//   needs-you emphasis — the populated state IS this state: the staged-deploy artifact
//             floats up the stack, carries a warning rule + "Needs you" flag, and the
//             two needs chips lead the outcome block with red borders.
// ─────────────────────────────────────────────────────────────────────────────────
