import {
	type AnchorRef,
	type VerdictDecision,
	verdictDecisionLabel,
} from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useMemo, useState } from "react";
import {
	Avatar,
	Breadcrumb,
	Button,
	Composer,
	Menu,
	PageHeader,
	PageScaffold,
	Row,
	RowDot,
	type RowTone,
	SplitView,
	Tag,
} from "../../ds";
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

const NEED_TONE: Record<ReviewNeed["kind"], RowTone> = {
	"unhandled-exception": "error",
	"over-authority": "error",
	"blast-radius": "warning",
	"unverified-claim": "warning",
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
	return <Tag label={KIND_LABEL[kind as keyof typeof KIND_LABEL] ?? kind} />;
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
		<span aria-hidden="true" title={name}>
			<Avatar initials={name.slice(0, 2)} agent size="sm" />
		</span>
	);
}

function HumanAvatar({ name }: { name: string }): JSX.Element {
	return (
		<span aria-hidden="true" title={name}>
			<Avatar initials={name.slice(0, 2)} size="sm" />
		</span>
	);
}

// ── L1 frame header ────────────────────────────────────────────────────────────────

interface VerdictProps {
	readonly menuOpen: boolean;
	readonly onToggleMenu: () => void;
	readonly onCloseMenu: () => void;
	readonly onSubmit: (decision: VerdictDecision) => void;
	readonly resolved?: boolean;
	readonly activeDecision?: VerdictDecision;
}

const OVERFLOW_DECISIONS: VerdictDecision[] = ["approve-with-comments", "edit", "reject"];

function Verdict({
	menuOpen,
	onToggleMenu,
	onCloseMenu,
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
			<Button
				variant="secondary"
				disabled={resolved}
				onClick={() => onSubmit("request-changes")}
				aria-pressed={activeDecision === "request-changes"}
			>
				Request changes
			</Button>
			<Button
				variant="secondary"
				size="icon"
				disabled={resolved}
				aria-label="More verdict options"
				aria-expanded={menuOpen}
				onClick={onToggleMenu}
			>
				⋯
			</Button>
			<Menu
				open={menuOpen}
				onClose={onCloseMenu}
				label="More verdict options"
				items={OVERFLOW_DECISIONS.map((decision) => ({
					id: decision,
					label: verdictDecisionLabel(decision),
					disabled: resolved,
					destructive: decision === "reject",
					onSelect: () => {
						onSubmit(decision);
					},
				}))}
			/>
		</div>
	);
}

function FrameHeader({
	subject,
	menuOpen,
	onToggleMenu,
	onCloseMenu,
	onSubmitVerdict,
	resolved,
	presentation,
	reservePaneControls,
}: {
	readonly subject: ComposedReviewSubject;
	readonly menuOpen: boolean;
	readonly onToggleMenu: () => void;
	readonly onCloseMenu: () => void;
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
					onCloseMenu={onCloseMenu}
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
						<Row
							key={need.id}
							as="button"
							onClick={() => target && onJump(target)}
							disabled={!target}
							lead={<RowDot tone={NEED_TONE[need.kind]} />}
							title={need.label}
							subtitle={need.detail}
							cells={
								target
									? [{ content: <span className="text-[var(--accent-deep)]">Jump →</span> }]
									: undefined
							}
						/>
					);
				})}
			</div>
		</section>
	);
}

// ── § ARTIFACTS ──────────────────────────────────────────────────────────────────

interface ArtifactEntryProps {
	readonly artifact: ComposedReviewSubject["artifacts"][number];
	readonly active: boolean;
	readonly onOpen: () => void;
}

function ArtifactEntry({ artifact, active, onOpen }: ArtifactEntryProps): JSX.Element {
	return (
		<Row
			as="button"
			onClick={onOpen}
			selected={active}
			title={artifact.title}
			subtitle={artifact.summary ?? ""}
			lead={
				<span className="inline-flex items-center gap-[9px]">
					<KindBadge kind={artifact.kind} />
					<ToolLogo tool={artifact.tool as ToolId} size="sm" />
				</span>
			}
			cells={[
				{ content: artifact.badge ?? "", numeric: true },
				{ content: <span className="text-[var(--accent-deep)]">Open →</span> },
			]}
		/>
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
					<ArtifactEntry
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
					{comment.authorIsAgent ? <Tag label="agent" tone="accent" /> : null}
					<span className="type-metadata  text-[var(--text-tertiary)]">{comment.ago}</span>
				</div>
				{ref ? (
					<Button
						variant="ghost"
						tone="neutral"
						size="sm"
						className="mt-[3px]"
						onClick={() => {
							if (comment.anchor) onJumpToAnchor(comment.anchor);
						}}
						aria-label={comment.anchor ? `Go to anchor ${label}` : undefined}
					>
						<span className="text-[var(--text-tertiary)]">on</span>
						<span className="type-data  text-[var(--text-secondary)]">{label}</span>
					</Button>
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
		// @lore: ExaminePane aside — <aside> keeps landmark+surface; nested PageScaffold owns pinned-header/scroll; double containers would scroll the header away
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
							<Button variant="secondary" size="icon" aria-label="Close artifact" onClick={onClose}>
								<svg aria-hidden="true" viewBox="0 0 16 16" className="h-[14px] w-[14px]">
									<path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
								</svg>
							</Button>
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
	// B3 fix: onSelect and Menu's own onClose both toggled menuOpen, so a
	// pick closed it once (via onSelect's toggle) then reopened it (via
	// Menu's own onClose firing right after, Menu.tsx:242-243) — the menu
	// never stayed closed after a pick. closeMenu is an explicit close, not
	// a toggle, so both call sites land on the same state regardless of order.
	const closeMenu = useCallback(() => setMenuOpen(false), []);
	// SplitView ratio persistence for the review surface
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

	// @lore: reviewListPane — self-contained header+scroll unit; outer div carries surface classes because PageScaffold root has no className prop
	const reviewListPane = (
		<div className="h-full bg-[var(--surface-page)] text-[var(--text-primary)]">
			<PageScaffold
				frame={listPresentation === "page" ? "page" : "local"}
				header={
					<FrameHeader
						subject={subject}
						menuOpen={menuOpen}
						onToggleMenu={() => setMenuOpen((v) => !v)}
						onCloseMenu={closeMenu}
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
