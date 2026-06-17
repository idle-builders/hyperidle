// AL1 — composition, REFINED (round 3 applied). The CONVERGED review experience.
// Round-3 founder annotations applied on top of the round-2 structure:
//
//  R3-1 ONE conversation, not two. A single global thread lives at the end of the
//       center overview. The right pane shows ONLY the building block — no second
//       per-artifact thread. A comment can carry a reference chip ("on PromoField.tsx:118")
//       so feedback points at an artifact/spot as context without a second thread.
//       Kept lightly styled — it will adopt the AM-track conversation redesign later.
//  R3-2 No round-blob status pills. Standing/risk read as a status DOT + plain text
//       (red dot · Blocking; amber dot · Needs you), not a saturated --r-pill blob.
//  R3-3 "The task" (was "The ask") + a link to the source reference (bet › task record).
//  R3-4 Muted kind badges — CODE/DATA/ACTION/VISUAL render neutral; color is reserved
//       for MEANING (status / needs-you), so the surface reads calm, not rainbow.
//
//  Carried from round 2:
//  (·) WHERE-WE-CAME-FROM + WHAT-WE-DID — §The task (bet + real prompt) then §Result
//      (outcome + KPIs + before→after checkout proof). Intent demoted to "Met the task".
//  (·) RIGHT-PANE, not downward. Center IS the review; clicking an artifact opens it in
//      a right pane (center narrows); closing returns full width.
//  (·) NO floating verdict bar. Verdict sits TOP-RIGHT of the header: Approve · Request
//      changes · ⋯ overflow (Approve w/ comments · Edit · Reject).
//  (·) THIN artifact openers, not containers. The full block opens in the pane.
//  (·) CLEAR SECTIONS + air — quiet-caps headers, generous spacing.
//
// Presentational isolation: local useState for pane open/close + active artifact +
// overflow menu. Every callback is a no-op. No router/context/MockProviders.

import { type JSX, useState } from "react";
import { ReviewCodeDiff } from "./ReviewCodeDiff.js";
import { ToolLogo, type ToolId } from "./ToolLogo.js";
import {
	REVIEW_SUBJECT,
	type ReviewComment,
	type ResultKpi,
	type SubjectArtifactRow,
} from "./review-subject.fixture.js";

// ── small presentational atoms ─────────────────────────────────────────────────────

/** quiet-caps section header — the founder liked these "clear headers". */
function SectionHead({ label, count }: { label: string; count?: string }): JSX.Element {
	return (
		<div className="mb-[12px] flex items-baseline gap-[9px]">
			<h3 className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
				{label}
			</h3>
			{count ? (
				<span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">{count}</span>
			) : null}
			<span className="h-px flex-1 bg-[var(--border-subtle)]" />
		</div>
	);
}

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

const KIND_LABEL: Record<SubjectArtifactRow["kind"], string> = {
	code: "Code",
	data: "Data",
	action: "Action",
	visual: "Visual",
};

/**
 * kind badge — a tiny neutral chip. Per round-3 founder note (4): color is reserved
 * for MEANING (status / needs-you), so the kind label reads quiet, not rainbow.
 */
function KindBadge({ kind }: { kind: SubjectArtifactRow["kind"] }): JSX.Element {
	return (
		<span className="inline-flex items-center rounded-[6px] bg-[var(--surface-container)] px-[6px] py-[3px] text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] leading-none text-[var(--text-tertiary)]">
			{KIND_LABEL[kind]}
		</span>
	);
}

/** status dot + label — calm, legible standing/risk signal (not a saturated blob). */
function StatusDot({ tone, label }: { tone: string; label: string }): JSX.Element {
	return (
		<span className="inline-flex items-center gap-[6px] text-[12px] font-[600] text-[var(--text-secondary)]">
			<span aria-hidden="true" className="h-[7px] w-[7px] rounded-[var(--r-pill)]" style={{ background: tone }} />
			{label}
		</span>
	);
}

// ── the agent avatar — green-distinct per AQ-012 (an agent, not a person) ───────────
function AgentAvatar({ name }: { name: string }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[var(--r-pill)] text-[10px] font-[700] text-white shrink-0"
			style={{ background: "var(--accent-primary)" }}
			title={name}
		>
			{name.slice(0, 2)}
		</span>
	);
}

function HumanAvatar({ name }: { name: string }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-container)] text-[10px] font-[600] text-[var(--text-secondary)] shrink-0"
			title={name}
		>
			{name.slice(0, 2)}
		</span>
	);
}

