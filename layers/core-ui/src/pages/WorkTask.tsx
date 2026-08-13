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
			className="flex items-center gap-[12px] py-[12px] border-b border-[var(--border-subtle)] last:border-b-0"
		>
			<div className="flex-1 min-w-0">
				<div className="text-[14px] font-[500] text-[var(--text-primary)] truncate">{title}</div>
				<div className="text-[12px] text-[var(--text-tertiary)] truncate mt-[3px]">{agent}</div>
			</div>
			{/* AC1: Session effectiveness score — float displayed to 2dp */}
			{effectivenessScore !== null && effectivenessScore !== undefined && (
				// biome-ignore lint/a11y/useAriaPropsSupportedByRole: span receives aria-label for assistive text
				<span
					data-testid="session-effectiveness-score"
					className="text-[12px] font-mono tabular-nums text-[var(--text-secondary)] shrink-0"
					aria-label={`Effectiveness: ${effectivenessScore.toFixed(2)}`}
				>
					{effectivenessScore.toFixed(2)}
				</span>
			)}
			<div className="flex items-center gap-[6px] shrink-0">
				{isActive && <LiveDot />}
				<span className="text-[12px] font-[500] text-[var(--text-secondary)]">
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

	const { data: bet, loading: betLoading, error: betError } = useBet(betId);
	const { data: sessionsData } = useTaskSessions(taskId);
	const onOpenArtifact = useArtifactOpen();

	// Loading state
	if (betLoading) {
		return (
			<PageScaffold
				data-testid="task-detail-loading"
				header={
					<PageHeader
						title={
							<>
								<div className="skeleton h-[13px] w-[240px] mb-[6px]" />
								<div className="skeleton h-[20px] w-[320px]" />
							</>
						}
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
			<PageScaffold data-testid="task-detail-error">
				<div role="alert" className="p-[24px]">
					<ErrorState
						title="Failed to load task"
						description={betError.message}
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
			<PageScaffold data-testid="task-detail-not-found">
				<div className="p-[24px]">
					<p className="text-[13px] text-[var(--text-secondary)]">Task not found.</p>
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

	return (
		<PageScaffold
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
									{ label: bet.team, to: "/work" },
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
				className="flex flex-col gap-[24px] max-w-[800px] mx-auto w-full p-[24px] box-border"
			>
				{/* W3 AC-28: Bordered metadata cell grid */}
				<div
					data-testid="task-meta-strip"
					className="bg-[var(--surface-page)] rounded-[var(--r-default)] border border-[var(--border-subtle)] flex overflow-hidden"
				>
					{/* Owner */}
					<div className="flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px] border-r border-[var(--border-subtle)]">
						<span className="text-[11px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
							Owner
						</span>
						<span className="text-[13px] font-[500] text-[var(--text-primary)]">{task.owner}</span>
					</div>
					{/* Status — StatusChip + LiveDot for in_progress.
						    AI4: Replaced plain text + local LiveDot with design-system StatusChip. */}
					<div className="flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px] border-r border-[var(--border-subtle)]">
						<span className="text-[11px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
							Status
						</span>
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
						<div className="flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px] border-r border-[var(--border-subtle)]">
							<span className="text-[11px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
								Started
							</span>
							<span
								data-testid="task-started-at"
								className="text-[13px] font-[500] text-[var(--text-primary)]"
							>
								{relativeLong(task.startedAt)}
							</span>
						</div>
					)}
					{/* Sessions */}
					<div className="flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px] border-r border-[var(--border-subtle)]">
						<span className="text-[11px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
							Sessions
						</span>
						<span
							data-testid="task-session-count"
							className="text-[13px] font-[500] text-[var(--text-primary)]"
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
						<span className="text-[11px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
							Outcome
						</span>
						<span
							data-testid="task-outcome-cell"
							className="text-[13px] font-[500] text-[var(--text-primary)]"
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
						<p className="text-[12px] text-[var(--text-tertiary)]">No sessions yet.</p>
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
				<section aria-label="Artifacts">
					<SectionLabel label="Artifacts" divider />
					<ArtifactSection
						filter={{ axis: "task", taskId: taskId ?? "" }}
						layout="stack"
						heading=""
						onOpen={onOpenArtifact}
					/>
				</section>

				{/* W3 AC-30: Discussion section */}
				<section aria-label="Discussion">
					<SectionLabel label="Discussion" divider />
					<HostThreadSection hostKind="task" hostId={taskId ?? ""} title="" />
				</section>
			</div>
		</PageScaffold>
	);
}
