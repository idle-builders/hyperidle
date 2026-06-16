// AL1 Variant C — The Reasoning Ledger.
//
// A reviewer of agent work who trusts the diff least and the *reasoning* most:
// reads the agent's structured decisions against the spec, sorted by confidence
// (riskiest first), spot-checks the code under any decision in one click, decides.
//
// Signature: the confidence-sorted Decision Ledger as the center spine — each row
// is one agent decision (confidence meter + discarded alternative + the intent it
// serves or the gap it leaves), its diff one click below. "Show me where the agent
// was unsure" is the DEFAULT view, not a filter you hunt for.
//
// @lore AL1-design: presentational-only design exploration. No router/context,
// no production schemas — renders the shared `review-fixtures` through the REAL
// DS renderers (getRenderer) to prove the variant on realistic content.

import type { Message } from "@hyperidle/shared";
import {
	ArtifactCostChip,
	ArtifactKindBadge,
	Avatar,
	Button,
	CommentRow,
	Composer,
	EmptyState,
	ErrorState,
	getRenderer,
	Progress,
	SkeletonList,
	StatusChip,
	Tag,
} from "@hyperidle/design-system";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import {
	NEEDS_ATTENTION,
	REVIEW_FIXTURE,
	REVIEW_PROGRESS,
	type IntentItem,
	type NeedsAttentionItem,
	type RationaleDecision,
	type ReviewComment,
	type ReviewFixture,
	type SubjectArtifact,
} from "./review-fixtures.js";

// ── Props ────────────────────────────────────────────────────────────────────

type LedgerState = "populated" | "no-rationale" | "loading" | "error";
type SortMode = "confidence" | "order" | "risk";

export interface ReviewLedgerProps {
	review?: ReviewFixture;
	needsAttention?: ReadonlyArray<NeedsAttentionItem>;
	progress?: { reviewed: number; total: number };
	/** initial sort for the ledger (default: confidence ascending — riskiest first). */
	initialSort?: SortMode;
	/** decision id expanded on first render (default: the 45% partial-refund row). */
	initialExpanded?: string | null;
	state?: LedgerState;
}

// ── Confidence band → color token ────────────────────────────────────────────

interface ConfidenceBand {
	readonly fill: "green" | "amber";
	readonly text: string;
	readonly label: string;
}

function bandFor(confidence: number): ConfidenceBand {
	if (confidence < 50) {
		return { fill: "amber", text: "var(--status-error)", label: "low" };
	}
	if (confidence < 60) {
		return { fill: "amber", text: "var(--status-warning)", label: "uncertain" };
	}
	if (confidence < 80) {
		return { fill: "amber", text: "var(--accent-secondary)", label: "moderate" };
	}
	return { fill: "green", text: "var(--status-success)", label: "confident" };
}

// ── A decision serves / leaves-unaddressed an intent item ────────────────────

function intentFor(
	decision: RationaleDecision,
	items: ReadonlyArray<IntentItem>,
): IntentItem | undefined {
	if (!decision.intentItemId) return undefined;
	return items.find((it) => it.id === decision.intentItemId);
}

// ── Fixture comment → a plain Message the DS CommentRow can render ────────────
// @lore AL1: CommentRow takes a real shared Message. We map each anchored review
// comment to a `type:"plain"` Message. clockTime() can't parse "4 min ago" and
// returns TIME_PLACEHOLDER, which CommentRow coerces to null and hides — so the
// relative time rides along as a meta line instead of the header chip.

function toMessage(comment: ReviewComment): Message {
	return {
		id: comment.id,
		threadId: "rev-thread",
		senderId: comment.author.id,
		clientKey: comment.id,
		deletedAt: null,
		redactedAt: null,
		resolvedAt: comment.resolved ? "resolved" : null,
		createdAt: comment.timestamp,
		type: "plain",
		payload: { text: comment.body },
	};
}

// ─────────────────────────────────────────────────────────────────────────────

