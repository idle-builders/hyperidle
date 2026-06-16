// AL1 — Variant A: The Verdict Brief.
//
// The review reads as a top-down BRIEFING that ends in a decision. Examine is
// nested inside converse — one scrollable narrative column on --surface-page,
// evidence expands in place, the verdict bar stays pinned at the bottom.
//
// Signature (the one tell): the "Needs you" panel sits at the very TOP, above
// any artifact. Empty → approve in 5 seconds. Non-empty → it is the agenda, and
// the diff lives collapsed, below it.
//
// @lore AL1-A: presentational only. CommentRow/Composer from the DS require a
// full @hyperidle/shared Message union; the conversation rows here are
// hand-rendered in Hearth chrome (agent avatar is AQ-012 green-distinct via the
// DS Avatar `agent` prop) rather than synthesizing Message fixtures — "use DS
// components where they fit". Callbacks are no-ops; expand/collapse is local.

import {
	ArtifactCostChip,
	ArtifactKindBadge,
	Avatar,
	Breadcrumb,
	Button,
	CodeRenderer,
	DataRenderer,
	ErrorState,
	Progress,
	RowDot,
	SkeletonList,
	StatusChip,
	Tag,
	TextRenderer,
} from "@hyperidle/design-system";
import type { JSX, ReactNode } from "react";
import { useState } from "react";
import {
	NEEDS_ATTENTION,
	type NeedsAttentionItem,
	type RationaleDecision,
	REVIEW_FIXTURE,
	type ReviewComment,
	type ReviewFixture,
	type ReviewParty,
	type SubjectArtifact,
} from "./review-fixtures";

// ── Small token-styled helpers ──────────────────────────────────────────────

function SectionHeader({ children }: { children: ReactNode }): JSX.Element {
	return (
		<h2 className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)] mb-[12px]">
			{children}
		</h2>
	);
}

function PartyAvatar({ party }: { party: ReviewParty }): JSX.Element {
	return <Avatar initials={party.initials} size="sm" agent={party.kind === "agent"} />;
}

const NEEDS_TONE: Record<NeedsAttentionItem["kind"], "info" | "warning" | "neutral"> = {
	gap: "info",
	risk: "warning",
	"blocking-comment": "neutral",
};

const NEEDS_VERB: Record<NeedsAttentionItem["kind"], string> = {
	gap: "Gap",
	risk: "Risk",
	"blocking-comment": "Open question",
};

// ── Disclosure row (chevron + summary, expands content below) ────────────────

function Chevron({ open }: { open: boolean }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className="inline-block text-[var(--text-tertiary)] transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)] shrink-0 select-none"
			style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
		>
			›
		</span>
	);
}

// ── Subject (evidence) — collapsed rows that expand the real renderer ────────

function artifactRenderer(artifact: SubjectArtifact): JSX.Element {
	switch (artifact.kind) {
		case "code":
			return <CodeRenderer preview={artifact.code ?? null} kind="code" />;
		case "data":
			return <DataRenderer preview={artifact.data ?? null} kind="data" />;
		case "text":
			return <TextRenderer preview={artifact.text ?? null} kind="text" />;
		case "action":
			return <ActionCard action={artifact.action} />;
		default:
			return <TextRenderer preview={null} kind="text" />;
	}
}

function ActionCard({
	action,
}: {
	action?: { summary: string; consequence: string; undo: string };
}): JSX.Element {
	if (!action) {
		return <p className="text-[13px] italic text-[var(--text-tertiary)]">No action detail.</p>;
	}
	return (
		<div className="flex flex-col gap-[9px] bg-[var(--surface-container)] rounded-[var(--r-default)] p-[12px] text-[13px]">
			<p className="text-[var(--text-primary)] leading-[var(--leading-body)]">{action.summary}</p>
			<div className="flex gap-[9px]">
				<span className="shrink-0 font-[600] text-[var(--status-warning)] w-[96px]">
					Consequence:
				</span>
				<span className="text-[var(--text-secondary)]">{action.consequence}</span>
			</div>
			<div className="flex gap-[9px]">
				<span className="shrink-0 font-[600] text-[var(--text-tertiary)] w-[96px]">Undo:</span>
				<span className="text-[var(--text-secondary)]">{action.undo}</span>
			</div>
		</div>
	);
}

