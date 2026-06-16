// AL1 — Review experience design exploration, Variant B: The Examination Bench.
//
// A three-pane workbench for the power reviewer going DEEP across a multi-artifact
// Subject: left Subject navigator (intent + per-artifact reviewed tracking), center
// examination surface with the SIGNATURE anchored-comment gutter on the code diff,
// right Conversation/Rationale rail carrying the verdict.
//
// Presentational only — story-local. `useState` for active artifact, selected anchor,
// Thread/Rationale tab. Callbacks no-op. Renders real DS renderers for data/text; the
// gutter is hand-rendered around the same diff token classes CodeRenderer uses so the
// gutter column + per-line dots are under our control.

import {
	ArtifactCostChip,
	ArtifactKindBadge,
	Avatar,
	AvatarGroup,
	Button,
	Checkbox,
	ErrorState,
	getRenderer,
	Progress,
	RowDot,
	SkeletonList,
	StatusChip,
	Tag,
} from "@hyperidle/design-system";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import {
	type ArtifactReviewedState,
	NEEDS_ATTENTION,
	type NeedsAttentionItem,
	REVIEW_FIXTURE,
	REVIEW_PROGRESS,
	type ReviewComment,
	type ReviewFixture,
	type SubjectArtifact,
} from "./review-fixtures.js";

// ── Verdict vocabulary (the universal verdict set) ───────────────────────────

interface Verdict {
	readonly id: string;
	readonly label: string;
	readonly kbd: string;
	readonly variant: "primary" | "secondary" | "ghost" | "destructive" | "amber";
}

// The 5 BINDING verdicts (verdict-actions.md). Non-binding ops (snooze, escalate)
// live elsewhere and never replace the binding five.
const VERDICTS: ReadonlyArray<Verdict> = [
	{ id: "approve", label: "Approve", kbd: "A", variant: "primary" },
	{ id: "approve-with-comments", label: "Approve w/ comments", kbd: "C", variant: "secondary" },
	{ id: "request-changes", label: "Request changes", kbd: "R", variant: "amber" },
	{ id: "edit", label: "Edit", kbd: "E", variant: "ghost" },
	{ id: "reject", label: "Reject", kbd: "X", variant: "destructive" },
];

// ── Diff line model (hand-rendered gutter) ───────────────────────────────────

interface GutterLine {
	readonly lineNo: number;
	readonly kind: "add" | "del" | "ctx";
	readonly text: string;
	/** anchor key (path:line) when a comment/risk pins to this line. */
	readonly anchor?: string;
	/** an open anchored comment lives here → forest dot. */
	readonly hasComment?: boolean;
	/** the risk-flagged line (:54) → amber dot. */
	readonly risk?: boolean;
}

const LINE_BG: Record<GutterLine["kind"], string> = {
	add: "bg-[color-mix(in_oklab,var(--status-success)_10%,transparent)]",
	del: "bg-[color-mix(in_oklab,var(--status-error)_10%,transparent)]",
	ctx: "",
};

const LINE_PREFIX: Record<GutterLine["kind"], string> = { add: "+", del: "-", ctx: " " };

/**
 * Map the fixture's code hunks into numbered gutter lines. The first hunk starts
 * at :1, the second at :52 (its header `@@ -41,6 +52,9 @@`). Anchors at :54 carry
 * the open Robin comment + the 45%-risk flag → that line gets the amber tell.
 */
function buildGutterLines(fixture: ReviewFixture): ReadonlyArray<GutterLine> {
	const code = fixture.artifacts[0]?.code;
	if (!code) return [];
	const out: GutterLine[] = [];
	const starts = [1, 52];
	code.hunks.forEach((hunk, hi) => {
		let n = starts[hi] ?? out.length + 1;
		for (const line of hunk.lines) {
			const lineNo = n;
			const anchor = `refund-webhook.ts:${lineNo}`;
			out.push({
				lineNo,
				kind: line.kind,
				text: line.text,
				anchor,
				hasComment: lineNo === 54,
				risk: lineNo === 54,
			});
			// context + additions advance the new-file counter; deletions do not.
			if (line.kind !== "del") n += 1;
		}
	});
	return out;
}

