/**
 * WorkTask — Task detail page.
 *
 * Route: /work/bet/:betId/task/:taskId
 *
 * Renders:
 *  - Fixed bordered header: breadcrumb + h2 title + status badge + overflow button
 *  - Scrollable body: bordered metadata cell grid, sessions, artifacts, discussion
 *
 * @lore W3: AC-26 through AC-32. Created as a new page for task drill-down
 * from the WorkBet task list rows. Follows the WorkBet pattern (overrideId
 * props for testing, useBet for bet data, useTaskSessions for session data).
 *
 * @lore W3: AppShell <main> is overflow-hidden with no padding, so this page
 * uses a fixed shrink-0 header + flex-1 overflow-y-auto body pattern.
 *
 * @lore W3 AC-28: Started cell uses a simple relative-time formatter so no
 * external date library is needed.
 */

import {
	Breadcrumb,
	ErrorState,
	LiveDot,
	PageHeader,
	PageScaffold,
	SectionLabel,
	StatusChip,
	taskStateToStatus,
} from "@hyperidle/design-system";
import { TASK_STATE_LABEL } from "@hyperidle/domain-model";
import { relativeLong } from "@hyperidle/presentation-format";
import type { JSX } from "react";
import { Link as RRLink, useNavigate, useParams } from "react-router-dom";
import { ArtifactSection, useArtifactOpen } from "../components/ArtifactSection.js";
import { useBet } from "../hooks/useBet.js";
import { useTaskSessions } from "../hooks/useTaskSessions.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { HostThreadSection } from "../shell/HostThreadSection.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";

/**
 * @lore AI3: relativeLong replaces local formatRelativeTime.
 * AI4: Local LiveDot, TASK_STATUS_LABEL, getTaskStatusLabel removed.
 * LiveDot promoted to @hyperidle/design-system; TASK_STATE_LABEL is from @hyperidle/domain-model.
 */

export interface WorkTaskProps {
	/** Override bet ID from route params — used by tests outside the router. */
	overrideBetId?: string;
	/** Override task ID from route params — used by tests outside the router. */
	overrideTaskId?: string;
}

/**
 * Renders a single session row with live dot indicator for active sessions.
 *
 * @lore visual-parity-audit D-30: session rows show green pulsing dot on active
 * sessions, plain text status label — matches task-detail.html session-status rendering.
 * Extracted to reduce cognitive complexity of WorkTask (biome: max 25).
 */
function SessionRow({
	id,
	title,
	agent,
	status,
	effectivenessScore,
}: {
	id: string;
	title: string;
	agent: string;
	status: string;
	/** AC1: Float 0-1 effectiveness score. Null/undefined = not evaluated. */
	effectivenessScore?: number | null;
}): JSX.Element {
	const isActive = status === "active";
	const isDone = status === "done" || status === "completed";
	return (
		<div
			key={id}
			data-testid="session-row"
			className="border-b-[var(--bw-thin)] border-none flex items-center gap-[12px] py-[12px]  border-[var(--border-subtle)] "
		>
			<div className="flex-1 min-w-0">
				<div className="type-copy   text-[var(--text-primary)] truncate">{title}</div>
				<div className="type-metadata  text-[var(--text-tertiary)] truncate mt-[3px]">{agent}</div>
			</div>
			{/* AC1: Session effectiveness score — float displayed to 2dp with label */}
			{effectivenessScore !== null && effectivenessScore !== undefined && (
				// biome-ignore lint/a11y/useAriaPropsSupportedByRole: span receives aria-label for assistive text
				<span
					data-testid="session-effectiveness-score"
					className="type-data   tabular-nums text-[var(--text-secondary)] shrink-0 flex items-center gap-[3px]"
					aria-label={`Effectiveness: ${effectivenessScore.toFixed(2)}`}
				>
					{/* UI-106: label the score so it reads as "Effectiveness 0.75" not a bare number */}
					<span className="type-metadata text-[var(--text-tertiary)]">Effectiveness</span>
					{effectivenessScore.toFixed(2)}
				</span>
			)}
			<div className="flex items-center gap-[6px] shrink-0">
				{isActive && <LiveDot />}
				<span className="type-metadata   text-[var(--text-secondary)]">
					{isActive ? "Active" : isDone ? "Done" : status}
				</span>
			</div>
		</div>
	);
}

