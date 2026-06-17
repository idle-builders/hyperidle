// AL1 — Variant C "Focus-flow": ONE whole review composed from the building blocks.
//
// The idea: a calm review HOME you can approve from at a glance, but any artifact
// opens into a FULL-SCREEN FOCUS to examine it deeply one-at-a-time, then return.
// Best when artifacts are large and reviewed sequentially. The drill-and-return
// rhythm: HOME scans the Subject → Examine → opens FOCUS on one artifact (full size,
// its real building block + a conversation rail anchored to it) → Back → HOME.
//
// 3-layer layering holds at BOTH surfaces:
//   HOME  L1 frame (work identity, agent→you, standing, tools, cost)
//         L2 outcome sentence + intent (3✓/1✗) + Needs-you (2 risks)
//         L3 Artifacts·4 collapsed rows (kind badge + ToolLogo + title + badge +
//            reviewed + "Examine →") — each row's L3 is the FOCUS surface.
//   FOCUS L1 focus header (← Back · title · prev/next · Mark reviewed)
//         L2 the building block at FULL SIZE (code → the real <ReviewCodeDiff />)
//         L3 a conversation rail anchored to this artifact + composer.
//
// Presentational isolation: local useState for surface (home/focus) + active artifact
// + per-artifact reviewed. Every verdict/comment callback is a no-op. NO router/context/
// MockProviders. Strict TS. Tokens by NAME only (logo color lives in ToolLogo).

import { type JSX, useState } from "react";
import { ReviewCodeDiff } from "./ReviewCodeDiff.js";
import { ToolLogo } from "./ToolLogo.js";
import {
	type ArtifactKind,
	type NeedItem,
	REVIEW_SUBJECT,
	type ReviewComment,
	type ReviewSubject,
	type SubjectArtifactRow,
} from "./review-subject.fixture.js";

// ── kind vocabulary: badge label + tint (the artifact's family at a glance) ─────────
const KIND_LABEL: Record<ArtifactKind, string> = {
	code: "Code",
	data: "Data",
	action: "Action",
	visual: "Visual",
};

// each kind gets a calm token-driven tint for its badge (no hex).
const KIND_TINT: Record<ArtifactKind, { bg: string; fg: string }> = {
	code: { bg: "var(--surface-container)", fg: "var(--text-secondary)" },
	data: { bg: "color-mix(in_oklab,var(--status-success)_14%,transparent)", fg: "var(--status-success)" },
	action: { bg: "color-mix(in_oklab,var(--status-warning)_16%,transparent)", fg: "var(--status-warning)" },
	visual: { bg: "color-mix(in_oklab,var(--status-info)_14%,transparent)", fg: "var(--status-info)" },
};

const NEED_LABEL: Record<NeedItem["kind"], string> = {
	"blast-radius": "Blast radius",
	"over-authority": "Over authority",
	"unhandled-exception": "Unhandled",
	"unverified-claim": "Unverified claim",
};

// ── tiny glyphs ─────────────────────────────────────────────────────────────────────
function CheckGlyph(): JSX.Element {
	return (
		<svg aria-hidden="true" viewBox="0 0 12 12" className="h-[11px] w-[11px]">
			<path d="M2.5 6.2 L5 8.5 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function ArrowGlyph({ dir }: { readonly dir: "left" | "right" }): JSX.Element {
	return (
		<svg aria-hidden="true" viewBox="0 0 12 12" className="h-[12px] w-[12px]">
			<path
				d={dir === "left" ? "M7.5 2.5 L4 6 L7.5 9.5" : "M4.5 2.5 L8 6 L4.5 9.5"}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** reviewed pill — accent fill when on (no-op toggle). */
function ReviewedPill({ reviewed, onToggle }: { readonly reviewed: boolean; readonly onToggle: () => void }): JSX.Element {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onToggle();
			}}
			aria-pressed={reviewed}
			className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] border px-[9px] py-[3px] text-[12px] font-[500] transition-[transform,opacity] duration-[var(--motion-fast)] [transition-timing-function:var(--motion-ease)] active:translate-y-[1px]"
			style={{
				background: reviewed ? "var(--accent-primary)" : "var(--surface-elevated)",
				borderColor: reviewed ? "var(--accent-primary)" : "var(--border-default)",
				color: reviewed ? "#ffffff" : "var(--text-secondary)",
			}}
		>
			<span
				className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-[var(--r-pill)]"
				style={{ color: reviewed ? "#ffffff" : "var(--text-tertiary)" }}
			>
				<CheckGlyph />
			</span>
			{reviewed ? "Reviewed" : "Mark reviewed"}
		</button>
	);
}

