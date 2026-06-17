// AL1 — composition VARIANT B: "Outline + Stage" (two-pane).
//
// The system question §3 answered as ONE whole review: a Subject (a SET of artifacts)
// wrapped in a frame, resolved by ONE verdict. This variant gives BIG artifacts real
// room — a narrow inline block doesn't do a 16:9 visual / browser preview / wide diff
// justice, so each artifact opens FULL-SIZE in a right stage.
//
// Two panes (budget: navbar(1) + these 2 = 3):
//   LEFT RAIL (~330px, --surface-container) — the OUTLINE you pivot through:
//     work identity + Atlas → You (agent-green-distinct) + Awaiting·Blocking + cost +
//     tool mini-logos · condensed OUTCOME (the sentence) · INTENT (3 ✓ / 1 ✗) ·
//     NEEDS YOU (2 risk items) · ARTIFACTS · 4 (clickable list, active highlighted) ·
//     VERDICT block pinned at the rail BOTTOM (5 binding verdicts + blocking note).
//   RIGHT STAGE (flex-1, --surface-page) — the SELECTED artifact at FULL SIZE:
//     stage header (title + prev/next + Mark reviewed) · the artifact's building block
//     full-width (default = the code artifact → the REAL <ReviewCodeDiff />) · a slim
//     CONVERSATION strip under it (the 2 anchored comments + a composer).
//
// orient/decide live in the outline; examine (stage) + converse (under stage) coexist.
//
// Presentational isolation: local useState for the active artifact only; every callback
// is a no-op. NO router/context/MockProviders. Tokens by NAME (Hearth + CP1). 6px grid.

import { type JSX, useState } from "react";
import { ReviewCodeDiff } from "./ReviewCodeDiff";
import { REVIEW_SUBJECT, type ReviewSubject, type SubjectArtifactRow } from "./review-subject.fixture";
import { ToolLogo } from "./ToolLogo";

// ── the 5 binding verdicts (concept universal set) ────────────────────────────────
const VERDICTS = ["Approve", "Request changes", "Reject", "Edit", "Snooze"] as const;
type Verdict = (typeof VERDICTS)[number];
const PRIMARY_VERDICT: Verdict = "Approve";

// kind → short badge label shown on each artifact row (the proof family at a glance).
const KIND_LABEL: Record<SubjectArtifactRow["kind"], string> = {
	code: "Code",
	data: "Data",
	action: "Action",
	visual: "Visual",
};

// ── small glyphs ──────────────────────────────────────────────────────────────────