function ArtifactRow({
	artifact,
	open,
	onToggle,
}: {
	artifact: SubjectArtifact;
	open: boolean;
	onToggle: () => void;
}): JSX.Element {
	const reviewed = artifact.reviewed === "reviewed";
	return (
		<div className="border-b border-[var(--border-subtle)] last:border-b-0">
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={open}
				className="w-full flex items-center gap-[12px] py-[9px] text-left min-h-[44px] hover:bg-[var(--accent-primary-dim)] rounded-[var(--r-subtle)] px-[6px] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]"
			>
				<Chevron open={open} />
				<ArtifactKindBadge kind={artifact.kind} />
				<span className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--text-primary)] shrink-0 max-w-[260px] truncate">
					{artifact.path}
				</span>
				<span className="flex-1 min-w-0 text-[13px] text-[var(--text-secondary)] truncate">
					{artifact.resultSummary}
				</span>
				<span
					title={reviewed ? "Reviewed" : "Not yet reviewed"}
					className={[
						"shrink-0 inline-flex items-center justify-center h-[18px] w-[18px] rounded-full border-[1.5px] text-[11px]",
						reviewed
							? "bg-[var(--accent-primary-dim)] border-[var(--accent-primary)] text-[var(--accent-primary)]"
							: "border-[var(--border-default)] text-transparent",
					].join(" ")}
				>
					✓
				</span>
			</button>
			{open ? <div className="px-[6px] pb-[18px] pt-[3px]">{artifactRenderer(artifact)}</div> : null}
		</div>
	);
}

// ── Rationale ────────────────────────────────────────────────────────────────

function confidenceVariant(confidence: number): "green" | "amber" {
	return confidence >= 80 ? "green" : "amber";
}

function RationaleCard({ decision }: { decision: RationaleDecision }): JSX.Element {
	const risk = decision.risk === true;
	return (
		<div
			className={[
				"flex flex-col gap-[9px] rounded-[var(--r-default)] p-[12px] border",
				risk
					? "bg-[var(--accent-secondary-dim)] border-[var(--accent-secondary)]"
					: "bg-[var(--surface-elevated)] border-[var(--border-subtle)]",
			].join(" ")}
		>
			<div className="flex items-start gap-[9px]">
				<span className="flex-1 text-[15px] text-[var(--text-primary)] leading-[var(--leading-body)]">
					{decision.decision}
				</span>
				{risk ? <Tag label="RISK" /> : null}
			</div>
			{decision.alternativesDiscarded.map((alt) => (
				<p key={alt} className="text-[13px] text-[var(--text-secondary)]">
					<span className="text-[var(--text-tertiary)]">instead of:</span> {alt}
				</p>
			))}
			<div className="flex items-center gap-[18px]">
				<div className="w-[140px]">
					<Progress
						value={decision.confidence}
						label="confidence"
						variant={confidenceVariant(decision.confidence)}
					/>
				</div>
				<span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-tertiary)] truncate">
					{decision.anchor}
				</span>
			</div>
		</div>
	);
}

// ── Conversation (hand-rendered Hearth rows; agent avatar AQ-012) ────────────