// ── HOME: the frame header (L1) ──────────────────────────────────────────────────────
function HomeHeader({ subject }: { readonly subject: ReviewSubject }): JSX.Element {
	const blocking = subject.blocking;
	return (
		<header className="flex flex-col gap-[12px] border-b border-[var(--border-subtle)] px-[24px] py-[18px]">
			<div className="flex items-center justify-between gap-[12px]">
				<div className="flex min-w-0 items-center gap-[9px]">
					{/* agent author — green-distinct (AQ-012) */}
					<span
						className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[var(--r-pill)] border-[1.5px] text-[10px] font-[600]"
						style={{
							background: "var(--accent-primary-dim)",
							borderColor: "var(--accent-primary)",
							color: "var(--accent-primary)",
						}}
					>
						{subject.author.slice(0, 2).toUpperCase()}
					</span>
					<span className="flex min-w-0 items-center gap-[6px] text-[13px] text-[var(--text-secondary)]">
						<span className="font-[600] text-[var(--text-primary)]">{subject.author}</span>
						<span aria-hidden="true" className="text-[var(--text-tertiary)]">
							→
						</span>
						<span className="truncate">{subject.reviewer}</span>
					</span>
				</div>
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
					Awaiting · Blocking
				</span>
			</div>

			<h1 className="text-[20px] font-[600] leading-[1.3] text-[var(--text-primary)]">{subject.workIdentity}</h1>

			<div className="flex flex-wrap items-center justify-between gap-x-[18px] gap-y-[9px]">
				<div className="flex flex-wrap items-center gap-[9px]">
					{subject.tools.map((t) => (
						<ToolLogo key={t} tool={t} size="sm" withLabel />
					))}
				</div>
				<span className="inline-flex items-baseline gap-[6px] text-[13px] text-[var(--text-secondary)]">
					<span className="font-[600] text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">{subject.costMoney}</span>
					<span className="text-[var(--text-tertiary)]">·</span>
					<span className="[font-variant-numeric:tabular-nums]">{subject.costTokens}</span>
					<span className="text-[var(--text-tertiary)]">·</span>
					<span className="text-[var(--text-tertiary)]">{subject.producedAgo}</span>
				</span>
			</div>
		</header>
	);
}