export function WorkTask({ overrideBetId, overrideTaskId }: WorkTaskProps = {}): JSX.Element {
	const { betId: routeBetId, taskId: routeTaskId } = useParams<{
		betId: string;
		taskId: string;
	}>();
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();

	const betId = overrideBetId ?? routeBetId;
	const taskId = overrideTaskId ?? routeTaskId;

	const { data: bet, loading: betLoading, error: betError, refresh: refreshBet } = useBet(betId);
	const { data: sessionsData } = useTaskSessions(taskId);
	const onOpenArtifact = useArtifactOpen();

	// Loading state
	if (betLoading) {
		return (
			<PageScaffold
				frame="page"
				data-testid="task-detail-loading"
				header={
					<PageHeader
						title="Task"
						subtitle={<span className="skeleton block h-[13px] w-[240px]" />}
					/>
				}
			>
				<div role="status" aria-busy="true" className="p-[24px]">
					<div className="skeleton h-[120px] w-full rounded-[var(--r-default)]" />
				</div>
			</PageScaffold>
		);
	}

	// Error state
	if (betError) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Task" />}
				data-testid="task-detail-error"
			>
				<div role="alert" className="p-[24px]">
					<ErrorState
						title="Failed to load task"
						description={betError.message}
						onRetry={refreshBet}
						dataTestId="task-error-state"
					/>
				</div>
			</PageScaffold>
		);
	}

	// Not found — bet loaded but task not in list
	const task = bet?.tasks.find((t) => t.id === taskId);
	if (!(bet && task)) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Task" />}
				data-testid="task-detail-not-found"
			>
				<div className="p-[24px]">
					<p className="type-small  text-[var(--text-secondary)]">Task not found.</p>
				</div>
			</PageScaffold>
		);
	}

	const sessions = sessionsData?.sessions ?? [];
	// @lore AF16 AC-2: activeSession removed — the "Dial in" button that used it
	// was removed (no session route exists). Re-add when work/session route is built.
	const activeSessions = sessions.filter((s) => s.status === "active");
	const completedSessions = sessions.filter((s) => s.status === "done" || s.status === "completed");

	// AI4: statusBadgeClass/statusLabel IIFEs removed — use StatusChip + TASK_STATE_LABEL.

	// UI-020: if owner is null/undefined, show "Unassigned" so the cell is never blank.
	const ownerLabel = task.owner ?? "Unassigned";

	return (
		<PageScaffold
			frame="page"
			data-testid="task-detail-page"
			header={
				/* AI7: PageHeader owns the pinned title strip. */
				<PageHeader
					title={task.title}
					leading={
						/* AG4: Breadcrumb — DS Breadcrumb replaces hand-rolled nav */
						<div data-testid="task-breadcrumb">
							<Breadcrumb
								segments={[
									{ label: "Work", to: "/work" },
									{ label: bet.team },
									{ label: bet.title, to: `/work/bet/${bet.id}` },
									{ label: task.title },
								]}
								leading={
									!sidebarMobile ? (
										<NavHistoryCluster onBack={() => navigate(-1)} onForward={() => navigate(1)} />
									) : undefined
								}
								LinkComponent={RRLink}
							/>
						</div>
					}
					actions={
						/* AC-2: "More actions" overflow button removed — no task-level overflow
						   actions defined. Add back when real actions exist. */
						<div className="flex items-center gap-[6px]">
							{task.state === "in_progress" && <LiveDot />}
							<StatusChip
								status={taskStateToStatus(task.state)}
								label={TASK_STATE_LABEL[task.state]}
							/>
						</div>
					}
				/>
			}
		>
			{/* W3 AC-32: max-width 800px centered body */}
			<div
				data-testid="task-detail-body"
				className="flex flex-col gap-[24px] max-w-[800px] w-full py-[24px] box-border"
			>
				{/* W3 AC-28: Bordered metadata cell grid */}
				<div
					data-testid="task-meta-strip"
					className="border-width-thin bg-[var(--surface-page)] rounded-[var(--r-default)]  border-[var(--border-subtle)] flex overflow-hidden"
				>
					{/* Owner */}
					<div className="border-r-[var(--bw-thin)] flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px]  border-[var(--border-subtle)]">
						<span className="type-label   uppercase  text-[var(--text-tertiary)]">Owner</span>
						<span className="type-small   text-[var(--text-primary)]">{ownerLabel}</span>
					</div>
					{/* Status — StatusChip + LiveDot for in_progress.
						    AI4: Replaced plain text + local LiveDot with design-system StatusChip. */}
					<div className="border-r-[var(--bw-thin)] flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px]  border-[var(--border-subtle)]">
						<span className="type-label   uppercase  text-[var(--text-tertiary)]">Status</span>
						<div className="flex items-center gap-[6px] mt-[3px]">
							{task.state === "in_progress" && <LiveDot />}
							<StatusChip
								status={taskStateToStatus(task.state)}
								label={TASK_STATE_LABEL[task.state]}
							/>
						</div>
					</div>
					{/* Started */}
					{task.startedAt && (
						<div className="border-r-[var(--bw-thin)] flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px]  border-[var(--border-subtle)]">
							<span className="type-label   uppercase  text-[var(--text-tertiary)]">Started</span>
							<span
								data-testid="task-started-at"
								className="type-small   text-[var(--text-primary)]"
							>
								{relativeLong(task.startedAt)}
							</span>
						</div>
					)}
					{/* Sessions */}
					<div className="border-r-[var(--bw-thin)] flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px]  border-[var(--border-subtle)]">
						<span className="type-label   uppercase  text-[var(--text-tertiary)]">Sessions</span>
						<span
							data-testid="task-session-count"
							className="type-small   text-[var(--text-primary)]"
						>
							{activeSessions.length} active / {completedSessions.length} completed
						</span>
						{/* AC-2: "Dial in" button removed — no work/session/:id route or
							    dial-in handler exists anywhere in the codebase. A visible,
							    labeled button that cannot navigate or invoke any action is
							    a no-op and violates AC-2. Re-add when a session detail route
							    is built (e.g. work/bet/:betId/session/:sessionId). */}
					</div>
					{/* AC1: Outcome cell — always rendered; shows "--" when not evaluated */}
					<div className="flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px]">
						<span className="type-label   uppercase  text-[var(--text-tertiary)]">Outcome</span>
						<span
							data-testid="task-outcome-cell"
							className="type-small   text-[var(--text-primary)]"
						>
							{task.outcomeVerdict
								? task.outcomeVerdict.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
								: "--"}
						</span>
					</div>
				</div>

				{/* W3 AC-29: Sessions section */}
				<section data-testid="task-sessions-section">
					<SectionLabel label="Sessions" divider />
					{sessions.length === 0 ? (
						<p className="type-metadata  text-[var(--text-tertiary)]">No sessions yet.</p>
					) : (
						<div className="flex flex-col">
							{sessions.map((s) => (
								<SessionRow
									key={s.id}
									id={s.id}
									title={s.title}
									agent={s.agent}
									status={s.status}
									effectivenessScore={s.effectivenessScore}
								/>
							))}
						</div>
					)}
				</section>

				{/* W3 AC-31: Artifacts section */}
				{/* UI-018: heading="Artifacts" makes ArtifactSection own the section header
				    and renders an EmptyState when no artifacts exist, instead of returning null
				    and leaving the SectionLabel as a bare label with nothing below it. */}
				<ArtifactSection
					filter={{ axis: "task", taskId: taskId ?? "" }}
					layout="stack"
					heading="Artifacts"
					emptyDescription="Artifacts will appear here once agents produce output for this task."
					onOpen={onOpenArtifact}
				/>

				{/* W3 AC-30: Discussion section */}
				{/* UI-019: SectionLabel already provides the heading + divider. Pass inline={true}
				    so HostThreadSection does NOT render its own border-top section wrapper or
				    its own border-bottom h3 (with empty title=""), which created two stacked
				    horizontal rules and a phantom h3 gap. */}
				<section aria-label="Discussion">
					<SectionLabel label="Discussion" divider />
					<HostThreadSection hostKind="task" hostId={taskId ?? ""} inline />
				</section>
			</div>
		</PageScaffold>
	);
}