function CommentBubble({ comment, indented }: { comment: ReviewComment; indented?: boolean }): JSX.Element {
	const dimmed = comment.resolved === true;
	return (
		<div className={`flex gap-[12px] ${indented ? "ml-[36px]" : ""} ${dimmed ? "opacity-60" : ""}`}>
			<PartyAvatar party={comment.author} />
			<div className="flex flex-col gap-[3px] min-w-0 flex-1">
				<div className="flex items-baseline gap-[6px] flex-wrap">
					<span className="text-[13px] font-[600] text-[var(--text-primary)]">
						{comment.author.name}
					</span>
					{comment.author.kind === "agent" ? (
						<span className="inline-flex items-center px-[6px] py-[3px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] text-[var(--accent-primary)] text-[10px] font-[600] tracking-[var(--tracking-caps-sm)]">
							Agent
						</span>
					) : null}
					<span className="text-[12px] text-[var(--text-tertiary)]">{comment.timestamp}</span>
					{comment.resolved ? <Tag label="RESOLVED" /> : null}
					{comment.blocking && !comment.resolved ? (
						<StatusChip status="blocked" label="BLOCKING" />
					) : null}
				</div>
				{comment.anchor ? (
					<div className="text-[11px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						on{" "}
						<span className="font-[family-name:var(--font-mono)] text-[var(--text-secondary)] normal-case">
							{comment.anchor}
						</span>
					</div>
				) : null}
				<p className="text-[15px] text-[var(--text-secondary)] leading-[1.7]">{comment.body}</p>
			</div>
		</div>
	);
}

// ── Needs-you panel (the signature) ──────────────────────────────────────────

function NeedsYouPanel({
	items,
	onJump,
}: {
	items: ReadonlyArray<NeedsAttentionItem>;
	onJump: (item: NeedsAttentionItem) => void;
}): JSX.Element {
	if (items.length === 0) {
		return (
			<div className="rounded-[var(--r-default)] bg-[var(--accent-primary-dim)] border border-[var(--accent-primary)] p-[18px] flex items-center gap-[12px]">
				<span className="inline-flex items-center justify-center h-[36px] w-[36px] rounded-full bg-[var(--accent-primary)] text-[var(--text-on-accent)] text-[18px] shrink-0">
					✓
				</span>
				<div className="flex flex-col gap-[3px]">
					<span className="text-[15px] font-[600] text-[var(--text-primary)]">
						Nothing needs you.
					</span>
					<span className="text-[13px] text-[var(--text-secondary)]">
						4 artifacts, intent fully met. You can approve without drilling in.
					</span>
				</div>
			</div>
		);
	}
	return (
		<div className="rounded-[var(--r-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)] p-[18px]">
			<h2 className="text-[13px] font-[600] text-[var(--text-primary)] mb-[12px]">
				{items.length} things need you before you can approve
			</h2>
			<div className="flex flex-col">
				{items.map((item) => (
					<button
						key={item.id}
						type="button"
						onClick={() => onJump(item)}
						className="group flex items-start gap-[12px] py-[9px] text-left border-b border-[var(--border-subtle)] last:border-b-0 min-h-[44px] hover:bg-[var(--accent-primary-dim)] rounded-[var(--r-subtle)] px-[6px] -mx-[6px] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]"
					>
						<span className="pt-[6px]">
							<RowDot tone={NEEDS_TONE[item.kind]} label={NEEDS_VERB[item.kind]} />
						</span>
						<span className="flex-1 min-w-0 flex flex-col gap-[3px]">
							<span className="text-[13px] font-[500] text-[var(--text-primary)]">
								{item.label}
							</span>
							<span className="text-[12px] text-[var(--text-secondary)]">{item.detail}</span>
						</span>
						<span className="shrink-0 self-center text-[12px] font-[500] text-[var(--accent-primary)] opacity-70 group-hover:opacity-100">
							Jump ↓
						</span>
					</button>
				))}
			</div>
		</div>
	);
}

// ── Intent (ask ↔ result) ────────────────────────────────────────────────────