// ── HOME: outcome sentence + intent + needs-you (L2) ─────────────────────────────────
function OutcomeBlock({ subject }: { readonly subject: ReviewSubject }): JSX.Element {
	const met = subject.intent.filter((i) => i.met).length;
	const total = subject.intent.length;
	const unmet = subject.intent.filter((i) => !i.met);
	const ordered = [...unmet, ...subject.intent.filter((i) => i.met)];
	return (
		<div className="flex flex-col gap-[18px] px-[24px] py-[18px]">
			{/* the outcome sentence — result-first, the lead of the whole review */}
			<p className="max-w-[68ch] text-[15px] leading-[1.55] text-[var(--text-primary)]">{subject.outcome}</p>

			{/* intent done-conditions: count + the unmet floated, met collapsed-to-summary */}
			<div className="flex flex-col gap-[6px]">
				<div className="flex items-center justify-between gap-[12px]">
					<h2 className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">Intent</h2>
					<span
						className="text-[13px] font-[600] [font-variant-numeric:tabular-nums]"
						style={{ color: met === total ? "var(--status-success)" : "var(--status-warning)" }}
					>
						{met} of {total} met
					</span>
				</div>
				{ordered.map((cond) => (
					<div key={cond.text} className="flex items-start gap-[9px] px-[3px] py-[3px]">
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
						<span
							className="text-[13px] leading-[1.4]"
							style={{ color: cond.met ? "var(--text-secondary)" : "var(--text-primary)" }}
						>
							{cond.text}
						</span>
					</div>
				))}
			</div>

			{/* needs-you: the risks, error-floated. each links to its artifact's focus. */}
			<div className="flex flex-col gap-[9px]">
				<div className="flex items-baseline gap-[9px]">
					<h2 className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">Needs you</h2>
					<span className="text-[12px] font-[600] text-[var(--status-error)] [font-variant-numeric:tabular-nums]">{subject.needs.length}</span>
				</div>
				{subject.needs.map((need) => (
					<div
						key={need.label}
						className="flex items-start gap-[9px] rounded-[var(--r-subtle)] border px-[12px] py-[9px]"
						style={{ borderColor: "var(--status-error)", background: "var(--status-error-dim)" }}
					>
						<span
							className="mt-[1px] inline-flex shrink-0 items-center rounded-[var(--r-pill)] px-[6px] py-[2px] text-[10px] font-[600] uppercase"
							style={{ letterSpacing: "var(--tracking-caps-sm)", background: "var(--status-error)", color: "var(--surface-elevated)" }}
						>
							{NEED_LABEL[need.kind]}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block text-[13px] font-[500] leading-[1.4] text-[var(--text-primary)]">{need.label}</span>
							<span className="mt-[2px] block text-[12px] leading-[1.4] text-[var(--text-secondary)]">{need.detail}</span>
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

// ── HOME: one collapsed artifact row (L3 entry → opens FOCUS) ────────────────────────
function ArtifactRow({
	artifact,
	reviewed,
	onExamine,
}: {
	readonly artifact: SubjectArtifactRow;
	readonly reviewed: boolean;
	readonly onExamine: () => void;
}): JSX.Element {
	const tint = KIND_TINT[artifact.kind];
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={onExamine}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onExamine();
				}
			}}
			className="group flex cursor-pointer items-center gap-[12px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[12px] py-[12px] text-left shadow-[var(--shadow-default)] transition-[transform,opacity] duration-[var(--motion-fast)] [transition-timing-function:var(--motion-ease)] hover:opacity-95 active:translate-y-[1px]"
		>
			{/* kind badge */}
			<span
				className="inline-flex shrink-0 items-center rounded-[var(--r-pill)] px-[9px] py-[3px] text-[10px] font-[600] uppercase"
				style={{ letterSpacing: "var(--tracking-caps-sm)", background: tint.bg, color: tint.fg }}
			>
				{KIND_LABEL[artifact.kind]}
			</span>
			<ToolLogo tool={artifact.tool} size="md" />

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-[9px]">
					<span className="truncate text-[13px] font-[600] text-[var(--text-primary)]">{artifact.title}</span>
					{reviewed ? (
						<span className="inline-flex shrink-0 items-center gap-[3px] text-[12px] font-[500] text-[var(--accent-primary)]">
							<CheckGlyph /> reviewed
						</span>
					) : null}
				</div>
				<p className="mt-[2px] truncate text-[12px] leading-[1.4] text-[var(--text-secondary)]">{artifact.summary}</p>
				{artifact.needsYou ? (
					<p className="mt-[3px] text-[12px] leading-[1.4] text-[var(--status-warning)]">{artifact.needsYou}</p>
				) : null}
			</div>

			<span className="shrink-0 font-mono text-[12px] font-[600] tabular-nums text-[var(--text-secondary)]">{artifact.badge}</span>
			<span className="shrink-0 inline-flex items-center gap-[3px] text-[12px] font-[500] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] group-hover:text-[var(--accent-primary)]">
				Examine
				<ArrowGlyph dir="right" />
			</span>
		</div>
	);
}

// ── verdict bar (5 binding verdicts; blocking emphasis) — reachable at both surfaces ──
const VERDICTS: readonly { readonly key: string; readonly label: string; readonly primary?: boolean }[] = [
	{ key: "approve", label: "Approve", primary: true },
	{ key: "request-changes", label: "Request changes" },
	{ key: "reject", label: "Reject" },
	{ key: "snooze", label: "Snooze" },
	{ key: "comment", label: "Comment" },
];

function VerdictBar({ compact }: { readonly compact: boolean }): JSX.Element {
	return (
		<div
			className="flex items-center justify-between gap-[12px] border-t border-[var(--border-subtle)] bg-[var(--surface-page)]"
			style={{ padding: compact ? "9px 18px" : "12px 24px" }}
		>
			<span className="inline-flex items-center gap-[6px] text-[12px] font-[500] text-[var(--text-secondary)]">
				<span aria-hidden="true" className="inline-block h-[6px] w-[6px] rounded-[var(--r-pill)]" style={{ background: "var(--status-error)" }} />
				Resolves the whole review · blocking
			</span>
			<div className="flex items-center gap-[9px]">
				{VERDICTS.map((v) => (
					<button
						key={v.key}
						type="button"
						onClick={() => {}}
						className="rounded-[var(--r-pill)] border px-[18px] py-[9px] text-[13px] font-[600] transition-[transform,opacity] duration-[var(--motion-fast)] [transition-timing-function:var(--motion-ease)] active:translate-y-[1px]"
						style={
							v.primary
								? { background: "var(--accent-primary)", borderColor: "var(--accent-primary)", color: "#ffffff" }
								: { background: "var(--surface-elevated)", borderColor: "var(--border-default)", color: "var(--text-secondary)" }
						}
					>
						{v.label}
					</button>
				))}
			</div>
		</div>
	);
}

// ── FOCUS: the conversation rail anchored to one artifact ────────────────────────────
function ConversationRail({ comments }: { readonly comments: readonly ReviewComment[] }): JSX.Element {
	return (
		<aside className="flex w-[320px] shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-container)]">
			<div className="border-b border-[var(--border-subtle)] px-[18px] py-[12px]">
				<h3 className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">Conversation</h3>
				<p className="mt-[2px] text-[12px] text-[var(--text-secondary)]">Anchored to this artifact</p>
			</div>

			<div className="flex flex-1 flex-col gap-[12px] overflow-y-auto px-[18px] py-[18px]">
				{comments.map((c) => (
					<div key={c.id} className="flex flex-col gap-[6px]">
						<div className="flex items-center gap-[9px]">
							{/* agent avatar green-distinct; human avatar neutral */}
							<span
								className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[var(--r-pill)] border-[1.5px] text-[10px] font-[600]"
								style={
									c.isAgent
										? { background: "var(--accent-primary-dim)", borderColor: "var(--accent-primary)", color: "var(--accent-primary)" }
										: { background: "var(--surface-elevated)", borderColor: "var(--border-default)", color: "var(--text-secondary)" }
								}
							>
								{c.author.slice(0, 2).toUpperCase()}
							</span>
							<span className="text-[13px] font-[600] text-[var(--text-primary)]">{c.author}</span>
							<span className="text-[12px] text-[var(--text-tertiary)]">{c.ago}</span>
						</div>
						{c.anchor ? (
							<span className="ml-[31px] inline-flex w-fit items-center rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] px-[6px] py-[2px] font-mono text-[12px] text-[var(--text-tertiary)]">
								{c.anchor}
							</span>
						) : null}
						<p className="ml-[31px] text-[13px] leading-[1.5] text-[var(--text-secondary)]">{c.body}</p>
					</div>
				))}
			</div>

			{/* composer */}
			<div className="border-t border-[var(--border-subtle)] px-[18px] py-[12px]">
				<div className="flex items-center gap-[9px] rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[9px]">
					<span className="flex-1 text-[13px] text-[var(--text-tertiary)]">Reply on this artifact…</span>
					<button
						type="button"
						onClick={() => {}}
						className="rounded-[var(--r-pill)] border border-[var(--accent-primary)] bg-[var(--accent-primary)] px-[12px] py-[3px] text-[12px] font-[600] text-white"
					>
						Send
					</button>
				</div>
			</div>
		</aside>
	);
}

// ── FOCUS: the building block at full size for a given artifact ──────────────────────
function FocusBuildingBlock({ artifact }: { readonly artifact: SubjectArtifactRow }): JSX.Element {
	// Code → the REAL <ReviewCodeDiff /> (its fixture IS this promo-checkout fix).
	if (artifact.kind === "code") {
		return (
			<div className="flex justify-center">
				<ReviewCodeDiff />
			</div>
		);
	}
	// Other kinds render their own building block in production (ReviewMetricsMoved,
	// ReviewActionOperation, ReviewVisualDiff). In this composition isolation story we
	// show a faithful full-size placeholder so the focus surface reads at full scale
	// without pulling every canvas's fixture into this file.
	const tint = KIND_TINT[artifact.kind];
	return (
		<div className="mx-auto w-full max-w-[860px] overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]">
			<div className="flex items-center gap-[9px] border-b border-[var(--border-subtle)] px-[18px] py-[12px]">
				<span
					className="inline-flex shrink-0 items-center rounded-[var(--r-pill)] px-[9px] py-[3px] text-[10px] font-[600] uppercase"
					style={{ letterSpacing: "var(--tracking-caps-sm)", background: tint.bg, color: tint.fg }}
				>
					{KIND_LABEL[artifact.kind]}
				</span>
				<ToolLogo tool={artifact.tool} size="md" withLabel />
				<span className="ml-auto font-mono text-[12px] font-[600] tabular-nums text-[var(--text-secondary)]">{artifact.badge}</span>
			</div>
			<div className="flex flex-col gap-[12px] px-[18px] py-[24px]">
				<h2 className="text-[17px] font-[600] leading-[1.3] text-[var(--text-primary)]">{artifact.title}</h2>
				<p className="max-w-[68ch] text-[13px] leading-[1.55] text-[var(--text-secondary)]">{artifact.summary}</p>
				{artifact.needsYou ? (
					<p className="text-[13px] leading-[1.5] text-[var(--status-warning)]">{artifact.needsYou}</p>
				) : null}
				<p className="text-[12px] text-[var(--text-tertiary)]">
					Renders the {KIND_LABEL[artifact.kind]} building block at full size (production wires the matching canvas).
				</p>
			</div>
		</div>
	);
}

// ── FOCUS: the full-screen focus surface for ONE artifact ────────────────────────────
function FocusSurface({
	subject,
	index,
	reviewedSet,
	onBack,
	onNav,
	onToggleReviewed,
}: {
	readonly subject: ReviewSubject;
	readonly index: number;
	readonly reviewedSet: ReadonlySet<string>;
	readonly onBack: () => void;
	readonly onNav: (delta: number) => void;
	readonly onToggleReviewed: (id: string) => void;
}): JSX.Element {
	const artifact = subject.artifacts[index];
	if (!artifact) return <div />;
	const total = subject.artifacts.length;
	const reviewed = reviewedSet.has(artifact.id);

	return (
		<div className="flex h-full flex-col bg-[var(--surface-page)]">
			{/* L1 — focus header: back · title · prev/next · mark reviewed */}
			<header className="flex items-center gap-[12px] border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[18px] py-[12px]">
				<button
					type="button"
					onClick={onBack}
					className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]"
				>
					<ArrowGlyph dir="left" />
					Back to review
				</button>
				<div className="flex min-w-0 flex-1 items-center gap-[9px]">
					<span
						className="inline-flex shrink-0 items-center rounded-[var(--r-pill)] px-[9px] py-[3px] text-[10px] font-[600] uppercase"
						style={{ letterSpacing: "var(--tracking-caps-sm)", background: KIND_TINT[artifact.kind].bg, color: KIND_TINT[artifact.kind].fg }}
					>
						{KIND_LABEL[artifact.kind]}
					</span>
					<span className="truncate text-[15px] font-[600] text-[var(--text-primary)]">{artifact.title}</span>
				</div>

				{/* prev/next artifact stepper — the one-at-a-time rhythm */}
				<div className="flex items-center gap-[3px]">
					<button
						type="button"
						onClick={() => onNav(-1)}
						disabled={index === 0}
						className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] transition-opacity duration-[var(--motion-fast)] disabled:opacity-40"
					>
						<ArrowGlyph dir="left" />
					</button>
					<span className="px-[6px] text-[12px] font-[500] tabular-nums text-[var(--text-tertiary)]">
						{index + 1} / {total}
					</span>
					<button
						type="button"
						onClick={() => onNav(1)}
						disabled={index === total - 1}
						className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] transition-opacity duration-[var(--motion-fast)] disabled:opacity-40"
					>
						<ArrowGlyph dir="right" />
					</button>
				</div>
				<ReviewedPill reviewed={reviewed} onToggle={() => onToggleReviewed(artifact.id)} />
			</header>

			{/* L2 + L3 — building block at full size | conversation rail anchored here */}
			<div className="flex min-h-0 flex-1">
				<div className="min-w-0 flex-1 overflow-y-auto px-[24px] py-[24px]">
					<FocusBuildingBlock artifact={artifact} />
				</div>
				<ConversationRail comments={subject.conversation} />
			</div>

			{/* verdict stays reachable — compact bar */}
			<VerdictBar compact />
		</div>
	);
}