function CheckGlyph(): JSX.Element {
	return (
		<svg aria-hidden="true" viewBox="0 0 12 12" className="h-[11px] w-[11px]">
			<path
				d="M2.5 6.2 L5 8.5 L9.5 3.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Chevron({ dir }: { dir: "left" | "right" }): JSX.Element {
	return (
		<svg aria-hidden="true" viewBox="0 0 12 12" className="h-[12px] w-[12px]">
			<path
				d={dir === "left" ? "M7.5 2.5 L4 6 L7.5 9.5" : "M4.5 2.5 L8 6 L4.5 9.5"}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

// ── outline section header (uppercase micro-label, the rail's section rhythm) ─────
function RailLabel({ children, count }: { children: string; count?: string }): JSX.Element {
	return (
		<div className="flex items-baseline justify-between px-[18px] pt-[18px] pb-[9px]">
			<h3 className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
				{children}
			</h3>
			{count ? (
				<span className="text-[12px] font-[600] text-[var(--text-tertiary)] [font-variant-numeric:tabular-nums]">
					{count}
				</span>
			) : null}
		</div>
	);
}

// ── L1 of the outline: work identity + agent→reviewer + standing + cost + tools ───
function OutlineIdentity({ subject }: { subject: ReviewSubject }): JSX.Element {
	const blocking = subject.blocking;
	const initials = subject.author.slice(0, 2).toUpperCase();
	return (
		<div className="flex flex-col gap-[12px] border-b border-[var(--border-subtle)] px-[18px] py-[18px]">
			<div className="flex items-start justify-between gap-[9px]">
				{/* agent author — green-distinct (AQ-012) */}
				<span
					className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-pill)] border-[1.5px] text-[10px] font-[600]"
					style={{
						background: "var(--accent-primary-dim)",
						borderColor: "var(--accent-primary)",
						color: "var(--accent-primary)",
					}}
				>
					{initials}
				</span>
				<span
					className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] px-[9px] py-[3px] text-[10px] font-[600] uppercase"
					style={{
						letterSpacing: "var(--tracking-caps-sm)",
						background: blocking ? "var(--status-error-dim)" : "var(--status-info-dim)",
						color: blocking ? "var(--status-error)" : "var(--status-info)",
					}}
				>
					<span
						aria-hidden="true"
						className="inline-block h-[6px] w-[6px] rounded-[var(--r-pill)]"
						style={{ background: blocking ? "var(--status-error)" : "var(--status-info)" }}
					/>
					{blocking ? "Blocking" : "Awaiting"}
				</span>
			</div>

			<h2 className="text-[15px] font-[600] leading-[1.35] text-[var(--text-primary)]">{subject.workIdentity}</h2>

			<div className="flex items-center gap-[6px] text-[12px] text-[var(--text-secondary)]">
				<span className="font-[600] text-[var(--text-primary)]">{subject.author}</span>
				<span aria-hidden="true" className="text-[var(--text-tertiary)]">
					→
				</span>
				<span>{subject.reviewer}</span>
				<span aria-hidden="true" className="text-[var(--text-tertiary)]">
					·
				</span>
				<span className="text-[var(--text-tertiary)]">{subject.producedAgo}</span>
			</div>

			{/* tools used (mini-logo row) + cost */}
			<div className="flex flex-wrap items-center justify-between gap-x-[12px] gap-y-[9px]">
				<div className="flex flex-wrap items-center gap-[9px]">
					{subject.tools.map((t) => (
						<ToolLogo key={t} tool={t} size="md" />
					))}
				</div>
				<span className="inline-flex items-baseline gap-[6px] text-[12px] text-[var(--text-secondary)]">
					<span className="font-[600] text-[var(--text-primary)] [font-variant-numeric:tabular-nums]">
						{subject.costMoney}
					</span>
					<span className="text-[var(--text-tertiary)]">·</span>
					<span className="[font-variant-numeric:tabular-nums]">{subject.costTokens}</span>
				</span>
			</div>
		</div>
	);
}

// ── condensed OUTCOME (the sentence, clamped to ~3 lines) ─────────────────────────
function OutlineOutcome({ subject }: { subject: ReviewSubject }): JSX.Element {
	return (
		<div className="border-b border-[var(--border-subtle)]">
			<RailLabel>Outcome</RailLabel>
			<p className="px-[18px] pb-[18px] text-[13px] leading-[1.5] text-[var(--text-secondary)]">
				{subject.outcome}
			</p>
		</div>
	);
}