// ── L1 frame header — orient + the verdict (top-right, never floating) ──────────────

interface VerdictProps {
	readonly menuOpen: boolean;
	readonly onToggleMenu: () => void;
}

/** primary Approve · secondary Request changes · ⋯ overflow. Always reachable here. */
function Verdict({ menuOpen, onToggleMenu }: VerdictProps): JSX.Element {
	return (
		<div className="relative flex items-center gap-[6px] shrink-0">
			<button
				type="button"
				onClick={() => {}}
				className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary)] px-[14px] py-[7px] text-[13px] font-[600] text-white transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:brightness-95"
			>
				<CheckGlyph />
				Approve
			</button>
			<button
				type="button"
				onClick={() => {}}
				className="rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[7px] text-[13px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:text-[var(--text-primary)]"
			>
				Request changes
			</button>
			<button
				type="button"
				aria-label="More verdict options"
				aria-expanded={menuOpen}
				onClick={onToggleMenu}
				className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] text-[15px] leading-none text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:text-[var(--text-primary)]"
			>
				⋯
			</button>
			{menuOpen ? (
				<div className="absolute right-0 top-[40px] z-10 w-[200px] overflow-hidden rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] py-[6px] shadow-[var(--shadow-elevated)]">
					{["Approve with comments", "Edit before approving", "Reject"].map((item) => (
						<button
							key={item}
							type="button"
							onClick={() => {}}
							className={[
								"block w-full px-[12px] py-[7px] text-left text-[13px] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-[var(--surface-container)]",
								item === "Reject" ? "text-[var(--status-error)]" : "text-[var(--text-primary)]",
							].join(" ")}
						>
							{item}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

function FrameHeader({ menuOpen, onToggleMenu }: VerdictProps): JSX.Element {
	const s = REVIEW_SUBJECT;
	return (
		<header className="flex flex-col gap-[12px] border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[24px] py-[18px]">
			{/* breadcrumb: where this work lives */}
			<nav className="flex items-center gap-[6px] text-[12px] text-[var(--text-tertiary)]">
				<span className="font-[500] text-[var(--text-secondary)]">Bet: {s.bet}</span>
				<span aria-hidden="true">›</span>
				<span className="truncate text-[var(--text-primary)]">{s.workIdentity}</span>
			</nav>

			<div className="flex items-start gap-[18px]">
				{/* orient: who → who, standing, tools, cost */}
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-[18px] gap-y-[9px]">
					<div className="flex items-center gap-[6px]">
						<AgentAvatar name={s.author} />
						<span className="text-[13px] font-[600] text-[var(--text-primary)]">{s.author}</span>
						<span className="text-[var(--text-tertiary)]">→</span>
						<HumanAvatar name={s.reviewer} />
						<span className="text-[13px] text-[var(--text-secondary)]">{s.reviewer}</span>
					</div>

					{s.blocking ? <StatusDot tone="var(--status-error)" label="Blocking" /> : null}

					<div className="flex items-center gap-[6px]">
						{s.tools.map((t: ToolId) => (
							<ToolLogo key={t} tool={t} size="sm" />
						))}
					</div>

					<span className="font-mono text-[12px] tabular-nums text-[var(--text-tertiary)]">
						{s.costMoney} · {s.costTokens} · {s.producedAgo}
					</span>
				</div>

				{/* the verdict — top-right, always reachable, NOT a floating bar */}
				<Verdict menuOpen={menuOpen} onToggleMenu={onToggleMenu} />
			</div>
		</header>
	);
}

// ── § THE TASK — where we came from (the real prompt + a link to the source) ────────
function TaskSection(): JSX.Element {
	const s = REVIEW_SUBJECT;
	return (
		<section>
			<SectionHead label="The task" />
			<div className="rounded-[var(--r-subtle)] border-l-[3px] border-[var(--border-default)] bg-[var(--surface-container)] px-[14px] py-[12px]">
				<p className="max-w-[72ch] text-[14px] italic leading-[1.55] text-[var(--text-secondary)]">
					“{s.prompt}”
				</p>
				{/* link to the source reference — the task record this work is judged against */}
				<button
					type="button"
					onClick={() => {}}
					className="mt-[9px] inline-flex items-center gap-[6px] text-[12px] font-[500] text-[var(--accent-primary)] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:brightness-95"
				>
					<span className="text-[var(--text-tertiary)]">{s.bet}</span>
					<span aria-hidden="true" className="text-[var(--text-tertiary)]">
						›
					</span>
					<span className="truncate">{s.workIdentity}</span>
					<span aria-hidden="true">→</span>
				</button>
			</div>
		</section>
	);
}

// ── § RESULT — what we did, the thing to SEE ────────────────────────────────────────

function KpiChip({ kpi }: { kpi: ResultKpi }): JSX.Element {
	const deltaColor =
		kpi.good === true
			? "var(--status-success)"
			: kpi.good === false
				? "var(--status-error)"
				: "var(--text-tertiary)";
	return (
		<div className="flex flex-col gap-[3px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[12px] py-[9px]">
			<span className="text-[11px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
				{kpi.label}
			</span>
			<span className="font-mono text-[17px] font-[600] tabular-nums leading-none text-[var(--text-primary)]">
				{kpi.value}
			</span>
			{kpi.delta ? (
				<span className="text-[11px] font-[500]" style={{ color: deltaColor }}>
					{kpi.delta}
				</span>
			) : null}
		</div>
	);
}

/**
 * The headline VISIBLE PROOF — a hand-rendered before→after checkout comparison.
 * This is the founder's "something to see": Before shows the bug (an expired code
 * applied with NO error); After shows the inline red "expired" message that the fix
 * introduces. Not a building block, not a checklist — a glanceable rendered proof.
 */
function CheckoutProof(): JSX.Element {
	return (
		<div className="grid grid-cols-2 gap-[12px]">
			<CheckoutCard variant="before" />
			<CheckoutCard variant="after" />
		</div>
	);
}

function CheckoutCard({ variant }: { variant: "before" | "after" }): JSX.Element {
	const isAfter = variant === "after";
	return (
		<figure className="overflow-hidden rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
			<figcaption className="flex items-center justify-between border-b border-[var(--border-subtle)] px-[12px] py-[6px]">
				<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					{isAfter ? "After" : "Before"}
				</span>
				<span
					className="inline-flex items-center gap-[4px] rounded-[var(--r-pill)] px-[6px] py-[2px] text-[10px] font-[600]"
					style={{
						color: isAfter ? "var(--status-success)" : "var(--status-error)",
						background: `color-mix(in oklab, ${
							isAfter ? "var(--status-success)" : "var(--status-error)"
						} 14%, transparent)`,
					}}
				>
					{isAfter ? "fixed" : "the bug"}
				</span>
			</figcaption>

			{/* a faithful mini checkout total card */}
			<div className="flex flex-col gap-[9px] p-[12px]">
				<div className="flex flex-col gap-[6px]">
					<label className="text-[11px] font-[500] text-[var(--text-tertiary)]">Promo code</label>
					<div className="flex items-center gap-[6px]">
						<div
							className={[
								"flex-1 rounded-[8px] border bg-[var(--surface-page)] px-[9px] py-[6px] font-mono text-[12px] text-[var(--text-primary)]",
								isAfter ? "border-[var(--status-error)]" : "border-[var(--border-default)]",
							].join(" ")}
						>
							SPRING24
						</div>
						<span className="rounded-[8px] bg-[var(--surface-container)] px-[9px] py-[6px] text-[12px] font-[500] text-[var(--text-tertiary)]">
							Apply
						</span>
					</div>
					{isAfter ? (
						<span className="text-[12px] font-[500] text-[var(--status-error)]">
							This code expired on Apr 3.
						</span>
					) : (
						<span className="text-[12px] text-[var(--text-tertiary)]">
							{/* the bug: silent — looks applied, no feedback */}
							No feedback shown.
						</span>
					)}
				</div>

				<div className="flex flex-col gap-[3px] border-t border-[var(--border-subtle)] pt-[9px] font-mono text-[12px] tabular-nums">
					<Row label="Subtotal" value="$120.00" />
					<Row
						label="Promo (SPRING24)"
						value={isAfter ? "—" : "−$24.00"}
						muted={isAfter}
					/>
					<div className="mt-[3px] flex items-center justify-between border-t border-[var(--border-subtle)] pt-[6px]">
						<span className="font-[600] text-[var(--text-primary)]">Total</span>
						<span className="font-[700] text-[var(--text-primary)]">
							{isAfter ? "$120.00" : "$96.00"}
						</span>
					</div>
				</div>
			</div>
		</figure>
	);
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }): JSX.Element {
	return (
		<div className="flex items-center justify-between">
			<span className="text-[var(--text-secondary)]">{label}</span>
			<span className={muted ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}>{value}</span>
		</div>
	);
}

function ResultSection(): JSX.Element {
	const s = REVIEW_SUBJECT;
	const met = s.intent.filter((c) => c.met).length;
	const unmet = s.intent.find((c) => !c.met);
	return (
		<section>
			<SectionHead label="Result" />
			<div className="flex flex-col gap-[18px]">
				<p className="max-w-[78ch] text-[15px] leading-[1.6] text-[var(--text-primary)]">{s.outcome}</p>

				<div className="flex flex-wrap gap-[9px]">
					{s.resultKpis.map((kpi) => (
						<KpiChip key={kpi.label} kpi={kpi} />
					))}
				</div>

				{/* the visible proof — something to SEE */}
				<CheckoutProof />

				{/* the intent checklist, DEMOTED to one secondary line */}
				<p className="text-[12px] text-[var(--text-tertiary)]">
					Met the task:{" "}
					<span className="font-mono tabular-nums font-[600] text-[var(--text-secondary)]">
						{met} of {s.intent.length}
					</span>
					{unmet ? ` — ${unmet.text.toLowerCase()} still open` : ""}
				</p>
			</div>
		</section>
	);
}

// ── § NEEDS YOU — the risk items ────────────────────────────────────────────────────
// Subtle, actionable: a small status dot (no tinted fill / no '!' blob) + the
// item, and a jump link that opens the relevant artifact in the pane.
function NeedsSection({ onJump }: { readonly onJump: (artifactId: string) => void }): JSX.Element {
	const s = REVIEW_SUBJECT;
	return (
		<section>
			<SectionHead label="Needs you" count={String(s.needs.length)} />
			<div className="flex flex-col gap-[3px]">
				{s.needs.map((need) => {
					const target = need.artifactId
						? s.artifacts.find((a) => a.id === need.artifactId)
						: undefined;
					// red only for the genuinely-blocking kinds; amber otherwise. Kept quiet.
					const tone =
						need.kind === "unhandled-exception" || need.kind === "over-authority"
							? "var(--status-error)"
							: "var(--status-warning)";
					return (
						<button
							key={need.label}
							type="button"
							onClick={() => target && onJump(target.id)}
							disabled={!target}
							className="group flex w-full items-start gap-[9px] rounded-[var(--r-subtle)] px-[9px] py-[6px] text-left transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] disabled:cursor-default"
						>
							<span
								aria-hidden="true"
								className="mt-[6px] inline-block h-[7px] w-[7px] shrink-0 rounded-full"
								style={{ background: tone }}
							/>
							<span className="min-w-0 flex-1">
								<span className="block text-[13px] font-[600] text-[var(--text-primary)]">
									{need.label}
								</span>
								<span className="block text-[12px] leading-[1.45] text-[var(--text-secondary)]">
									{need.detail}
								</span>
							</span>
							{target ? (
								<span className="mt-[1px] shrink-0 whitespace-nowrap text-[12px] font-[500] text-[var(--accent-primary)]">
									Jump to {KIND_LABEL[target.kind].toLowerCase()} →
								</span>
							) : null}
						</button>
					);
				})}
			</div>
		</section>
	);
}

// ── § ARTIFACTS — THIN opener rows (no nesting; the block opens in the pane) ─────────

interface ArtifactRowProps {
	readonly artifact: SubjectArtifactRow;
	readonly active: boolean;
	readonly onOpen: () => void;
}

function ArtifactRow({ artifact, active, onOpen }: ArtifactRowProps): JSX.Element {
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-current={active}
			className={[
				"group flex w-full items-center gap-[12px] rounded-[var(--r-subtle)] border bg-[var(--surface-elevated)] px-[12px] py-[9px] text-left transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
				active
					? "border-[var(--accent-primary)] bg-[var(--accent-primary-dim)]"
					: "border-[var(--border-subtle)] hover:border-[var(--border-default)]",
			].join(" ")}
		>
			<KindBadge kind={artifact.kind} />
			<ToolLogo tool={artifact.tool} size="sm" />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-[6px]">
					<span className="truncate font-mono text-[13px] font-[600] text-[var(--text-primary)]">
						{artifact.title}
					</span>
					{artifact.reviewed ? (
						<span className="inline-flex items-center gap-[3px] text-[11px] font-[500] text-[var(--status-success)]">
							<CheckGlyph />
							reviewed
						</span>
					) : null}
					{artifact.needsYou ? (
						<span className="inline-flex items-center gap-[4px] text-[11px] font-[600] text-[var(--text-secondary)]">
							<span
								aria-hidden="true"
								className="h-[6px] w-[6px] rounded-[var(--r-pill)]"
								style={{ background: "var(--status-warning)" }}
							/>
							Needs you
						</span>
					) : null}
				</div>
				<p className="truncate text-[12px] text-[var(--text-secondary)]">{artifact.summary}</p>
			</div>
			<span className="font-mono text-[12px] tabular-nums text-[var(--text-tertiary)] shrink-0">
				{artifact.badge}
			</span>
			<span className="text-[12px] font-[500] text-[var(--accent-primary)] shrink-0 transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)] group-hover:translate-x-[3px]">
				Open →
			</span>
		</button>
	);
}

function ArtifactsSection({
	activeId,
	onOpen,
}: {
	activeId: string | null;
	onOpen: (id: string) => void;
}): JSX.Element {
	const s = REVIEW_SUBJECT;
	return (
		<section>
			<SectionHead label="Artifacts" count={String(s.artifacts.length)} />
			<div className="flex flex-col gap-[6px]">
				{s.artifacts.map((a) => (
					<ArtifactRow
						key={a.id}
						artifact={a}
						active={a.id === activeId}
						onOpen={() => onOpen(a.id)}
					/>
				))}
			</div>
		</section>
	);
}

// ── § CONVERSATION — on the content, inline at the end of the center ────────────────

function CommentItem({ comment }: { comment: ReviewComment }): JSX.Element {
	return (
		<div className="flex items-start gap-[9px]">
			{comment.isAgent ? <AgentAvatar name={comment.author} /> : <HumanAvatar name={comment.author} />}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-[6px]">
					<span className="text-[13px] font-[600] text-[var(--text-primary)]">{comment.author}</span>
					{comment.isAgent ? (
						<span className="rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[6px] py-[1px] text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
							agent
						</span>
					) : null}
					<span className="text-[11px] text-[var(--text-tertiary)]">{comment.ago}</span>
				</div>
				{comment.anchor ? (
					/* reference chip — the comment points AT something (a spot / an artifact) as
					   context, so feedback can target a place without spawning a second thread. */
					<button
						type="button"
						onClick={() => {}}
						className="mt-[3px] inline-flex items-center gap-[4px] rounded-[6px] border border-[var(--border-subtle)] bg-[var(--surface-container)] px-[6px] py-[1px] text-[11px] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:text-[var(--text-secondary)]"
					>
						<span className="text-[var(--text-tertiary)]">on</span>
						<span className="font-mono text-[var(--text-secondary)]">{comment.anchor}</span>
					</button>
				) : null}
				<p className="mt-[3px] text-[13px] leading-[1.5] text-[var(--text-secondary)]">{comment.body}</p>
			</div>
		</div>
	);
}

function Composer({ placeholder }: { placeholder: string }): JSX.Element {
	return (
		<div className="flex items-center gap-[9px] rounded-[var(--r-subtle)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[9px]">
			<input
				type="text"
				readOnly
				placeholder={placeholder}
				className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
			/>
			<button
				type="button"
				onClick={() => {}}
				className="rounded-[var(--r-pill)] bg-[var(--accent-primary)] px-[12px] py-[6px] text-[12px] font-[600] text-white"
			>
				Comment
			</button>
		</div>
	);
}

function ConversationSection({ comments }: { comments: readonly ReviewComment[] }): JSX.Element {
	return (
		<section>
			<SectionHead label="Conversation" count={String(comments.length)} />
			<div className="flex flex-col gap-[12px]">
				{comments.map((c) => (
					<CommentItem key={c.id} comment={c} />
				))}
				<Composer placeholder="Reply, or ask Atlas a question about this review…" />
			</div>
		</section>
	);
}

// ── the right pane — opens on a clicked artifact; conversation ON the content ────────

function ExaminePane({
	artifact,
	onClose,
}: {
	artifact: SubjectArtifactRow;
	onClose: () => void;
}): JSX.Element {
	// Round-3 (1): ONE conversation only — the global one in the center overview. The
	// pane shows the building block alone; to discuss a spot here you "Comment on this"
	// and it lands in the global thread carrying a reference chip back to this artifact.
	return (
		<aside className="flex h-full w-[620px] shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-container)]">
			<div className="flex items-center gap-[9px] border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[18px] py-[12px]">
				<KindBadge kind={artifact.kind} />
				<ToolLogo tool={artifact.tool} size="sm" />
				<span className="min-w-0 flex-1 truncate font-mono text-[13px] font-[600] text-[var(--text-primary)]">
					{artifact.title}
				</span>
				<button
					type="button"
					onClick={() => {}}
					className="rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[10px] py-[5px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:text-[var(--text-primary)]"
				>
					Comment on this
				</button>
				<button
					type="button"
					aria-label="Close artifact"
					onClick={onClose}
					className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] text-[14px] leading-none text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:text-[var(--text-primary)]"
				>
					✕
				</button>
			</div>

			<div className="min-h-0 flex-1 overflow-auto">
				<div className="flex flex-col gap-[18px] p-[18px]">
					{/* the building block at full size — REAL ReviewCodeDiff for the code artifact.
					    No second conversation lives here (round-3: one global thread only). */}
					{artifact.kind === "code" ? <ReviewCodeDiff /> : <PlaceholderBlock artifact={artifact} />}
				</div>
			</div>
		</aside>
	);
}

/** faithful placeholder for non-code artifacts (the real block exists as its own canvas). */
function PlaceholderBlock({ artifact }: { artifact: SubjectArtifactRow }): JSX.Element {
	return (
		<div className="overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-page)] shadow-[var(--shadow-default)]">
			<div className="flex items-center gap-[9px] border-b border-[var(--border-subtle)] px-[18px] py-[12px]">
				<ToolLogo tool={artifact.tool} size="md" />
				<span className="text-[13px] font-[600] text-[var(--text-primary)]">{KIND_LABEL[artifact.kind]} proof</span>
				<span className="ml-auto font-mono text-[12px] tabular-nums text-[var(--text-tertiary)]">
					{artifact.badge}
				</span>
			</div>
			<div className="flex flex-col gap-[9px] p-[18px]">
				<p className="text-[14px] leading-[1.55] text-[var(--text-secondary)]">{artifact.summary}</p>
				{artifact.needsYou ? (
					<p className="rounded-[var(--r-subtle)] border-l-[3px] border-[var(--status-warning)] bg-[color-mix(in_oklab,var(--status-warning)_8%,transparent)] px-[12px] py-[9px] text-[13px] text-[var(--text-secondary)]">
						{artifact.needsYou}
					</p>
				) : null}
				<p className="text-[12px] text-[var(--text-tertiary)]">
					{/* the real family canvas (e.g. ReviewActionOperation / ReviewMetricsMoved /
					    ReviewVisualDiff) renders here in production; shown as a faithful stand-in. */}
					Full {KIND_LABEL[artifact.kind].toLowerCase()} canvas renders here at full size.
				</p>
			</div>
		</div>
	);
}

// ── the composition ─────────────────────────────────────────────────────────────────

export interface ReviewCompositionRefinedProps {
	/** open the right pane on this artifact at mount (the Examining story). */
	readonly initialOpenArtifactId?: string | null;
}

export function ReviewCompositionRefined({
	initialOpenArtifactId = null,
}: ReviewCompositionRefinedProps = {}): JSX.Element {
	const [activeId, setActiveId] = useState<string | null>(initialOpenArtifactId);
	const [menuOpen, setMenuOpen] = useState(false);

	const activeArtifact = REVIEW_SUBJECT.artifacts.find((a) => a.id === activeId) ?? null;

	function openArtifact(id: string): void {
		setActiveId((cur) => (cur === id ? null : id));
	}

	return (
		<div className="flex h-full w-full bg-[var(--surface-page)] text-[var(--text-primary)]">
			{/* CENTER — the whole review you approve. Narrows when the pane is open. */}
			<div className="flex h-full min-w-0 flex-1 flex-col">
				<FrameHeader menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((v) => !v)} />

				<div className="min-h-0 flex-1 overflow-auto">
					<div className="flex max-w-[920px] flex-col gap-[36px] px-[24px] py-[24px]">
						<TaskSection />
						<ResultSection />
						<NeedsSection onJump={openArtifact} />
						<ArtifactsSection activeId={activeId} onOpen={openArtifact} />
						{/* conversation ON the content — inline at the end of the center overview */}
						<ConversationSection comments={REVIEW_SUBJECT.conversation} />
					</div>
				</div>
			</div>

			{/* RIGHT PANE — opens on a clicked artifact; closing returns full width */}
			{activeArtifact ? (
				<ExaminePane artifact={activeArtifact} onClose={() => setActiveId(null)} />
			) : null}
		</div>
	);
}