function IntentChecklist({ review }: { review: ReviewFixture }): JSX.Element {
	const met = review.intentItems.filter((i) => i.addressed).length;
	const total = review.intentItems.length;
	return (
		<section>
			<SectionHeader>The ask</SectionHeader>
			<p className="text-[15px] italic text-[var(--text-secondary)] leading-[1.7] mb-[12px]">
				{review.intentStatement}
			</p>
			<div className="flex flex-col gap-[3px] mb-[12px]">
				{review.intentItems.map((item) => {
					const ok = item.addressed;
					return (
						<div
							key={item.id}
							className={[
								"flex items-center gap-[9px] py-[6px] px-[6px] rounded-[var(--r-subtle)]",
								ok ? "" : "bg-[var(--status-error-dim)]",
							].join(" ")}
						>
							<span
								aria-hidden="true"
								className={[
									"shrink-0 text-[13px] font-[700] w-[18px] text-center",
									ok ? "text-[var(--status-success)]" : "text-[var(--status-error)]",
								].join(" ")}
							>
								{ok ? "✓" : "✗"}
							</span>
							<span className="flex-1 text-[13px] text-[var(--text-primary)]">{item.text}</span>
							{item.evidenceAnchor ? (
								<span className="shrink-0 font-[family-name:var(--font-mono)] text-[11px] text-[var(--accent-primary)]">
									→ {item.evidenceAnchor}
								</span>
							) : null}
							{!ok ? <Tag label="NOT ADDRESSED" /> : null}
						</div>
					);
				})}
			</div>
			<div className="flex items-center gap-[12px]">
				<span className="text-[12px] font-[500] text-[var(--text-secondary)] shrink-0">
					{met} of {total} met
				</span>
				<div className="flex-1 max-w-[220px]">
					<Progress value={(met / total) * 100} variant={met === total ? "green" : "amber"} />
				</div>
			</div>
		</section>
	);
}

// ── Verdict bar (pinned) ─────────────────────────────────────────────────────

function Kbd({ children }: { children: ReactNode }): JSX.Element {
	return (
		<span className="ml-[6px] inline-flex items-center justify-center h-[16px] min-w-[16px] px-[3px] rounded-[var(--r-subtle)] bg-[color-mix(in_oklab,var(--text-primary)_10%,transparent)] text-[10px] font-[family-name:var(--font-mono)] text-[var(--text-tertiary)]">
			{children}
		</span>
	);
}

function VerdictBar({
	review,
	unresolved,
}: {
	review: ReviewFixture;
	unresolved: number;
}): JSX.Element {
	return (
		<div
			className="shrink-0 sticky bottom-0 bg-[var(--surface-elevated)] shadow-[var(--shadow-elevated)] border-t border-[var(--border-subtle)] px-[24px] py-[12px] flex items-center gap-[18px] flex-wrap"
			style={{ zIndex: "var(--z-sticky)" }}
		>
			<span className="flex items-center gap-[6px] text-[13px] shrink-0">
				{review.blocking ? <StatusChip status="blocked" label="BLOCKING" /> : null}
				<span className="text-[var(--text-secondary)]">{unresolved} unresolved</span>
			</span>
			<div className="flex items-center gap-[9px] flex-wrap ml-auto">
				<Button variant="primary">
					Approve
					<Kbd>A</Kbd>
				</Button>
				<Button variant="ghost">
					Approve w/ comments
					<Kbd>C</Kbd>
				</Button>
				<Button variant="ghost">
					Request changes
					<Kbd>R</Kbd>
				</Button>
				<Button variant="ghost">
					Edit
					<Kbd>E</Kbd>
				</Button>
				<Button variant="ghost" className="text-[var(--status-error)] hover:bg-[var(--status-error-dim)]">
					Reject
					<Kbd>X</Kbd>
				</Button>
			</div>
		</div>
	);
}

// ── Props ────────────────────────────────────────────────────────────────────

export type ReviewBriefState = "populated" | "empty-needs-you" | "resolved" | "loading" | "error";

export interface ReviewBriefProps {
	review?: ReviewFixture;
	needsAttention?: ReadonlyArray<NeedsAttentionItem>;
	state?: ReviewBriefState;
	/** Artifact ids that start expanded (the Populated story expands the diff). */
	initiallyExpanded?: ReadonlyArray<string>;
}

// ── Surface ──────────────────────────────────────────────────────────────────

