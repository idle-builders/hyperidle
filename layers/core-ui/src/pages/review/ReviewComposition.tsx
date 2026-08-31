import {
	type AnchorRef,
	type VerdictDecision,
	verdictDecisionLabel,
} from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useMemo, useState } from "react";
import { Breadcrumb, Button, Composer, PageHeader, PageScaffold, SplitView } from "../../ds";
import { useUiPreference } from "../../hooks/useUiPreference.js";
import { useViewportBreakpoint } from "../../hooks/useViewportBreakpoint.js";
import { getReviewCanvas } from "./canvas-registry.js";
import { ReviewActionOperation } from "./ReviewActionOperation.js";
import { ReviewCanvasProvider, useReviewAnchors } from "./review-canvas.js";
import type {
	ComposedReviewSubject,
	ReviewComment,
	ReviewCompositionProps,
	ReviewKpi,
	ReviewNeed,
} from "./review-composition.js";
import { type ToolId, ToolLogo } from "./ToolLogo.js";

// ── small presentational atoms ─────────────────────────────────────────────────────

/** quiet-caps section header. */
function SectionHead({ label, count }: { label: string; count?: string }): JSX.Element {
	return (
		<div className="mb-[12px] flex items-baseline gap-[9px]">
			<h3 className="type-label   uppercase  text-[var(--text-tertiary)]">{label}</h3>
			{count ? (
				<span className="type-data   tabular-nums text-[var(--text-tertiary)]">{count}</span>
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

const NEED_TONE: Record<ReviewNeed["kind"], string> = {
	"unhandled-exception": "var(--status-error)",
	"over-authority": "var(--status-error)",
	"blast-radius": "var(--status-warning)",
	"unverified-claim": "var(--status-warning)",
};

/** kind badge — tiny neutral chip. */
const KIND_LABEL: Record<string, string> = {
	outcome_summary: "Outcome",
	field_change_set: "Field change",
	action_operation: "Action",
	rendered_in_context: "Rendered",
	metrics_moved: "Metrics",
	visual_diff: "Visual",
	code_diff: "Code",
	batch: "Batch",
	browser_preview: "Preview",
};

function KindBadge({ kind }: { kind: string }): JSX.Element {
	return (
		<span className="type-label inline-flex items-center rounded-[var(--r-pill)] bg-[var(--surface-container)] px-[6px] py-[3px]   uppercase   text-[var(--text-tertiary)]">
			{KIND_LABEL[kind as keyof typeof KIND_LABEL] ?? kind}
		</span>
	);
}

/** status dot + label — calm. */
function StatusDot({ tone, label }: { tone: string; label: string }): JSX.Element {
	return (
		<span
			data-az16-profile="metadata"
			className="type-metadata inline-flex items-center gap-[6px]   text-[var(--text-secondary)]"
		>
			<span
				aria-hidden="true"
				className="h-[7px] w-[7px] rounded-[var(--r-pill)]"
				style={{ background: tone }}
			/>
			{label}
		</span>
	);
}

function AgentAvatar({ name }: { name: string }): JSX.Element {
	return (
		<span
			data-az16-profile="avatar-initial"
			aria-hidden="true"
			className="type-avatar-initial type-avatar-initial--sm inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[var(--r-pill)] text-white"
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
			data-az16-profile="avatar-initial strong"
			aria-hidden="true"
			className="type-avatar-initial type-avatar-initial--sm border-width-strong inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[var(--r-pill)] border-[var(--border-default)] bg-[var(--surface-container)] text-[var(--text-secondary)]"
			title={name}
		>
			{name.slice(0, 2)}
		</span>
	);
}

// ── L1 frame header ────────────────────────────────────────────────────────────────

interface VerdictProps {
	readonly menuOpen: boolean;
	readonly onToggleMenu: () => void;
	readonly onSubmit: (decision: VerdictDecision) => void;
	readonly resolved?: boolean;
	readonly activeDecision?: VerdictDecision;
}

const OVERFLOW_DECISIONS: VerdictDecision[] = ["approve-with-comments", "edit", "reject"];

function Verdict({
	menuOpen,
	onToggleMenu,
	onSubmit,
	resolved,
	activeDecision,
}: VerdictProps): JSX.Element {
	return (
		<div className="relative flex shrink-0 items-center gap-[6px]">
			<Button
				variant="primary"
				size="sm"
				disabled={resolved}
				onClick={() => onSubmit("approve")}
				aria-pressed={activeDecision === "approve"}
			>
				<CheckGlyph />
				Approve
			</Button>
			<button
				type="button"
				disabled={resolved}
				onClick={() => onSubmit("request-changes")}
				aria-pressed={activeDecision === "request-changes"}
				className="type-control border-width-thin rounded-[var(--r-pill)]  border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[7px]   text-[var(--text-secondary)]    hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
			>
				Request changes
			</button>
			<button
				type="button"
				disabled={resolved}
				aria-label="More verdict options"
				aria-expanded={menuOpen}
				onClick={onToggleMenu}
				className="type-control border-width-thin inline-flex h-[32px] w-[32px] items-center justify-center rounded-[var(--r-pill)]  border-[var(--border-default)] bg-[var(--surface-elevated)]   text-[var(--text-secondary)]    hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
			>
				⋯
			</button>
			{menuOpen ? (
				<div className="border-width-thin absolute right-0 top-[40px] z-10 w-[200px] overflow-hidden rounded-[var(--r-subtle)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] py-[6px] shadow-[var(--shadow-elevated)]">
					{OVERFLOW_DECISIONS.map((decision) => (
						<button
							key={decision}
							type="button"
							disabled={resolved}
							onClick={() => {
								onToggleMenu();
								onSubmit(decision);
							}}
							className={`type-control ${[
								"block w-full px-[12px] py-[7px] text-left     hover:bg-[var(--surface-container)] disabled:cursor-not-allowed disabled:opacity-60",
								decision === "reject" ? "text-[var(--status-error)]" : "text-[var(--text-primary)]",
							].join(" ")}`}
						>
							{verdictDecisionLabel(decision)}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

function FrameHeader({
	subject,
	menuOpen,
	onToggleMenu,
	onSubmitVerdict,
	resolved,
	presentation,
	reservePaneControls,
}: {
	readonly subject: ComposedReviewSubject;
	readonly menuOpen: boolean;
	readonly onToggleMenu: () => void;
	readonly onSubmitVerdict: (decision: VerdictDecision) => void;
	readonly resolved?: boolean;
	readonly presentation: "page" | "pane";
	readonly reservePaneControls?: boolean;
}): JSX.Element {
	const s = subject;
	return (
		<PageHeader
			presentation={presentation}
			reservePaneControls={reservePaneControls}
			title={s.title}
			// @lore BB1: betId → parentTaskId; /work/bet/ → /work/task/
			leading={
				<Breadcrumb
					segments={[
						{ label: "Work", to: "/work" },
						...(s.parentTaskId ? [{ label: s.betTitle, to: `/work/task/${s.parentTaskId}` }] : []),
						...(s.taskId && s.taskTitle
							? [{ label: s.taskTitle, to: `/work/task/${s.taskId}` }]
							: []),
						{ label: s.title },
					]}
				/>
			}
			subtitle={
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-[18px] gap-y-[9px]">
					<div className="flex items-center gap-[6px]">
						<AgentAvatar name={s.authorName} />
						<span data-az16-profile="small" className="type-small   text-[var(--text-primary)]">
							{s.authorName}
						</span>
						<span className="text-[var(--text-tertiary)]">→</span>
						<HumanAvatar name={s.reviewerName} />
						<span className="type-small  text-[var(--text-secondary)]">{s.reviewerName}</span>
					</div>

					{s.blocking ? <StatusDot tone="var(--status-error)" label="Blocking" /> : null}

					<div className="flex items-center gap-[6px]">
						{s.tools.map((t) => (
							<ToolLogo key={t} tool={t as ToolId} size="sm" />
						))}
					</div>

					<span
						data-az16-profile="data"
						className="type-data   tabular-nums text-[var(--text-tertiary)]"
					>
						{/* A produced-by-an-agent review never carries `tokens`, so the
						separator must not render with nothing on its left. */}
						{s.tokens && s.producedAgo
							? `${s.tokens} · ${s.producedAgo}`
							: s.tokens || s.producedAgo}
					</span>
				</div>
			}
			actions={
				<Verdict
					menuOpen={menuOpen}
					onToggleMenu={onToggleMenu}
					onSubmit={onSubmitVerdict}
					resolved={resolved}
					activeDecision={subject.verdict?.decision}
				/>
			}
		/>
	);
}

// ── § THE TASK ──────────────────────────────────────────────────────────────────

function TaskSection({ subject }: { readonly subject: ComposedReviewSubject }): JSX.Element {
	const s = subject;
	return (
		<section>
			<SectionHead label="The task" />
			<div
				data-az16-profile="strong"
				className="border-width-strong-l rounded-[var(--r-subtle)]  border-[var(--border-default)] bg-[var(--surface-container)] px-[14px] py-[12px]"
			>
				<p
					data-az16-profile="copy"
					className="type-copy max-w-[72ch]  italic  text-[var(--text-secondary)]"
				>
					“{s.prompt}”
				</p>
			</div>
		</section>
	);
}

// ── § RESULT ──────────────────────────────────────────────────────────────────

function KpiChip({ kpi }: { kpi: ReviewKpi }): JSX.Element {
	const deltaColor =
		kpi.good === true
			? "var(--status-success)"
			: kpi.good === false
				? "var(--status-error)"
				: "var(--text-tertiary)";
	return (
		<div
			data-az16-profile="thin"
			className="border-width-thin flex flex-col gap-[3px] rounded-[var(--r-subtle)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[12px] py-[9px]"
		>
			<span
				data-az16-profile="label"
				className="type-label  uppercase  text-[var(--text-tertiary)]"
			>
				{kpi.label}
			</span>
			<span
				data-az16-profile="metric"
				className="type-metric     tabular-nums text-[var(--text-primary)]"
			>
				{kpi.value}
			</span>
			{kpi.delta ? (
				<span className="type-metadata  " style={{ color: deltaColor }}>
					{kpi.delta}
				</span>
			) : null}
		</div>
	);
}

function ResultSection({ subject }: { readonly subject: ComposedReviewSubject }): JSX.Element {
	const s = subject;
	const met = s.intent.filter((c) => c.met).length;
	const unmet = s.intent.find((c) => !c.met);
	return (
		<section>
			<SectionHead label="Result" />
			<div className="flex flex-col gap-[18px]">
				<p className="type-copy max-w-[78ch]   text-[var(--text-primary)]">{s.outcome}</p>

				<div className="flex flex-wrap gap-[9px]">
					{s.resultKpis.map((kpi) => (
						<KpiChip key={kpi.label} kpi={kpi} />
					))}
				</div>

				<p className="type-metadata  text-[var(--text-tertiary)]">
					Met the task:{" "}
					<span className="type-data   tabular-nums text-[var(--text-secondary)]">
						{met} of {s.intent.length}
					</span>
					{unmet ? ` — ${unmet.text.toLowerCase()} still open` : ""}
				</p>
			</div>
		</section>
	);
}

// ── § NEEDS YOU ──────────────────────────────────────────────────────────────────

function NeedsSection({
	subject,
	onJump,
}: {
	readonly subject: ComposedReviewSubject;
	readonly onJump: (artifactId: string) => void;
}): JSX.Element {
	const s = subject;
	return (
		<section>
			<SectionHead label="Needs you" count={String(s.needs.length)} />
			<div className="flex flex-col gap-[3px]">
				{s.needs.map((need) => {
					const target = need.artifactId;
					return (
						<button
							key={need.id}
							type="button"
							onClick={() => target && onJump(target)}
							disabled={!target}
							className="group flex w-full items-start gap-[9px] rounded-[var(--r-subtle)] px-[9px] py-[6px] text-left   hover:bg-[var(--surface-container)] disabled:cursor-default"
						>
							<span
								aria-hidden="true"
								className="mt-[6px] inline-block h-[7px] w-[7px] shrink-0 rounded-[var(--r-pill)]"
								style={{ background: NEED_TONE[need.kind] }}
							/>
							<span className="min-w-0 flex-1">
								<span className="type-small block   text-[var(--text-primary)]">{need.label}</span>
								<span className="type-metadata block   text-[var(--text-secondary)]">
									{need.detail}
								</span>
							</span>
							{target ? (
								<span
									data-spacing-role="optical-offset"
									className="type-metadata mt-[1px] shrink-0 whitespace-nowrap   text-[var(--accent-deep)]"
								>
									Jump →
								</span>
							) : null}
						</button>
					);
				})}
			</div>
		</section>
	);
}

// ── § ARTIFACTS ──────────────────────────────────────────────────────────────────

interface ArtifactRowProps {
	readonly artifact: ComposedReviewSubject["artifacts"][number];
	readonly active: boolean;
	readonly onOpen: () => void;
}

function ArtifactRow({ artifact, active, onOpen }: ArtifactRowProps): JSX.Element {
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-current={active}
			// This is functionally a Row (icon + title, clickable, selected-state
			// accent tint) and belongs on <Row>, but Row's button-branch is
			// missing w-full today (bug-list UI-060, unfixed). Migrating onto
			// the broken branch would shrink-wrap this row narrower than its
			// current w-full. Left as a hand-rolled row pending UI-060.
			// @lore AZ7 N1: bg-[var(--accent-primary-dim)] is Set 3's row-hover /
			// selected tint — not a no-handrolled-control violation.
			className={[
				"group flex w-full items-center gap-[12px] rounded-[var(--r-subtle)] border-width-thin bg-[var(--surface-elevated)] px-[12px] py-[9px] text-left",
				active
					? "border-[var(--accent-deep)] bg-[var(--accent-primary-dim)]"
					: "border-[var(--border-subtle)] hover:border-[var(--border-default)]",
			].join(" ")}
		>
			<KindBadge kind={artifact.kind} />
			<ToolLogo tool={artifact.tool as ToolId} size="sm" />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-[6px]">
					<span className="type-data truncate    text-[var(--text-primary)]">{artifact.title}</span>
				</div>
				<p className="type-metadata truncate  text-[var(--text-secondary)]">
					{artifact.summary ?? ""}
				</p>
			</div>
			<span className="type-data shrink-0   tabular-nums text-[var(--text-tertiary)]">
				{artifact.badge ?? ""}
			</span>
			<span className="motion-move type-metadata shrink-0   text-[var(--accent-deep)]    group-hover:translate-x-[3px]">
				Open →
			</span>
		</button>
	);
}

function ArtifactsSection({
	subject,
	activeId,
	onOpen,
}: {
	readonly subject: ComposedReviewSubject;
	readonly activeId: string | null;
	readonly onOpen: (id: string) => void;
}): JSX.Element {
	const s = subject;
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

// ── § CONVERSATION ───────────────────────────────────────────────────────────────

function CommentItem({ comment }: { comment: ReviewComment }): JSX.Element {
	const { onJumpToAnchor } = useReviewAnchors();
	const ref = comment.anchor ?? comment.refs?.[0];
	const label = comment.anchor?.spotLabel ?? comment.refs?.[0]?.label;
	return (
		<div className="flex items-start gap-[9px]">
			{comment.authorIsAgent ? (
				<AgentAvatar name={comment.author} />
			) : (
				<HumanAvatar name={comment.author} />
			)}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-[6px]">
					<span className="type-small   text-[var(--text-primary)]">{comment.author}</span>
					{comment.authorIsAgent ? (
						<span className="type-label rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[6px] py-[1px]   uppercase  text-[var(--accent-deep)]">
							agent
						</span>
					) : null}
					<span className="type-metadata  text-[var(--text-tertiary)]">{comment.ago}</span>
				</div>
				{ref ? (
					<button
						type="button"
						onClick={() => {
							if (comment.anchor) onJumpToAnchor(comment.anchor);
						}}
						className="type-control border-width-thin mt-[3px] inline-flex items-center gap-[4px] rounded-[var(--r-pill)]  border-[var(--border-subtle)] bg-[var(--surface-container)] px-[6px] py-[1px]  text-[var(--text-tertiary)]    hover:text-[var(--text-secondary)]"
						aria-label={comment.anchor ? `Go to anchor ${label}` : undefined}
					>
						<span className="text-[var(--text-tertiary)]">on</span>
						<span className="type-data  text-[var(--text-secondary)]">{label}</span>
					</button>
				) : null}
				<p className="type-small mt-[3px]   text-[var(--text-secondary)]">{comment.body}</p>
			</div>
		</div>
	);
}

interface ConversationSectionProps {
	readonly comments: readonly ReviewComment[];
	readonly threadId?: string;
	readonly onPostComment?: (input: { text: string; anchor?: AnchorRef }) => Promise<void>;
	readonly resolved?: boolean;
}

function ConversationSection({
	comments,
	threadId,
	onPostComment,
	resolved,
}: ConversationSectionProps): JSX.Element {
	return (
		<section>
			<SectionHead label="Conversation" count={String(comments.length)} />
			<div className="flex flex-col gap-[12px]">
				{comments.map((c) => (
					<CommentItem key={c.id} comment={c} />
				))}
				{!resolved && onPostComment ? (
					<Composer
						threadId={threadId ?? "review"}
						onSubmit={async ({ text }) => {
							await onPostComment({ text });
						}}
					/>
				) : onPostComment ? (
					<div className="border-width-thin type-small flex items-center gap-[9px] rounded-[var(--r-subtle)]  border-[var(--border-subtle)] bg-[var(--surface-container)] px-[12px] py-[9px]  text-[var(--text-tertiary)]">
						Review resolved — no new comments
					</div>
				) : (
					<div className="border-width-thin type-small flex items-center gap-[9px] rounded-[var(--r-subtle)]  border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[9px]  text-[var(--text-tertiary)]">
						Reply (composer not connected)
					</div>
				)}
			</div>
		</section>
	);
}

// ── RIGHT PANE ──────────────────────────────────────────────────────────────────

function ExaminePane({
	artifact,
	onClose,
}: {
	readonly artifact: ComposedReviewSubject["artifacts"][number];
	readonly onClose: () => void;
}): JSX.Element {
	const Canvas = getReviewCanvas(artifact.kind);
	return (
		// AM5 T6: w-[620px] + border-l REMOVED — ExaminePane now fills its SplitView destination slot.
		// @lore AZ2: <aside> keeps the landmark + surface background; <PageScaffold>
		// nested inside owns the pinned-header/scroll-body contract. Without it,
		// ExaminePane's own scroll region would double up with SplitView's
		// destination wrapper (SplitView.tsx:253, `min-h-0 flex-1 overflow-auto`
		// around {destination}) — two nested scroll containers, and the header
		// above would scroll away with the outer one instead of staying pinned.
		<aside className="flex h-full flex-col bg-[var(--surface-container)]">
			<PageScaffold
				header={
					<PageHeader
						presentation="pane"
						paneTitleProfile="subheading"
						reservePaneControls
						leading={
							<div className="flex min-w-0 items-center gap-[9px] overflow-hidden">
								<KindBadge kind={artifact.kind} />
								<ToolLogo tool={artifact.tool as ToolId} size="sm" />
							</div>
						}
						title={<span className="block truncate">{artifact.title}</span>}
						actions={
							<button
								type="button"
								aria-label="Close artifact"
								onClick={onClose}
								className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[var(--r-pill)] border-width-thin border-[var(--border-default)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
							>
								<svg aria-hidden="true" viewBox="0 0 16 16" className="h-[14px] w-[14px]">
									<path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
								</svg>
							</button>
						}
					/>
				}
			>
				<div className="flex flex-col gap-[18px] p-[18px]">
					{artifact.kind === "action_operation" ? (
						<ReviewActionOperation artifact={artifact} />
					) : (
						<Canvas artifact={artifact} />
					)}
				</div>
			</PageScaffold>
		</aside>
	);
}

// ── COMPOSITION ─────────────────────────────────────────────────────────────────

export function ReviewComposition({
	subject,
	onSubmitVerdict,
	onPostComment,
	threadId,
	initialOpenArtifactId = null,
	resolved: resolvedProp,
	presentation = "page",
}: ReviewCompositionProps): JSX.Element {
	const [activeId, setActiveId] = useState<string | null>(initialOpenArtifactId);
	const [menuOpen, setMenuOpen] = useState(false);
	// AM5 T6: SplitView ratio persistence for the review surface
	const [reviewRatio, setReviewRatio] = useUiPreference("review", 0.55);
	const { sidebarMobile } = useViewportBreakpoint();

	const activeArtifact = subject.artifacts.find((a) => a.id === activeId) ?? null;
	const listPresentation = activeArtifact ? "pane" : presentation;
	const resolved = resolvedProp ?? subject.verdict?.decision !== undefined;

	const openArtifact = useCallback((id: string) => {
		setActiveId((cur) => (cur === id ? null : id));
	}, []);

	useEffect(() => {
		if (!activeArtifact) return undefined;
		function onKey(e: KeyboardEvent): void {
			if (e.key === "Escape") {
				setActiveId(null);
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [activeArtifact]);

	const activeArtifactId = activeArtifact?.id ?? "";
	const canvasContext = useMemo(
		() => ({
			anchors: subject.conversation.filter((c) => c.anchor?.artifactId === activeArtifactId),
			readOnly: resolved,
			onAddAnchor: async ({ anchor, text }: { anchor: AnchorRef; text: string }) => {
				if (onPostComment) {
					await onPostComment({ text, anchor });
				}
			},
			onJumpToAnchor: (anchor: AnchorRef) => {
				if (anchor.artifactId) {
					openArtifact(anchor.artifactId);
				}
			},
		}),
		[subject.conversation, activeArtifactId, resolved, onPostComment, openArtifact],
	);

	// AM5 T6: ExaminePane reconciled onto SplitView (surfaceKey="review").
	// The review list is the origin; ExaminePane fills the destination.
	//
	// @lore AZ2: reviewListPane is a self-contained header+scroll-body unit —
	// exactly PageScaffold's shape — used in the two same positions WorkTeam's
	// pre-AZ2 teamBody used to occupy (standalone, and as a SplitView origin).
	// The outer bg-[var(--surface-page)]/text-[var(--text-primary)] surface
	// classes stay on a thin wrapper (PageScaffold's own root has no className
	// prop) so the card's visual surface is unchanged.
	const reviewListPane = (
		<div className="h-full bg-[var(--surface-page)] text-[var(--text-primary)]">
			<PageScaffold
				frame={listPresentation === "page" ? "page" : "local"}
				header={
					<FrameHeader
						subject={subject}
						menuOpen={menuOpen}
						onToggleMenu={() => setMenuOpen((v) => !v)}
						onSubmitVerdict={onSubmitVerdict}
						resolved={resolved}
						presentation={listPresentation}
						reservePaneControls={presentation === "pane" && activeArtifact === null}
					/>
				}
			>
				<div
					className={
						listPresentation === "page"
							? "flex max-w-[920px] flex-col gap-[36px] py-[24px]"
							: "flex flex-col gap-[36px] p-[18px]"
					}
				>
					<TaskSection subject={subject} />
					<ResultSection subject={subject} />
					<NeedsSection subject={subject} onJump={openArtifact} />
					<ArtifactsSection subject={subject} activeId={activeId} onOpen={openArtifact} />
					<ConversationSection
						comments={subject.conversation}
						threadId={threadId}
						onPostComment={onPostComment}
						resolved={resolved}
					/>
				</div>
			</PageScaffold>
		</div>
	);

	return (
		<ReviewCanvasProvider value={canvasContext}>
			{activeArtifact ? (
				<SplitView
					surfaceKey="review"
					mode="split"
					dividerRatio={reviewRatio}
					onRatioChange={setReviewRatio}
					onModeChange={(mode) => {
						if (mode === "fold-back") setActiveId(null);
					}}
					origin={reviewListPane}
					destination={<ExaminePane artifact={activeArtifact} onClose={() => setActiveId(null)} />}
					compact={sidebarMobile}
					originLabel="review"
				/>
			) : (
				<div className="h-full w-full">{reviewListPane}</div>
			)}
		</ReviewCanvasProvider>
	);
}