// ── HOME: the scannable review home surface ──────────────────────────────────────────
function HomeSurface({
	subject,
	reviewedSet,
	onExamine,
	onToggleReviewed,
}: {
	readonly subject: ReviewSubject;
	readonly reviewedSet: ReadonlySet<string>;
	readonly onExamine: (index: number) => void;
	readonly onToggleReviewed: (id: string) => void;
}): JSX.Element {
	const firstComment = subject.conversation[0];
	return (
		<div className="flex h-full flex-col bg-[var(--surface-page)]">
			<div className="min-h-0 flex-1 overflow-y-auto">
				{/* the ~820px reading column — calm, scannable, approvable at a glance */}
				<div className="mx-auto w-full max-w-[820px]">
					<HomeHeader subject={subject} />
					<OutcomeBlock subject={subject} />

					{/* Artifacts · N — the tidy collapsed list, relevance-ordered */}
					<div className="flex flex-col gap-[9px] px-[24px] pb-[18px]">
						<div className="flex items-baseline gap-[9px]">
							<h2 className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">Artifacts</h2>
							<span className="text-[12px] font-[600] text-[var(--text-secondary)] [font-variant-numeric:tabular-nums]">{subject.artifacts.length}</span>
							<span className="text-[12px] text-[var(--text-tertiary)]">· each opens full-screen to examine</span>
						</div>
						{subject.artifacts.map((artifact, i) => (
							<ArtifactRow
								key={artifact.id}
								artifact={artifact}
								reviewed={reviewedSet.has(artifact.id)}
								onExamine={() => onExamine(i)}
							/>
						))}
					</div>

					{/* a slim conversation note — the thread lives in focus; this is a pointer */}
					{firstComment ? (
						<div className="mx-[24px] mb-[24px] flex items-center gap-[9px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-container)] px-[12px] py-[9px]">
							<span className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">Note</span>
							<span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-secondary)]">
								<span className="font-[600] text-[var(--text-primary)]">{firstComment.author}:</span> {firstComment.body}
							</span>
							<span className="shrink-0 text-[12px] text-[var(--text-tertiary)]">{subject.conversation.length} in thread →</span>
						</div>
					) : null}
				</div>
			</div>

			{/* the verdict bar — the home is fully approvable without opening anything */}
			<VerdictBar compact={false} />
		</div>
	);
}