export function ReviewLedger({
	review = REVIEW_FIXTURE,
	needsAttention = NEEDS_ATTENTION,
	progress = REVIEW_PROGRESS,
	initialSort = "confidence",
	initialExpanded = "r2",
	state = "populated",
}: ReviewLedgerProps): JSX.Element {
	const [sort, setSort] = useState<SortMode>(initialSort);
	const [expanded, setExpanded] = useState<string | null>(initialExpanded);
	const [intentFilter, setIntentFilter] = useState<string | null>(null);

	const artifactById = useMemo(
		() => new Map(review.artifacts.map((a) => [a.id, a])),
		[review.artifacts],
	);

	const intentMet = review.intentItems.filter((it) => it.addressed).length;

	// Sort + filter the ledger.
	const rows = useMemo<ReadonlyArray<RationaleDecision>>(() => {
		let list = [...review.rationale];
		if (sort === "risk") {
			list = list.filter((d) => d.risk);
		} else if (sort === "confidence") {
			list.sort((a, b) => a.confidence - b.confidence);
		}
		// "order" leaves the fixture order intact.
		if (intentFilter) {
			list = list.filter((d) => d.intentItemId === intentFilter);
		}
		return list;
	}, [review.rationale, sort, intentFilter]);

	return (
		<div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
			<TopBar review={review} progress={progress} />
			<div className="flex flex-1 min-h-0">
				<main className="flex-1 min-w-0 overflow-y-auto bg-[var(--surface-page)] px-[24px] py-[18px]">
					{state === "loading" ? (
						<SkeletonList rows={5} ariaLabel="Loading reasoning ledger" />
					) : state === "error" ? (
						<ErrorState
							title="Couldn't load the reasoning"
							description="The rationale for this work didn't load. The artifacts are still reachable in the right rail."
							detail="Error 502 · fabric.assembleRationale timed out"
							onRetry={(): void => undefined}
						/>
					) : state === "no-rationale" ? (
						<NoRationalePane artifacts={review.artifacts} />
					) : (
						<>
							<LedgerHeader
								count={review.rationale.length}
								sort={sort}
								onSort={setSort}
								intentMet={intentMet}
								intentTotal={review.intentItems.length}
							/>
							<div className="flex flex-col gap-[12px] mt-[12px]">
								{rows.map((decision) => (
									<LedgerRow
										key={decision.id}
										decision={decision}
										intent={intentFor(decision, review.intentItems)}
										artifact={artifactById.get(decision.artifactId)}
										conversation={review.conversation}
										expanded={expanded === decision.id}
										onToggle={(): void =>
											setExpanded(expanded === decision.id ? null : decision.id)
										}
									/>
								))}
							</div>
						</>
					)}
				</main>
				<RightRail
					review={review}
					needsAttention={needsAttention}
					progress={progress}
					intentMet={intentMet}
					intentFilter={intentFilter}
					onIntentFilter={(id): void => setIntentFilter(intentFilter === id ? null : id)}
				/>
			</div>
		</div>
	);
}

// ── Sticky top bar — orientation + the 5 verdict buttons ─────────────────────

function TopBar({
	review,
	progress,
}: {
	review: ReviewFixture;
	progress: { reviewed: number; total: number };
}): JSX.Element {
	const resolved = review.standing === "resolved";
	return (
		<header className="shrink-0 flex items-center justify-between gap-[18px] px-[24px] py-[12px] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] border-b border-[var(--border-subtle)]">
			<div className="flex flex-col gap-[6px] min-w-0">
				<div className="flex items-center gap-[9px] min-w-0">
					<span className="text-[17px] font-[600] text-[var(--text-primary)] truncate">
						{review.workIdentity}
					</span>
					{resolved ? (
						<StatusChip status="done" label="Changes requested · Robin · 2:41 PM" />
					) : (
						<StatusChip status="blocked" label="Awaiting verdict · Blocking" />
					)}
				</div>
				<div className="flex items-center gap-[9px] text-[12px] text-[var(--text-tertiary)] flex-wrap">
					<span className="inline-flex items-center gap-[6px]">
						<Avatar initials={review.author.initials} size="sm" agent />
						<span className="text-[var(--text-secondary)] font-[500]">{review.author.name}</span>
						<span aria-hidden="true">→</span>
						<Avatar initials={review.reviewer.initials} size="sm" />
						<span className="text-[var(--text-secondary)] font-[500]">{review.reviewer.name}</span>
					</span>
					<span aria-hidden="true">·</span>
					<span>{review.autonomyContext}</span>
					<span aria-hidden="true">·</span>
					<span>{review.producedAgo}</span>
					<span aria-hidden="true">·</span>
					<ArtifactCostChip cost={review.cost} variant="compact" />
					<span aria-hidden="true">·</span>
					<span>
						Reviewed {progress.reviewed}/{progress.total}
					</span>
				</div>
			</div>
			<div className="shrink-0 flex flex-col items-end gap-[6px]">
				<div className="flex items-center gap-[6px]">
					<Button variant="primary">
						Approve <Kbd>A</Kbd>
					</Button>
					<Button variant="secondary">
						Approve w/ comments <Kbd>C</Kbd>
					</Button>
					<Button variant="ghost">
						Request changes <Kbd>R</Kbd>
					</Button>
					<Button variant="ghost">
						Edit <Kbd>E</Kbd>
					</Button>
					<Button variant="destructive">
						Reject <Kbd>X</Kbd>
					</Button>
				</div>
				<span className="text-[11px] text-[var(--status-error)] font-[500]">
					Blocking · 3 unresolved
				</span>
			</div>
		</header>
	);
}