// ── Left rail: Subject navigator ─────────────────────────────────────────────

const REVIEWED_TONE: Record<ArtifactReviewedState, "success" | "warning" | "neutral"> = {
	reviewed: "success",
	flagged: "warning",
	unreviewed: "neutral",
};

function ArtifactRow({
	artifact,
	active,
	hasAttention,
	onSelect,
}: {
	artifact: SubjectArtifact;
	active: boolean;
	hasAttention: NeedsAttentionItem["kind"] | null;
	onSelect: () => void;
}): JSX.Element {
	const fileName = artifact.path.split("/").pop() ?? artifact.path;
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-current={active ? "true" : undefined}
			className={[
				"w-full flex items-center gap-[9px] px-[9px] py-[9px] rounded-[var(--r-subtle)] text-left",
				"transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
				"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]",
				active
					? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]"
					: "hover:bg-[var(--surface-elevated)]",
			].join(" ")}
		>
			<span className="shrink-0">
				<ArtifactKindBadge kind={artifact.kind} />
			</span>
			<span className="flex-1 min-w-0 font-mono text-[12px] text-[var(--text-primary)] truncate">
				{fileName}
			</span>
			{hasAttention ? (
				<RowDot
					tone={hasAttention === "gap" ? "error" : "warning"}
					label={`${hasAttention} on this artifact`}
				/>
			) : null}
			<span
				aria-hidden="true"
				className={[
					"shrink-0 w-[16px] h-[16px] rounded-[6px] border-[1.5px] flex items-center justify-center",
					artifact.reviewed === "reviewed"
						? "bg-[var(--accent-primary)] border-[var(--accent-primary)]"
						: "bg-[var(--surface-page)] border-[var(--border-default)]",
				].join(" ")}
			>
				{artifact.reviewed === "reviewed" ? (
					<span className="block h-[8px] w-[5px] border-b-[2px] border-r-[2px] border-white rotate-45 translate-y-[-1px]" />
				) : null}
			</span>
		</button>
	);
}