export function ReviewBrief({
	review = REVIEW_FIXTURE,
	needsAttention = NEEDS_ATTENTION,
	state = "populated",
	initiallyExpanded = [],
}: ReviewBriefProps): JSX.Element {
	const [openArtifacts, setOpenArtifacts] = useState<ReadonlySet<string>>(
		() => new Set(initiallyExpanded),
	);
	const [rationaleOpen, setRationaleOpen] = useState(false);

	const resolved = state === "resolved";
	const effectiveNeeds = state === "empty-needs-you" ? [] : needsAttention;

	const sortedRationale = [...review.rationale].sort((a, b) => a.confidence - b.confidence);
	const unresolved = review.conversation.filter((c) => c.blocking && !c.resolved).length + 1;

	function toggleArtifact(id: string): void {
		setOpenArtifacts((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function jumpTo(item: NeedsAttentionItem): void {
		if (item.artifactId) {
			setOpenArtifacts((prev) => new Set(prev).add(item.artifactId as string));
		}
	}

	const COLUMN = "w-full max-w-[820px] px-[24px] py-[24px] flex flex-col gap-[24px]";

	if (state === "loading") {
		return (
			<div className="h-full flex flex-col bg-[var(--surface-page)]">
				<div className="flex-1 overflow-y-auto">
					<div className={COLUMN}>
						<SkeletonList rows={6} ariaLabel="Loading review" />
					</div>
				</div>
				<div className="shrink-0 bg-[var(--surface-elevated)] shadow-[var(--shadow-elevated)] border-t border-[var(--border-subtle)] px-[24px] py-[12px]">
					<div className="h-[40px] rounded-[var(--r-pill)] bg-[var(--surface-container)] animate-[skeleton-pulse_1.8s_ease-in-out_infinite] max-w-[420px] ml-auto" />
				</div>
			</div>
		);
	}

	if (state === "error") {
		return (
			<div className="h-full flex flex-col bg-[var(--surface-page)]">
				<div className="flex-1 overflow-y-auto">
					<div className={COLUMN}>
						<ErrorState
							title="Couldn’t load this review"
							description="The review subject failed to load. Retry, or come back in a moment."
							detail="Error 502: review service unavailable"
							onRetry={(): void => undefined}
						/>
					</div>
				</div>
				<div className="shrink-0 bg-[var(--surface-elevated)] shadow-[var(--shadow-elevated)] border-t border-[var(--border-subtle)] px-[24px] py-[12px] flex justify-end opacity-50 pointer-events-none">
					<Button variant="primary" disabled>
						Approve
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col bg-[var(--surface-page)]">
			<div className="flex-1 overflow-y-auto">
				<div className={COLUMN}>
					{/* 1 — Orientation band */}
					<header className="flex flex-col gap-[9px]">
						<Breadcrumb
							segments={[
								{ label: "Billing reliability", to: "#bet" },
								{ label: review.workIdentity },
							]}
						/>
						<h1 className="text-[24px] font-[700] text-[var(--text-primary)] leading-[1.25]">
							{review.workIdentity}
						</h1>
						<div className="flex items-center gap-[9px] flex-wrap text-[13px] text-[var(--text-secondary)]">
							<span className="flex items-center gap-[6px]">
								<PartyAvatar party={review.author} />
								<span className="text-[var(--text-primary)] font-[500]">{review.author.name}</span>
							</span>
							<span className="text-[var(--text-tertiary)]">→</span>
							<span className="flex items-center gap-[6px]">
								<PartyAvatar party={review.reviewer} />
								<span className="text-[var(--text-primary)] font-[500]">{review.reviewer.name}</span>
							</span>
							<span className="text-[var(--border-strong)]">·</span>
							{resolved ? (
								<StatusChip status="done" label="APPROVED W/ COMMENTS" />
							) : (
								<>
									<StatusChip status="paused" label="AWAITING VERDICT" />
									{review.blocking ? <StatusChip status="blocked" label="BLOCKING" /> : null}
								</>
							)}
							<span className="text-[var(--border-strong)]">·</span>
							<ArtifactCostChip cost={review.cost} />
							<span className="text-[var(--border-strong)]">·</span>
							<span className="text-[var(--text-tertiary)]">{review.producedAgo}</span>
						</div>
						<p className="text-[12px] text-[var(--text-tertiary)]">
							Why you’re here: {review.autonomyContext}
						</p>
					</header>

					{/* 2 — Result headline */}
					<p className="text-[15px] text-[var(--text-primary)] leading-[1.7]">
						{review.resultHeadline}
					</p>

					{/* 3 — Needs-you panel (the signature: above any artifact) */}
					{resolved ? (
						<div className="rounded-[var(--r-default)] bg-[var(--surface-container)] p-[18px] text-[13px] text-[var(--text-secondary)]">
							<span className="font-[600] text-[var(--text-primary)]">Resolved.</span> 1 risk
							acknowledged, 1 gap deferred to follow-up, blocking question answered.
						</div>
					) : (
						<NeedsYouPanel items={effectiveNeeds} onJump={jumpTo} />
					)}

					{/* 4 — Ask ↔ Result */}
					<IntentChecklist review={review} />

					{/* 5 — The Subject (evidence, collapsed) */}
					<section>
						<SectionHeader>
							What {review.author.name} produced · {review.artifacts.length} artifacts
						</SectionHeader>
						<div className="rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[12px]">
							{review.artifacts.map((artifact) => (
								<ArtifactRow
									key={artifact.id}
									artifact={artifact}
									open={openArtifacts.has(artifact.id)}
									onToggle={(): void => toggleArtifact(artifact.id)}
								/>
							))}
						</div>
					</section>

					{/* 6 — Rationale (collapsed, least-confident first) */}
					<section>
						<button
							type="button"
							onClick={(): void => setRationaleOpen((v) => !v)}
							aria-expanded={rationaleOpen}
							className="w-full flex items-center gap-[9px] text-left min-h-[44px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)] rounded-[var(--r-subtle)]"
						>
							<Chevron open={rationaleOpen} />
							<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
								Why — {review.rationale.length} decisions, least-confident first
							</span>
						</button>
						{rationaleOpen ? (
							<div className="flex flex-col gap-[9px] mt-[9px]">
								{sortedRationale.map((decision) => (
									<RationaleCard key={decision.id} decision={decision} />
								))}
							</div>
						) : null}
					</section>

					{/* 7 — Conversation (inline) */}
					<section>
						<SectionHeader>Discussion</SectionHeader>
						<div className="flex flex-col gap-[18px]">
							{review.conversation.map((comment) => (
								<div key={comment.id} className="flex flex-col gap-[12px]">
									<CommentBubble comment={comment} />
									{comment.replies?.map((reply) => (
										<CommentBubble key={reply.id} comment={reply} indented />
									))}
								</div>
							))}
						</div>
						<div className="mt-[18px]">
							<MiniComposer />
						</div>
					</section>
				</div>
			</div>

			{/* Pinned verdict bar */}
			{resolved ? (
				<div
					className="shrink-0 sticky bottom-0 bg-[var(--surface-elevated)] shadow-[var(--shadow-elevated)] border-t border-[var(--border-subtle)] px-[24px] py-[12px] flex items-center gap-[12px]"
					style={{ zIndex: "var(--z-sticky)" }}
				>
					<StatusChip status="done" label="APPROVED W/ COMMENTS" />
					<span className="text-[13px] text-[var(--text-secondary)]">Robin · 2:38 PM</span>
					<Button variant="ghost" className="ml-auto">
						Re-expand
					</Button>
				</div>
			) : (
				<VerdictBar review={review} unresolved={unresolved} />
			)}
		</div>
	);
}

// Self-contained composer (DS Composer needs threadId/onSubmit; a no-op shell
// keeps the story presentational and avoids Promise-returning fixture wiring).
function MiniComposer(): JSX.Element {
	return (
		<div className="flex items-stretch gap-[9px]">
			<textarea
				rows={1}
				placeholder="Reply to thread…"
				className="flex-1 min-h-[44px] resize-none bg-[var(--surface-page)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border-[1.5px] border-[var(--border-default)] rounded-[var(--r-default)] px-[12px] py-[9px] text-[15px] focus:outline-none focus:border-[var(--accent-primary)]"
			/>
			<button
				type="button"
				className="px-[12px] min-h-[44px] rounded-[var(--r-pill)] text-[12px] font-[500] bg-[var(--accent-primary)] text-[var(--text-on-accent)] self-stretch"
			>
				Send
			</button>
		</div>
	);
}