function Kbd({ children }: { children: string }): JSX.Element {
	return (
		<span className="inline-flex items-center justify-center min-w-[16px] px-[3px] rounded-[var(--r-subtle)] bg-[color-mix(in_oklab,var(--text-on-accent)_22%,transparent)] text-[10px] font-mono leading-[1.4]">
			{children}
		</span>
	);
}

// ── Ledger header — count + segmented sort + intent meter ────────────────────

function LedgerHeader({
	count,
	sort,
	onSort,
	intentMet,
	intentTotal,
}: {
	count: number;
	sort: SortMode;
	onSort: (s: SortMode) => void;
	intentMet: number;
	intentTotal: number;
}): JSX.Element {
	const segments: ReadonlyArray<{ id: SortMode; label: string }> = [
		{ id: "confidence", label: "Confidence ▲" },
		{ id: "order", label: "Order" },
		{ id: "risk", label: "Risk only" },
	];
	return (
		<div className="flex items-center justify-between gap-[18px] flex-wrap">
			<div className="flex items-center gap-[12px]">
				<h2 className="text-[15px] font-[600] text-[var(--text-primary)]">Reasoning</h2>
				<span className="text-[13px] text-[var(--text-tertiary)] font-mono [font-variant-numeric:tabular-nums]">
					{count} decisions
				</span>
			</div>
			<div className="flex items-center gap-[18px]">
				<div
					role="tablist"
					aria-label="Sort decisions"
					className="inline-flex items-center gap-[3px] p-[3px] rounded-[var(--r-pill)] bg-[var(--surface-container)]"
				>
					{segments.map((seg) => {
						const active = sort === seg.id;
						return (
							<button
								key={seg.id}
								type="button"
								role="tab"
								aria-selected={active}
								onClick={(): void => onSort(seg.id)}
								className={`px-[12px] py-[6px] rounded-[var(--r-pill)] text-[12px] font-[500] transition-colors duration-[var(--motion-fast)] ${
									active
										? "bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-[var(--shadow-subtle)]"
										: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
								}`}
							>
								{seg.label}
							</button>
						);
					})}
				</div>
				<span className="text-[12px] text-[var(--text-secondary)] font-[500] [font-variant-numeric:tabular-nums]">
					{intentMet} of {intentTotal} intent items met
				</span>
			</div>
		</div>
	);
}

// Amber RISK pill — Tag has no amber kind, so this matches the --accent-secondary
// band the risk decision's confidence meter reads at.
function RiskTag(): JSX.Element {
	return (
		<span className="inline-flex items-center gap-[4px] px-[8px] py-[2px] rounded-[var(--r-pill)] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] bg-[color-mix(in_oklab,var(--accent-secondary)_16%,transparent)] text-[var(--accent-secondary)]">
			Risk
		</span>
	);
}

// ── A single ledger row — one agent decision ─────────────────────────────────