function SubjectNavigator({
	fixture,
	activeId,
	onSelectArtifact,
	attentionByArtifact,
}: {
	fixture: ReviewFixture;
	activeId: string;
	onSelectArtifact: (id: string) => void;
	attentionByArtifact: ReadonlyMap<string, NeedsAttentionItem["kind"]>;
}): JSX.Element {
	const metCount = fixture.intentItems.filter((i) => i.addressed).length;
	return (
		<aside
			className="w-[240px] shrink-0 h-full flex flex-col bg-[var(--surface-container)] border-r border-[var(--border-subtle)] overflow-hidden"
			aria-label="Subject navigator"
		>
			<div className="flex-1 overflow-y-auto px-[12px] py-[18px] flex flex-col gap-[18px]">
				{/* Orientation mini */}
				<div className="flex flex-col gap-[9px]">
					<h2 className="text-[15px] font-[600] text-[var(--text-primary)] leading-[1.3] truncate">
						{fixture.workIdentity}
					</h2>
					<div className="flex items-center gap-[9px]">
						<AvatarGroup small>
							<Avatar initials={fixture.author.initials} agent />
							<Avatar initials={fixture.reviewer.initials} />
						</AvatarGroup>
						<StatusChip status="blocked" label="Awaiting" />
					</div>
					<ArtifactCostChip cost={fixture.cost} variant="compact" />
				</div>

				{/* Intent mini-checklist */}
				<div className="flex flex-col gap-[6px]">
					<div className="flex items-center justify-between">
						<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
							Intent
						</span>
						<span className="text-[11px] font-mono text-[var(--text-secondary)] [font-variant-numeric:tabular-nums]">
							{metCount}/{fixture.intentItems.length} met
						</span>
					</div>
					<ul className="flex flex-col gap-[3px]">
						{fixture.intentItems.map((item) => (
							<li key={item.id}>
								<button
									type="button"
									onClick={() =>
										item.evidenceArtifactId && onSelectArtifact(item.evidenceArtifactId)
									}
									className="w-full flex items-start gap-[6px] px-[6px] py-[3px] rounded-[var(--r-subtle)] text-left hover:bg-[var(--surface-elevated)] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]"
								>
									<span
										aria-hidden="true"
										className={`shrink-0 mt-[2px] text-[12px] font-[600] ${item.addressed ? "text-[var(--status-success)]" : "text-[var(--status-error)]"}`}
									>
										{item.addressed ? "✓" : "✗"}
									</span>
									<span
										className={`text-[12px] leading-[1.4] ${item.addressed ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}
									>
										{item.text}
									</span>
								</button>
							</li>
						))}
					</ul>
				</div>

				{/* Artifacts list */}
				<div className="flex flex-col gap-[6px]">
					<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						Artifacts · {fixture.artifacts.length}
					</span>
					<div className="flex flex-col gap-[3px]">
						{fixture.artifacts.map((artifact) => (
							<ArtifactRow
								key={artifact.id}
								artifact={artifact}
								active={artifact.id === activeId}
								hasAttention={attentionByArtifact.get(artifact.id) ?? null}
								onSelect={() => onSelectArtifact(artifact.id)}
							/>
						))}
					</div>
				</div>

				{/* Needs attention */}
				<div className="flex flex-col gap-[6px]">
					<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						Needs attention · {NEEDS_ATTENTION.length}
					</span>
					<div className="flex flex-col gap-[3px]">
						{NEEDS_ATTENTION.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => item.artifactId && onSelectArtifact(item.artifactId)}
								className="w-full flex items-start gap-[6px] px-[6px] py-[6px] rounded-[var(--r-subtle)] text-left hover:bg-[var(--surface-elevated)] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]"
							>
								<span className="shrink-0 mt-[5px]">
									<RowDot tone={item.kind === "gap" ? "error" : "warning"} label={item.kind} />
								</span>
								<span className="flex flex-col gap-[2px] min-w-0">
									<span className="text-[12px] font-[500] text-[var(--text-primary)] leading-[1.35]">
										{item.label}
									</span>
									{item.anchor ? (
										<span className="font-mono text-[10px] text-[var(--text-tertiary)] truncate">
											{item.anchor}
										</span>
									) : null}
								</span>
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Progress — bottom-pinned */}
			<div className="shrink-0 border-t border-[var(--border-subtle)] px-[12px] py-[12px]">
				<Progress
					value={Math.round((REVIEW_PROGRESS.reviewed / REVIEW_PROGRESS.total) * 100)}
					label={`${REVIEW_PROGRESS.reviewed} of ${REVIEW_PROGRESS.total} reviewed`}
				/>
			</div>
		</aside>
	);
}

// ── Center: examination surface ──────────────────────────────────────────────

function CodeGutter({
	lines,
	selectedAnchor,
	onSelectAnchor,
}: {
	lines: ReadonlyArray<GutterLine>;
	selectedAnchor: string | null;
	onSelectAnchor: (anchor: string) => void;
}): JSX.Element {
	return (
		<div className="rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-container)] overflow-hidden">
			<pre className="text-[12px] font-mono leading-[1.5] m-0 overflow-x-auto">
				{lines.map((line) => {
					const isSelected = !!line.anchor && line.anchor === selectedAnchor;
					return (
						<div
							key={`${line.lineNo}-${line.kind}-${line.text}`}
							className={[
								"group flex items-stretch",
								LINE_BG[line.kind],
								isSelected ? "ring-1 ring-inset ring-[var(--accent-primary)]" : "",
							].join(" ")}
						>
							{/* line-number + comment-dot gutter column */}
							<button
								type="button"
								onClick={() => line.anchor && onSelectAnchor(line.anchor)}
								title={
									line.hasComment
										? `Comment on :${line.lineNo}`
										: `Comment on line :${line.lineNo}`
								}
								className="shrink-0 w-[52px] flex items-center justify-end gap-[6px] pr-[6px] select-none border-r border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]"
							>
								{/* dot rail: comment dot (forest), risk dot (amber), or hover + */}
								<span className="w-[8px] flex items-center justify-center">
									{line.risk ? (
										<span className="block w-[6px] h-[6px] rounded-full bg-[var(--accent-secondary)] transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)]" />
									) : line.hasComment ? (
										<span className="block w-[6px] h-[6px] rounded-full bg-[var(--accent-primary)] transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)]" />
									) : (
										<span className="hidden group-hover:block text-[var(--accent-primary)] leading-none text-[12px]">
											+
										</span>
									)}
								</span>
								<span className="[font-variant-numeric:tabular-nums]">{line.lineNo}</span>
							</button>
							{/* code cell */}
							<span className="flex-1 min-w-0 flex px-[9px] py-[3px]">
								<span className="select-none text-[var(--text-tertiary)] mr-[9px] w-[6px]">
									{LINE_PREFIX[line.kind]}
								</span>
								<code className="whitespace-pre text-[var(--text-primary)]">
									{line.text || " "}
								</code>
							</span>
						</div>
					);
				})}
			</pre>
		</div>
	);
}

function ActionCard({
	action,
}: {
	action: NonNullable<SubjectArtifact["action"]>;
}): JSX.Element {
	return (
		<div className="rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] p-[18px] flex flex-col gap-[12px] max-w-[560px]">
			<p className="text-[15px] text-[var(--text-primary)] leading-[1.6]">{action.summary}</p>
			<div className="flex flex-col gap-[6px]">
				<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--status-warning)]">
					Consequence
				</span>
				<p className="text-[13px] text-[var(--text-secondary)] leading-[1.6]">
					{action.consequence}
				</p>
			</div>
			<div className="flex flex-col gap-[6px]">
				<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Undo
				</span>
				<p className="text-[13px] text-[var(--text-secondary)] leading-[1.6]">{action.undo}</p>
			</div>
		</div>
	);
}

function ExaminationSurface({
	fixture,
	artifact,
	gutterLines,
	selectedAnchor,
	onSelectAnchor,
	onPrev,
	onNext,
}: {
	fixture: ReviewFixture;
	artifact: SubjectArtifact;
	gutterLines: ReadonlyArray<GutterLine>;
	selectedAnchor: string | null;
	onSelectAnchor: (anchor: string) => void;
	onPrev: () => void;
	onNext: () => void;
}): JSX.Element {
	const Renderer = getRenderer(artifact.kind);
	return (
		<section
			className="flex-1 min-w-0 h-full flex flex-col bg-[var(--surface-page)] overflow-hidden"
			aria-label="Examination surface"
		>
			{/* Header strip */}
			<header className="shrink-0 flex items-center gap-[12px] px-[24px] py-[12px] border-b border-[var(--border-subtle)]">
				<ArtifactKindBadge kind={artifact.kind} />
				<div className="flex-1 min-w-0 flex flex-col gap-[2px]">
					<span className="font-mono text-[13px] text-[var(--text-primary)] truncate">
						{artifact.path}
					</span>
					<span className="text-[12px] text-[var(--text-secondary)] truncate">
						{artifact.resultSummary}
					</span>
				</div>
				<Checkbox
					label="Mark reviewed"
					checked={artifact.reviewed === "reviewed"}
					onChange={() => {}}
				/>
				<div className="flex items-center gap-[3px]">
					<Button variant="ghost" size="sm" onClick={onPrev} aria-label="Previous artifact">
						‹
					</Button>
					<Button variant="ghost" size="sm" onClick={onNext} aria-label="Next artifact">
						›
					</Button>
				</div>
			</header>

			{/* Body */}
			<div className="flex-1 overflow-y-auto px-[24px] py-[18px]">
				{artifact.kind === "code" ? (
					<CodeGutter
						lines={gutterLines}
						selectedAnchor={selectedAnchor}
						onSelectAnchor={onSelectAnchor}
					/>
				) : artifact.kind === "action" && artifact.action ? (
					<ActionCard action={artifact.action} />
				) : (
					<Renderer
						preview={artifact.data ?? artifact.text ?? null}
						kind={artifact.kind}
					/>
				)}
			</div>
		</section>
	);
}

// ── Right rail: conversation + rationale + verdict ───────────────────────────

function VerdictBlock({ fixture }: { fixture: ReviewFixture }): JSX.Element {
	return (
		<div className="shrink-0 border-b border-[var(--border-subtle)] px-[18px] py-[12px] flex flex-col gap-[9px] bg-[var(--surface-container)]">
			<div className="flex items-center justify-between">
				<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Verdict
				</span>
				<span className="text-[11px] font-[600] text-[var(--status-error)]">
					Blocking · 3 unresolved
				</span>
			</div>
			<p className="text-[12px] text-[var(--text-secondary)] leading-[1.5]">
				{fixture.autonomyContext}
			</p>
			<div className="flex flex-wrap gap-[6px]">
				{VERDICTS.map((v) => (
					<Button key={v.id} variant={v.variant} size="sm" onClick={() => {}}>
						{v.label}
						<span className="ml-[3px] font-mono text-[10px] opacity-70">{v.kbd}</span>
					</Button>
				))}
			</div>
		</div>
	);
}

function CommentBlock({ comment }: { comment: ReviewComment }): JSX.Element {
	const isAgent = comment.author.kind === "agent";
	return (
		<div className="flex flex-col gap-[6px]">
			{comment.anchor ? (
				<div className="text-[10px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Inline on{" "}
					<span className="font-mono text-[var(--accent-secondary)]">{comment.anchor}</span>
				</div>
			) : null}
			<div className="flex items-start gap-[9px]">
				<Avatar initials={comment.author.initials} size="sm" agent={isAgent} />
				<div className="flex flex-col gap-[3px] min-w-0 flex-1">
					<div className="flex items-baseline gap-[6px] flex-wrap">
						<span className="text-[13px] font-[600] text-[var(--text-primary)]">
							{comment.author.name}
						</span>
						{isAgent ? <Tag label="Agent" /> : null}
						{comment.blocking ? <StatusChip status="blocked" label="Blocking" /> : null}
						{comment.resolved ? <StatusChip status="done" label="Resolved" /> : null}
						<span className="text-[11px] text-[var(--text-tertiary)]">{comment.timestamp}</span>
					</div>
					<p className="text-[13px] text-[var(--text-secondary)] leading-[1.6]">{comment.body}</p>
				</div>
			</div>
			{comment.replies?.map((reply) => (
				<div key={reply.id} className="ml-[33px] pl-[9px] border-l border-[var(--border-subtle)]">
					<CommentBlock comment={reply} />
				</div>
			))}
		</div>
	);
}

function ConfidenceMeter({ value }: { value: number }): JSX.Element {
	const tone =
		value < 50
			? "var(--status-error)"
			: value < 75
				? "var(--status-warning)"
				: "var(--status-success)";
	return (
		<div className="flex items-center gap-[6px]">
			<div className="h-[6px] w-[64px] rounded-full bg-[var(--surface-page)] overflow-hidden">
				<div
					className="h-full rounded-full"
					style={{ width: `${value}%`, background: tone }}
				/>
			</div>
			<span className="font-mono text-[11px] text-[var(--text-secondary)] [font-variant-numeric:tabular-nums]">
				{value}%
			</span>
		</div>
	);
}

function ConversationRail({
	fixture,
	activeArtifactId,
	selectedAnchor,
	tab,
	onTabChange,
}: {
	fixture: ReviewFixture;
	activeArtifactId: string;
	selectedAnchor: string | null;
	tab: "thread" | "rationale";
	onTabChange: (tab: "thread" | "rationale") => void;
}): JSX.Element {
	const anchored = fixture.conversation.filter((c) => c.artifactId === activeArtifactId);
	const general = fixture.conversation.filter((c) => !c.artifactId);
	const rationale = fixture.rationale.filter((r) => r.artifactId === activeArtifactId);
	const composerLabel = selectedAnchor
		? `Commenting on ${selectedAnchor}`
		: "Comment on this Subject";

	return (
		<aside
			className="w-[320px] shrink-0 h-full flex flex-col bg-[var(--surface-container)] border-l border-[var(--border-subtle)] overflow-hidden"
			aria-label="Conversation and rationale"
		>
			<VerdictBlock fixture={fixture} />

			<div className="shrink-0 px-[18px] py-[9px] border-b border-[var(--border-subtle)]">
				<div
					className="inline-flex items-center bg-[var(--surface-page)] rounded-full p-[3px] gap-[3px]"
					role="tablist"
				>
					{(["thread", "rationale"] as const).map((id) => {
						const isActive = id === tab;
						return (
							<button
								key={id}
								type="button"
								role="tab"
								aria-selected={isActive}
								onClick={() => onTabChange(id)}
								className={[
									"px-[12px] py-[6px] rounded-full text-[13px] capitalize",
									"transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
									"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]",
									isActive
										? "bg-[var(--surface-elevated)] text-[var(--accent-primary)] font-[600] shadow-[var(--shadow-subtle)]"
										: "text-[var(--text-secondary)] font-[500] hover:text-[var(--text-primary)]",
								].join(" ")}
							>
								{id}
							</button>
						);
					})}
				</div>
			</div>

			<div className="flex-1 overflow-y-auto px-[18px] py-[12px] flex flex-col gap-[18px]">
				{tab === "thread" ? (
					<>
						<div className="flex flex-col gap-[12px]">
							<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
								On this artifact
							</span>
							{anchored.length > 0 ? (
								anchored.map((c) => <CommentBlock key={c.id} comment={c} />)
							) : (
								<p className="text-[12px] text-[var(--text-tertiary)] italic">
									No anchored comments yet.
								</p>
							)}
						</div>
						{general.length > 0 ? (
							<div className="flex flex-col gap-[12px] border-t border-[var(--border-subtle)] pt-[12px]">
								<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
									General
								</span>
								{general.map((c) => (
									<CommentBlock key={c.id} comment={c} />
								))}
							</div>
						) : null}
					</>
				) : (
					<div className="flex flex-col gap-[12px]">
						<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
							Decisions on this artifact · {rationale.length}
						</span>
						{rationale.map((r) => (
							<div
								key={r.id}
								className={[
									"rounded-[var(--r-subtle)] border p-[12px] flex flex-col gap-[9px] bg-[var(--surface-elevated)]",
									r.risk ? "border-[var(--status-error)]" : "border-[var(--border-subtle)]",
								].join(" ")}
							>
								<p className="text-[13px] font-[500] text-[var(--text-primary)] leading-[1.5]">
									{r.decision}
								</p>
								{r.alternativesDiscarded.map((alt) => (
									<p key={alt} className="text-[12px] text-[var(--text-tertiary)] leading-[1.5]">
										<span className="text-[var(--text-secondary)]">instead of</span> {alt}
									</p>
								))}
								<div className="flex items-center justify-between gap-[9px]">
									<ConfidenceMeter value={r.confidence} />
									<span className="font-mono text-[10px] text-[var(--text-tertiary)] truncate">
										{r.anchor}
									</span>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Composer — pinned at rail bottom */}
			<div className="shrink-0 border-t border-[var(--border-subtle)] px-[18px] py-[12px] flex flex-col gap-[6px]">
				<span className="text-[11px] text-[var(--text-tertiary)]">{composerLabel}</span>
				<div className="flex items-stretch gap-[9px]">
					<input
						type="text"
						placeholder="Add a comment…"
						className="flex-1 min-w-0 bg-[var(--surface-page)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border-[1.5px] border-[var(--border-default)] rounded-[var(--r-default)] px-[12px] py-[9px] text-[13px] focus:outline-none focus:border-[var(--accent-primary)]"
					/>
					<Button variant="primary" size="sm" onClick={() => {}}>
						Send
					</Button>
				</div>
			</div>
		</aside>
	);
}

// ── Page assembly ────────────────────────────────────────────────────────────

export interface ReviewBenchProps {
	fixture?: ReviewFixture;
	loading?: boolean;
	error?: { title: string; description: string };
	/** initial right-rail tab. */
	initialTab?: "thread" | "rationale";
}

export function ReviewBench({
	fixture = REVIEW_FIXTURE,
	loading = false,
	error,
	initialTab = "thread",
}: ReviewBenchProps): JSX.Element {
	const [activeId, setActiveId] = useState(fixture.artifacts[0]?.id ?? "");
	const [selectedAnchor, setSelectedAnchor] = useState<string | null>("refund-webhook.ts:54");
	const [tab, setTab] = useState<"thread" | "rationale">(initialTab);

	const gutterLines = useMemo(() => buildGutterLines(fixture), [fixture]);
	const attentionByArtifact = useMemo(() => {
		const m = new Map<string, NeedsAttentionItem["kind"]>();
		for (const item of NEEDS_ATTENTION) {
			if (item.artifactId && !m.has(item.artifactId)) m.set(item.artifactId, item.kind);
		}
		return m;
	}, []);

	const activeIndex = fixture.artifacts.findIndex((a) => a.id === activeId);
	const activeArtifact = fixture.artifacts[activeIndex] ?? fixture.artifacts[0];

	const step = (delta: number): void => {
		const next = (activeIndex + delta + fixture.artifacts.length) % fixture.artifacts.length;
		setActiveId(fixture.artifacts[next]?.id ?? activeId);
	};

	if (loading) {
		return (
			<div style={{ height: "100vh", display: "flex" }} className="bg-[var(--surface-page)]">
				<aside className="w-[240px] shrink-0 bg-[var(--surface-container)] border-r border-[var(--border-subtle)] px-[12px] py-[18px]">
					<SkeletonList rows={6} ariaLabel="Loading subject navigator" />
				</aside>
				<section className="flex-1 px-[24px] py-[18px]">
					<SkeletonList rows={8} ariaLabel="Loading examination surface" />
				</section>
				<aside className="w-[320px] shrink-0 bg-[var(--surface-container)] border-l border-[var(--border-subtle)] px-[18px] py-[12px]">
					<SkeletonList rows={5} ariaLabel="Loading conversation rail" />
				</aside>
			</div>
		);
	}

	if (error) {
		return (
			<div style={{ height: "100vh", display: "flex" }}>
				<SubjectNavigator
					fixture={fixture}
					activeId={activeId}
					onSelectArtifact={setActiveId}
					attentionByArtifact={attentionByArtifact}
				/>
				<section className="flex-1 flex items-center justify-center bg-[var(--surface-page)] p-[36px]">
					<ErrorState title={error.title} description={error.description} onRetry={() => {}} />
				</section>
			</div>
		);
	}

	if (!activeArtifact) {
		return (
			<div style={{ height: "100vh", display: "flex" }} className="bg-[var(--surface-page)]" />
		);
	}

	return (
		<div style={{ height: "100vh", display: "flex" }}>
			<SubjectNavigator
				fixture={fixture}
				activeId={activeId}
				onSelectArtifact={setActiveId}
				attentionByArtifact={attentionByArtifact}
			/>
			<ExaminationSurface
				fixture={fixture}
				artifact={activeArtifact}
				gutterLines={gutterLines}
				selectedAnchor={selectedAnchor}
				onSelectAnchor={setSelectedAnchor}
				onPrev={() => step(-1)}
				onNext={() => step(1)}
			/>
			<ConversationRail
				fixture={fixture}
				activeArtifactId={activeArtifact.id}
				selectedAnchor={selectedAnchor}
				tab={tab}
				onTabChange={setTab}
			/>
		</div>
	);
}