// ── the composition: HOME ⇄ FOCUS ────────────────────────────────────────────────────
export interface ReviewCompositionFocusProps {
	readonly subject?: ReviewSubject;
	/** open directly on a focused artifact (its index) instead of the home. */
	readonly initialFocusIndex?: number;
}

export function ReviewCompositionFocus({
	subject = REVIEW_SUBJECT,
	initialFocusIndex,
}: ReviewCompositionFocusProps): JSX.Element {
	// surface state: null = home, number = the focused artifact's index.
	const [focusIndex, setFocusIndex] = useState<number | null>(
		initialFocusIndex !== undefined ? initialFocusIndex : null,
	);
	const [reviewedSet, setReviewedSet] = useState<ReadonlySet<string>>(
		() => new Set(subject.artifacts.filter((a) => a.reviewed).map((a) => a.id)),
	);

	function toggleReviewed(id: string): void {
		setReviewedSet((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function navigate(delta: number): void {
		setFocusIndex((cur) => {
			if (cur === null) return cur;
			const next = cur + delta;
			if (next < 0 || next >= subject.artifacts.length) return cur;
			return next;
		});
	}

	if (focusIndex !== null) {
		return (
			<FocusSurface
				subject={subject}
				index={focusIndex}
				reviewedSet={reviewedSet}
				onBack={() => setFocusIndex(null)}
				onNav={navigate}
				onToggleReviewed={toggleReviewed}
			/>
		);
	}

	return (
		<HomeSurface
			subject={subject}
			reviewedSet={reviewedSet}
			onExamine={(i) => setFocusIndex(i)}
			onToggleReviewed={toggleReviewed}
		/>
	);
}