function LedgerRow({
	decision,
	intent,
	artifact,
	conversation,
	expanded,
	onToggle,
}: {
	decision: RationaleDecision;
	intent: IntentItem | undefined;
	artifact: SubjectArtifact | undefined;
	conversation: ReadonlyArray<ReviewComment>;
	expanded: boolean;
	onToggle: () => void;
}): JSX.Element {
	const band = bandFor(decision.confidence);
	// A decision pointing at an unaddressed intent item (or the r5 gap decision)
	// leaves the intent UNADDRESSED — show the red chip.
	const leavesGap = (intent !== undefined && !intent.addressed) || decision.id === "r5";

	return (
		<article
			className={`group rounded-[var(--r-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] border border-[var(--border-subtle)] transition-[transform,box-shadow] duration-[var(--motion-default)] hover:shadow-[var(--shadow-default)] hover:-translate-y-[2px] ${
				decision.risk ? "border-[var(--accent-secondary)]" : ""
			}`}
			style={decision.risk ? { background: "var(--accent-secondary-dim)" } : undefined}
		>
			<div className="flex items-start gap-[18px] p-[18px]">
				{/* Confidence meter */}
				<div className="shrink-0 w-[72px] flex flex-col gap-[6px]">
					<span
						className="text-[20px] font-[700] leading-[1] [font-variant-numeric:tabular-nums]"
						style={{ color: band.text }}
					>
						{decision.confidence}%
					</span>
					<Progress value={decision.confidence} variant={band.fill} />
					<span
						className="text-[10px] uppercase tracking-[var(--tracking-caps-sm)] font-[600]"
						style={{ color: band.text }}
					>
						{band.label}
					</span>
				</div>

				{/* Body */}
				<button
					type="button"
					onClick={onToggle}
					className="flex-1 min-w-0 text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)] rounded-[var(--r-subtle)]"
				>
					<div className="flex items-center gap-[9px] flex-wrap mb-[6px]">
						<span className="text-[15px] font-[600] text-[var(--text-primary)] leading-[1.4]">
							{decision.decision}
						</span>
						{decision.risk ? <RiskTag /> : null}
					</div>
					{decision.alternativesDiscarded.map((alt) => (
						<p key={alt} className="text-[13px] text-[var(--text-tertiary)] leading-[1.6] mb-[3px]">
							<span className="text-[var(--text-secondary)] font-[500]">instead of: </span>
							{alt}
						</p>
					))}
					<div className="flex items-center gap-[6px] flex-wrap mt-[9px]">
						{intent ? (
							leavesGap ? (
								<Tag label={`leaves UNADDRESSED: ${intent.text}`} kind="failure" />
							) : (
								<Tag label={`serves: ${intent.text}`} kind="decision" />
							)
						) : leavesGap ? (
							<Tag label="leaves UNADDRESSED: RefundProcessed event" kind="failure" />
						) : null}
						<span className="inline-flex items-center gap-[6px] px-[8px] py-[2px] rounded-[var(--r-pill)] bg-[var(--surface-container)] text-[11px] font-mono text-[var(--text-secondary)]">
							{artifact ? <ArtifactKindBadge kind={artifact.kind} /> : null}
							{decision.anchor}
						</span>
						<span className="text-[11px] text-[var(--accent-primary)] font-[500] ml-auto">
							{expanded ? "Hide evidence ↑" : "Show evidence ↓"}
						</span>
					</div>
				</button>
			</div>

			{expanded ? (
				<Evidence decision={decision} artifact={artifact} conversation={conversation} />
			) : null}
		</article>
	);
}

// ── Evidence drawer — real renderer + anchored comment thread ────────────────