// ── INTENT (done-conditions; unmet floats to top + red) ───────────────────────────
function OutlineIntent({ subject }: { subject: ReviewSubject }): JSX.Element {
	const met = subject.intent.filter((c) => c.met).length;
	const total = subject.intent.length;
	const ordered = [...subject.intent.filter((c) => !c.met), ...subject.intent.filter((c) => c.met)];
	return (
		<div className="border-b border-[var(--border-subtle)]">
			<RailLabel count={`${met}/${total} met`}>Intent</RailLabel>
			<ul className="flex flex-col gap-[3px] px-[18px] pb-[18px]">
				{ordered.map((c) => (
					<li key={c.text} className="flex items-start gap-[9px] py-[3px]">
						<span
							aria-hidden="true"
							className="mt-[1px] inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[11px] font-[700]"
							style={{
								background: c.met ? "var(--surface-elevated)" : "var(--status-error-dim)",
								color: c.met ? "var(--status-success)" : "var(--status-error)",
							}}
						>
							{c.met ? "✓" : "✗"}
						</span>
						<span
							className="text-[13px] leading-[1.4]"
							style={{ color: c.met ? "var(--text-secondary)" : "var(--text-primary)" }}
						>
							{c.text}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

// ── NEEDS YOU (the risk items — the things to decide on) ──────────────────────────
function OutlineNeeds({
	subject,
	onJump,
}: {
	subject: ReviewSubject;
	onJump: (artifactId: string) => void;
}): JSX.Element {
	return (
		<div className="border-b border-[var(--border-subtle)]">
			<RailLabel count={String(subject.needs.length)}>Needs you</RailLabel>
			<div className="flex flex-col gap-[6px] px-[18px] pb-[18px]">
				{subject.needs.map((n) => (
					<button
						key={n.label}
						type="button"
						onClick={() => (n.artifactId ? onJump(n.artifactId) : undefined)}
						className="group flex flex-col gap-[3px] rounded-[var(--r-subtle)] border border-[var(--status-warning)] bg-[color-mix(in_oklab,var(--status-warning)_10%,transparent)] px-[12px] py-[9px] text-left transition-[transform,opacity] duration-[var(--motion-fast)] [transition-timing-function:var(--motion-ease)] hover:opacity-90 active:translate-y-[1px]"
					>
						<span className="flex items-center gap-[6px]">
							<span
								aria-hidden="true"
								className="inline-block h-[6px] w-[6px] rounded-[var(--r-pill)]"
								style={{ background: "var(--status-warning)" }}
							/>
							<span className="text-[13px] font-[600] text-[var(--text-primary)]">{n.label}</span>
						</span>
						<span className="text-[12px] leading-[1.4] text-[var(--text-secondary)]">{n.detail}</span>
					</button>
				))}
			</div>
		</div>
	);
}

// ── ARTIFACTS · 4 — the clickable outline list you pivot through ──────────────────
function ArtifactRow({
	artifact,
	active,
	onSelect,
}: {
	artifact: SubjectArtifactRow;
	active: boolean;
	onSelect: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-current={active}
			className="flex w-full items-center gap-[9px] rounded-[var(--r-subtle)] border px-[12px] py-[9px] text-left transition-[transform,opacity] duration-[var(--motion-fast)] [transition-timing-function:var(--motion-ease)] active:translate-y-[1px]"
			style={{
				borderColor: active ? "var(--border-default)" : "transparent",
				background: active ? "var(--surface-elevated)" : "transparent",
				boxShadow: active ? "var(--shadow-subtle)" : "none",
			}}
		>
			<span
				className="inline-flex shrink-0 items-center rounded-[var(--r-pill)] px-[6px] py-[2px] text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)]"
				style={{ background: "var(--surface-container)", color: "var(--text-tertiary)" }}
			>
				{KIND_LABEL[artifact.kind]}
			</span>
			<ToolLogo tool={artifact.tool} size="sm" />
			<span className="min-w-0 flex-1">
				<span className="block truncate text-[13px] font-[500] text-[var(--text-primary)]">{artifact.title}</span>
				<span className="block text-[12px] font-mono tabular-nums text-[var(--text-tertiary)]">{artifact.badge}</span>
			</span>
			{artifact.needsYou ? (
				<span
					aria-label="Needs you"
					title={artifact.needsYou}
					className="inline-block h-[8px] w-[8px] shrink-0 rounded-[var(--r-pill)]"
					style={{ background: "var(--status-warning)" }}
				/>
			) : artifact.reviewed ? (
				<span
					aria-label="Reviewed"
					className="inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[var(--status-success)]"
				>
					<CheckGlyph />
				</span>
			) : null}
		</button>
	);
}

function OutlineArtifacts({
	subject,
	activeId,
	onSelect,
}: {
	subject: ReviewSubject;
	activeId: string;
	onSelect: (id: string) => void;
}): JSX.Element {
	return (
		<div>
			<RailLabel count={String(subject.artifacts.length)}>Artifacts</RailLabel>
			<div className="flex flex-col gap-[3px] px-[12px] pb-[18px]">
				{subject.artifacts.map((a) => (
					<ArtifactRow key={a.id} artifact={a} active={a.id === activeId} onSelect={() => onSelect(a.id)} />
				))}
			</div>
		</div>
	);
}

// ── VERDICT block — pinned at the rail BOTTOM. Resolves the WHOLE Subject. ─────────
function VerdictBlock({ subject }: { subject: ReviewSubject }): JSX.Element {
	return (
		<div className="mt-auto border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[18px] py-[18px]">
			{subject.blocking ? (
				<div className="mb-[12px] flex items-center gap-[6px] text-[12px] text-[var(--status-error)]">
					<span
						aria-hidden="true"
						className="inline-block h-[6px] w-[6px] rounded-[var(--r-pill)]"
						style={{ background: "var(--status-error)" }}
					/>
					Blocking · deploy staged
				</div>
			) : null}
			<div className="flex flex-col gap-[9px]">
				<button
					type="button"
					onClick={() => {}}
					className="w-full rounded-[var(--r-pill)] bg-[var(--accent-primary)] px-[18px] py-[9px] text-[13px] font-[600] text-[var(--surface-elevated)] transition-[transform,opacity] duration-[var(--motion-fast)] [transition-timing-function:var(--motion-ease)] hover:opacity-90 active:translate-y-[1px]"
				>
					{PRIMARY_VERDICT}
				</button>
				<div className="grid grid-cols-2 gap-[6px]">
					{VERDICTS.filter((v) => v !== PRIMARY_VERDICT).map((v) => (
						<button
							key={v}
							type="button"
							onClick={() => {}}
							className="rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-container)] px-[12px] py-[6px] text-[12px] font-[500] text-[var(--text-secondary)] transition-[transform,opacity] duration-[var(--motion-fast)] [transition-timing-function:var(--motion-ease)] hover:text-[var(--text-primary)] active:translate-y-[1px]"
						>
							{v}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

// ── the stage: header + the selected artifact's building block, full-width ────────

function StageHeader({
	subject,
	activeId,
	reviewed,
	onPrev,
	onNext,
	onToggleReviewed,
}: {
	subject: ReviewSubject;
	activeId: string;
	reviewed: boolean;
	onPrev: () => void;
	onNext: () => void;
	onToggleReviewed: () => void;
}): JSX.Element {
	const idx = subject.artifacts.findIndex((a) => a.id === activeId);
	const active = subject.artifacts[idx];
	if (!active) return <div />;
	return (
		<header className="sticky top-0 z-[1] flex items-center gap-[12px] border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[24px] py-[12px]">
			<div className="flex items-center gap-[6px]">
				<button
					type="button"
					onClick={onPrev}
					aria-label="Previous artifact"
					className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]"
				>
					<Chevron dir="left" />
				</button>
				<button
					type="button"
					onClick={onNext}
					aria-label="Next artifact"
					className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]"
				>
					<Chevron dir="right" />
				</button>
			</div>
			<div className="flex min-w-0 flex-1 items-center gap-[9px]">
				<ToolLogo tool={active.tool} size="md" />
				<span className="min-w-0">
					<span className="block truncate text-[15px] font-[600] text-[var(--text-primary)]">{active.title}</span>
					<span className="block text-[12px] text-[var(--text-tertiary)]">
						Artifact {idx + 1} of {subject.artifacts.length} · {KIND_LABEL[active.kind]}
					</span>
				</span>
			</div>
			<button
				type="button"
				onClick={onToggleReviewed}
				aria-pressed={reviewed}
				className="inline-flex shrink-0 items-center gap-[6px] rounded-[var(--r-pill)] border px-[12px] py-[6px] text-[12px] font-[500] transition-colors duration-[var(--motion-fast)]"
				style={{
					borderColor: reviewed ? "var(--accent-primary)" : "var(--border-default)",
					background: reviewed ? "var(--accent-primary-dim)" : "var(--surface-elevated)",
					color: reviewed ? "var(--accent-primary)" : "var(--text-secondary)",
				}}
			>
				<span
					className="inline-flex h-[16px] w-[16px] items-center justify-center rounded-[6px]"
					style={{
						background: reviewed ? "var(--accent-primary)" : "transparent",
						color: reviewed ? "var(--surface-elevated)" : "var(--text-tertiary)",
						border: reviewed ? "none" : "1.5px solid var(--border-default)",
					}}
				>
					<CheckGlyph />
				</span>
				{reviewed ? "Reviewed" : "Mark reviewed"}
			</button>
		</header>
	);
}

/**
 * The big artifact's building block, full-width. The code artifact renders the REAL
 * <ReviewCodeDiff /> (its fixture IS this promo fix). The other kinds render a
 * full-bleed placeholder canvas that explicitly claims the WHOLE stage — that's the
 * point of this variant: a 16:9 visual / browser preview / wide diff gets real room.
 */
function StageBody({ artifact }: { artifact: SubjectArtifactRow }): JSX.Element {
	if (artifact.kind === "code") {
		return (
			<div className="w-full max-w-[920px]">
				<ReviewCodeDiff />
			</div>
		);
	}
	return (
		<div
			className="flex w-full flex-col items-start justify-center gap-[9px] rounded-[var(--r-default)] border border-dashed border-[var(--border-default)] bg-[var(--surface-elevated)] px-[24px] py-[36px]"
			style={{ minHeight: 360 }}
		>
			<div className="flex items-center gap-[9px]">
				<ToolLogo tool={artifact.tool} size="md" />
				<span className="text-[13px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					{KIND_LABEL[artifact.kind]} canvas
				</span>
			</div>
			<span className="text-[15px] font-[600] text-[var(--text-primary)]">{artifact.title}</span>
			<span className="max-w-[60ch] text-[13px] leading-[1.5] text-[var(--text-secondary)]">{artifact.summary}</span>
			<span className="text-[12px] text-[var(--text-tertiary)]">
				This artifact opens at full stage width — the {KIND_LABEL[artifact.kind].toLowerCase()} building block fills
				this whole area (e.g. a side-by-side visual diff or a staged-action receipt).
			</span>
		</div>
	);
}

// ── CONVERSATION — slim strip under the stage, anchored to the active artifact ────
function ConversationStrip({ subject }: { subject: ReviewSubject }): JSX.Element {
	return (
		<div className="border-t border-[var(--border-subtle)] bg-[var(--surface-container)] px-[24px] py-[18px]">
			<div className="flex items-baseline gap-[9px] pb-[12px]">
				<h3 className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
					Conversation
				</h3>
				<span className="text-[12px] text-[var(--text-tertiary)]">on this artifact</span>
			</div>
			<div className="flex flex-col gap-[12px]">
				{subject.conversation.map((c) => (
					<div key={c.id} className="flex items-start gap-[9px]">
						<span
							className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[10px] font-[600]"
							style={
								c.isAgent
									? {
											background: "var(--accent-primary-dim)",
											border: "1.5px solid var(--accent-primary)",
											color: "var(--accent-primary)",
										}
									: {
											background: "var(--surface-elevated)",
											border: "1px solid var(--border-default)",
											color: "var(--text-secondary)",
										}
							}
						>
							{c.author.slice(0, 2).toUpperCase()}
						</span>
						<div className="min-w-0 flex-1">
							<div className="flex items-baseline gap-[6px]">
								<span className="text-[13px] font-[600] text-[var(--text-primary)]">{c.author}</span>
								{c.anchor ? (
									<span className="rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] px-[6px] py-[2px] font-mono text-[11px] text-[var(--text-tertiary)]">
										{c.anchor}
									</span>
								) : null}
								<span className="text-[12px] text-[var(--text-tertiary)]">{c.ago}</span>
							</div>
							<p className="mt-[3px] text-[13px] leading-[1.5] text-[var(--text-secondary)]">{c.body}</p>
						</div>
					</div>
				))}
			</div>
			{/* composer */}
			<div className="mt-[12px] flex items-center gap-[9px] rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[9px]">
				<input
					type="text"
					placeholder="Reply, or anchor a comment on a line…"
					className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
				/>
				<button
					type="button"
					onClick={() => {}}
					className="shrink-0 rounded-[var(--r-pill)] bg-[var(--accent-primary)] px-[12px] py-[6px] text-[12px] font-[600] text-[var(--surface-elevated)] transition-opacity duration-[var(--motion-fast)] hover:opacity-90"
				>
					Send
				</button>
			</div>
		</div>
	);
}

// ── the whole composition ──────────────────────────────────────────────────────────
export interface ReviewCompositionStageProps {
	readonly subject?: ReviewSubject;
}

export function ReviewCompositionStage({ subject = REVIEW_SUBJECT }: ReviewCompositionStageProps): JSX.Element {
	const defaultId = subject.artifacts.find((a) => a.expanded)?.id ?? subject.artifacts[0]?.id ?? "";
	const [activeId, setActiveId] = useState<string>(defaultId);
	const [reviewedIds, setReviewedIds] = useState<ReadonlySet<string>>(
		() => new Set(subject.artifacts.filter((a) => a.reviewed).map((a) => a.id)),
	);

	const idx = subject.artifacts.findIndex((a) => a.id === activeId);
	const active = subject.artifacts[idx] ?? subject.artifacts[0];

	function step(delta: number): void {
		const n = subject.artifacts.length;
		if (n === 0) return;
		const next = (((idx + delta) % n) + n) % n;
		const target = subject.artifacts[next];
		if (target) setActiveId(target.id);
	}
	function toggleReviewed(id: string): void {
		setReviewedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	if (!active) return <div />;

	return (
		<div className="flex h-full w-full overflow-hidden bg-[var(--surface-page)] text-left">
			{/* ── LEFT RAIL: the OUTLINE you pivot through ─────────────────── */}
			<aside className="flex w-[330px] shrink-0 flex-col overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--surface-container)]">
				<OutlineIdentity subject={subject} />
				<OutlineOutcome subject={subject} />
				<OutlineIntent subject={subject} />
				<OutlineNeeds subject={subject} onJump={setActiveId} />
				<OutlineArtifacts subject={subject} activeId={activeId} onSelect={setActiveId} />
				<VerdictBlock subject={subject} />
			</aside>

			{/* ── RIGHT STAGE: the SELECTED artifact at FULL SIZE ──────────── */}
			<main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
				<StageHeader
					subject={subject}
					activeId={activeId}
					reviewed={reviewedIds.has(activeId)}
					onPrev={() => step(-1)}
					onNext={() => step(1)}
					onToggleReviewed={() => toggleReviewed(activeId)}
				/>
				<div className="flex flex-1 flex-col">
					<div className="flex-1 px-[24px] py-[24px]">
						<StageBody artifact={active} />
					</div>
					<ConversationStrip subject={subject} />
				</div>
			</main>

			{/*
			  States (Populated shown):
			  - empty:   subject with no artifacts → stage shows "No artifacts in this
			             review" placeholder; rail keeps identity + outcome + verdict.
			  - loading: rail rows + stage body as opacity-pulsing --surface-elevated
			             skeleton blocks at the same geometry (never animate layout).
			  - error:   stage body → "Couldn't load this artifact." + Retry pill; the
			             outline + verdict stay usable.
			  - needs-you emphasis: artifacts with a needsYou flag carry a warning dot in
			             the outline; the Needs-you section + Blocking verdict note make
			             the decision unmissable. (This IS the populated state here.)
			*/}
		</div>
	);
}