function Evidence({
	decision,
	artifact,
	conversation,
}: {
	decision: RationaleDecision;
	artifact: SubjectArtifact | undefined;
	conversation: ReadonlyArray<ReviewComment>;
}): JSX.Element {
	const anchored = conversation.filter(
		(c) => c.artifactId === decision.artifactId && c.anchor === decision.anchor,
	);

	const preview = artifact?.code ?? artifact?.text ?? artifact?.data ?? null;
	const kind = artifact?.kind ?? "text";
	const Renderer = getRenderer(kind);

	return (
		<div className="border-t border-[var(--border-subtle)] px-[18px] py-[18px] bg-[var(--surface-page)] rounded-b-[var(--r-default)] flex flex-col gap-[12px]">
			<div className="text-[11px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)] font-[600]">
				Evidence · {decision.anchor}
			</div>
			<Renderer preview={preview} kind={kind} />

			{anchored.length > 0 ? (
				<div className="flex flex-col gap-[6px] mt-[6px]">
					<div className="text-[11px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)] font-[600]">
						Anchored comments
					</div>
					<ul className="flex flex-col rounded-[var(--r-default)] bg-[var(--surface-elevated)] border border-[var(--border-subtle)] py-[6px]">
						{anchored.map((comment) => (
							<CommentThread key={comment.id} comment={comment} anchor={decision.anchor} />
						))}
					</ul>
					<Composer threadId="rev-thread" onSubmit={async (): Promise<void> => undefined} />
				</div>
			) : null}
		</div>
	);
}

function CommentThread({
	comment,
	anchor,
}: {
	comment: ReviewComment;
	anchor: string;
}): JSX.Element {
	return (
		<>
			<CommentRow
				message={toMessage(comment)}
				sender={{
					id: comment.author.id,
					name: comment.author.name,
					isAgent: comment.author.kind === "agent",
				}}
				showSenderHeader
				inlineAnchor={anchor}
			/>
			{(comment.replies ?? []).map((reply) => (
				<CommentRow
					key={reply.id}
					message={toMessage(reply)}
					sender={{
						id: reply.author.id,
						name: reply.author.name,
						isAgent: reply.author.kind === "agent",
					}}
					showSenderHeader
				/>
			))}
		</>
	);
}

// ── Right rail — intent + needs-attention + subject artifacts ────────────────

function RightRail({
	review,
	needsAttention,
	progress,
	intentMet,
	intentFilter,
	onIntentFilter,
}: {
	review: ReviewFixture;
	needsAttention: ReadonlyArray<NeedsAttentionItem>;
	progress: { reviewed: number; total: number };
	intentMet: number;
	intentFilter: string | null;
	onIntentFilter: (id: string) => void;
}): JSX.Element {
	return (
		<aside className="shrink-0 w-[300px] overflow-y-auto bg-[var(--surface-container)] border-l border-[var(--border-subtle)] px-[18px] py-[18px] flex flex-col gap-[24px]">
			{/* Intent */}
			<section className="flex flex-col gap-[9px]">
				<RailHeading>Intent</RailHeading>
				<p className="text-[13px] text-[var(--text-secondary)] leading-[1.6]">
					{review.intentStatement}
				</p>
				<Progress value={Math.round((intentMet / review.intentItems.length) * 100)} label={`${intentMet} of ${review.intentItems.length} met`} />
				<ul className="flex flex-col gap-[3px] mt-[3px]">
					{review.intentItems.map((item) => {
						const active = intentFilter === item.id;
						return (
							<li key={item.id}>
								<button
									type="button"
									onClick={(): void => onIntentFilter(item.id)}
									className={`w-full text-left flex items-start gap-[9px] px-[9px] py-[6px] rounded-[var(--r-subtle)] transition-colors duration-[var(--motion-fast)] ${
										active
											? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]"
											: "hover:bg-[var(--surface-elevated)]"
									}`}
								>
									<span
										aria-hidden="true"
										className="mt-[3px] text-[12px] font-[700] shrink-0"
										style={{
											color: item.addressed
												? "var(--status-success)"
												: "var(--status-error)",
										}}
									>
										{item.addressed ? "✓" : "✗"}
									</span>
									<span className="flex flex-col gap-[3px] min-w-0">
										<span className="text-[13px] text-[var(--text-primary)] leading-[1.5]">
											{item.text}
										</span>
										{!item.addressed ? (
											<span className="text-[10px] uppercase tracking-[var(--tracking-caps-sm)] font-[600] text-[var(--status-error)]">
												Not addressed
											</span>
										) : null}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</section>

			{/* Needs attention */}
			<section className="flex flex-col gap-[9px]">
				<RailHeading>Needs attention · {needsAttention.length}</RailHeading>
				<ul className="flex flex-col gap-[6px]">
					{needsAttention.map((item) => (
						<li key={item.id}>
							<button
								type="button"
								onClick={(): void => undefined}
								className="w-full text-left flex flex-col gap-[3px] px-[12px] py-[9px] rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] border border-[var(--border-subtle)] hover:-translate-y-[1px] transition-transform duration-[var(--motion-fast)]"
							>
								<span className="flex items-center gap-[6px]">
									<span
										className="w-[6px] h-[6px] rounded-full shrink-0"
										style={{ background: needsAttentionColor(item.kind) }}
									/>
									<span className="text-[13px] font-[500] text-[var(--text-primary)] leading-[1.4]">
										{item.label}
									</span>
								</span>
								<span className="text-[12px] text-[var(--text-tertiary)] leading-[1.5] pl-[12px]">
									{item.detail}
								</span>
							</button>
						</li>
					))}
				</ul>
			</section>

			{/* Subject */}
			<section className="flex flex-col gap-[9px]">
				<RailHeading>
					Subject · {review.artifacts.length} artifacts · {progress.reviewed} reviewed
				</RailHeading>
				<ul className="flex flex-col gap-[3px]">
					{review.artifacts.map((artifact) => (
						<li key={artifact.id}>
							<button
								type="button"
								onClick={(): void => undefined}
								className="w-full text-left flex items-start gap-[9px] px-[9px] py-[9px] rounded-[var(--r-subtle)] hover:bg-[var(--surface-elevated)] transition-colors duration-[var(--motion-fast)]"
							>
								<span
									className="mt-[6px] w-[6px] h-[6px] rounded-full shrink-0"
									style={{ background: reviewedColor(artifact.reviewed) }}
								/>
								<span className="flex flex-col gap-[3px] min-w-0">
									<span className="flex items-center gap-[6px]">
										<ArtifactKindBadge kind={artifact.kind} />
									</span>
									<span className="text-[13px] text-[var(--text-primary)] truncate font-[500]">
										{artifact.path}
									</span>
									<span className="text-[12px] text-[var(--text-tertiary)] leading-[1.5]">
										{artifact.resultSummary}
									</span>
								</span>
							</button>
						</li>
					))}
				</ul>
			</section>
		</aside>
	);
}

function RailHeading({ children }: { children: React.ReactNode }): JSX.Element {
	return (
		<h3 className="text-[11px] uppercase tracking-[var(--tracking-caps)] font-[600] text-[var(--text-tertiary)]">
			{children}
		</h3>
	);
}

function needsAttentionColor(kind: NeedsAttentionItem["kind"]): string {
	switch (kind) {
		case "gap":
			return "var(--status-error)";
		case "risk":
			return "var(--accent-secondary)";
		case "blocking-comment":
			return "var(--status-warning)";
	}
}

function reviewedColor(state: SubjectArtifact["reviewed"]): string {
	switch (state) {
		case "reviewed":
			return "var(--status-success)";
		case "flagged":
			return "var(--status-error)";
		case "unreviewed":
			return "var(--text-tertiary)";
	}
}

// ── No-rationale fallback — human-authored work ──────────────────────────────

function NoRationalePane({
	artifacts,
}: {
	artifacts: ReadonlyArray<SubjectArtifact>;
}): JSX.Element {
	return (
		<div className="flex flex-col gap-[18px]">
			<EmptyState
				title="No rationale — this work was human-authored"
				description="There's no structured reasoning to read. Review the artifacts directly below."
			/>
			<ul className="flex flex-col gap-[12px]">
				{artifacts.map((artifact) => {
					const preview = artifact.code ?? artifact.text ?? artifact.data ?? null;
					const Renderer = getRenderer(artifact.kind);
					return (
						<li
							key={artifact.id}
							className="rounded-[var(--r-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] border border-[var(--border-subtle)] p-[18px] flex flex-col gap-[9px]"
						>
							<div className="flex items-center gap-[9px]">
								<ArtifactKindBadge kind={artifact.kind} />
								<span className="text-[13px] font-[600] text-[var(--text-primary)]">
									{artifact.path}
								</span>
							</div>
							{preview ? <Renderer preview={preview} kind={artifact.kind} /> : (
								<p className="text-[13px] text-[var(--text-secondary)]">{artifact.resultSummary}</p>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
