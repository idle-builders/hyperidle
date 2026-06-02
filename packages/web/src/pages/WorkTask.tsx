/**
 * WorkTask — Task detail page.
 *
 * Route: /work/bet/:betId/task/:taskId
 *
 * Renders:
 *  - Breadcrumb: Work / [Team] / [Bet title] / [Task title]
 *  - Metadata strip: owner, status, started, cost, session count
 *  - Sessions section: list of agent sessions for this task
 *  - Discussion section (HostThreadSection with hostKind="task")
 *  - Artifacts section (ArtifactSection filtered by task)
 *
 * @lore W3: AC-26 through AC-32. Created as a new page for task drill-down
 * from the WorkBet task list rows. Follows the WorkBet pattern (overrideId
 * props for testing, useBet for bet data, useTaskSessions for session data).
 *
 * @lore W3 AC-28: Started cell uses a simple relative-time formatter so no
 * external date library is needed. The Session cell counts active + completed
 * sessions and shows a "Dial in" ghost button only when a session is active.
 */

import type { Status } from "@hyperidle/design-system";
import { StatusChip, taskStateToStatus } from "@hyperidle/design-system";
import type { JSX } from "react";
import { Link, useParams } from "react-router-dom";
import { ArtifactSection, useArtifactOpen } from "../components/ArtifactSection.js";
import { useBet } from "../hooks/useBet.js";
import { useTaskSessions } from "../hooks/useTaskSessions.js";
import { HostThreadSection } from "../shell/HostThreadSection.js";

/**
 * Format an ISO timestamp as a simple relative time label ("2 days ago", "just now", etc.).
 * No external dependency — sufficient precision for a metadata strip.
 *
 * @lore W3 AC-28: Keep this local. Adding a date library for one use case is overkill.
 */
function formatRelativeTime(isoString: string): string {
	const diffMs = Date.now() - new Date(isoString).getTime();
	if (Number.isNaN(diffMs)) return "—";
	const diffSec = Math.floor(diffMs / 1000);
	if (diffSec < 60) return "just now";
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffH = Math.floor(diffMin / 60);
	if (diffH < 24) return `${diffH}h ago`;
	const diffD = Math.floor(diffH / 24);
	return `${diffD}d ago`;
}

/**
 * Map session.status string to a display Status.
 *
 * @lore W3 WARNING-ADV4: session.status must not be hardcoded. The session API
 * returns a status string ("active", "paused", "done", "crashed"). Map to the
 * StatusChip Status vocabulary for display.
 */
function sessionStatusToStatus(status: string): Status {
	switch (status) {
		case "active":
			return "healthy";
		case "done":
		case "completed":
			return "done";
		case "paused":
			return "paused";
		case "crashed":
			return "error";
		default:
			return "healthy";
	}
}

export interface WorkTaskProps {
	/** Override bet ID from route params — used by tests outside the router. */
	overrideBetId?: string;
	/** Override task ID from route params — used by tests outside the router. */
	overrideTaskId?: string;
}

export function WorkTask({ overrideBetId, overrideTaskId }: WorkTaskProps = {}): JSX.Element {
	const { betId: routeBetId, taskId: routeTaskId } = useParams<{
		betId: string;
		taskId: string;
	}>();

	const betId = overrideBetId ?? routeBetId;
	const taskId = overrideTaskId ?? routeTaskId;

	const { data: bet, loading: betLoading, error: betError } = useBet(betId);
	const { data: sessionsData } = useTaskSessions(taskId);
	const onOpenArtifact = useArtifactOpen();

	// Loading state
	if (betLoading) {
		return (
			<div
				data-testid="task-detail-loading"
				aria-label="Loading task"
				className="flex flex-col gap-3 max-w-[800px] mx-auto w-full"
			>
				<div className="skeleton h-6 w-48" />
				<div className="skeleton h-8 w-full" />
				<div className="skeleton h-32 w-full" />
			</div>
		);
	}

	// Error state
	if (betError) {
		return (
			<div
				data-testid="task-detail-error"
				role="alert"
				className="text-sm text-[var(--status-error)] max-w-[800px] mx-auto w-full"
			>
				Failed to load task: {betError.message}
			</div>
		);
	}

	// Not found — bet loaded but task not in list
	const task = bet?.tasks.find((t) => t.id === taskId);
	if (!(bet && task)) {
		return (
			<div
				data-testid="task-detail-not-found"
				className="flex flex-col gap-3 max-w-[800px] mx-auto w-full"
			>
				<p className="text-sm text-[var(--text-secondary)]">Task not found.</p>
			</div>
		);
	}

	const sessions = sessionsData?.sessions ?? [];
	const activeSession = sessions.find((s) => s.status === "active");
	const activeSessions = sessions.filter((s) => s.status === "active");
	const completedSessions = sessions.filter((s) => s.status === "done" || s.status === "completed");

	return (
		<div data-testid="task-detail-page" className="flex flex-col gap-3 h-full">
			{/* W3 AC-32: max-width 800px centered body */}
			<div
				data-testid="task-detail-body"
				className="flex flex-col gap-3 max-w-[800px] mx-auto w-full"
			>
				{/* W3 AC-27: Breadcrumb */}
				<nav data-testid="task-breadcrumb" aria-label="Breadcrumb">
					<ol className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)]">
						<li>
							<Link to="/work" className="hover:text-[var(--text-primary)] transition-colors">
								Work
							</Link>
						</li>
						<li aria-hidden="true">/</li>
						<li className="truncate max-w-[120px]">{bet.team}</li>
						<li aria-hidden="true">/</li>
						<li>
							<Link
								to={`/work/bet/${bet.id}`}
								className="hover:text-[var(--text-primary)] transition-colors truncate max-w-[120px]"
							>
								{bet.title}
							</Link>
						</li>
						<li aria-hidden="true">/</li>
						<li className="text-[var(--text-primary)] truncate max-w-[160px]">{task.title}</li>
					</ol>
				</nav>

				{/* Task title */}
				<h1 className="text-[15px] font-semibold">{task.title}</h1>

				{/* W3 AC-28: Metadata strip — Owner, Status, Started, Cost, Session */}
				<div
					data-testid="task-meta-strip"
					className="flex items-center gap-3 flex-wrap text-[12px] text-[var(--text-secondary)]"
				>
					<span>{task.owner}</span>
					<span aria-hidden="true">·</span>
					<StatusChip status={taskStateToStatus(task.state)} />
					<span className="sr-only">{task.state.replace("_", " ")}</span>
					{task.startedAt && (
						<>
							<span aria-hidden="true">·</span>
							<span data-testid="task-started-at">{formatRelativeTime(task.startedAt)}</span>
						</>
					)}
					{task.costActual !== null && (
						<>
							<span aria-hidden="true">·</span>
							<span className="font-mono tabular-nums">
								${((task.costActual.minor ?? 0) / 100).toFixed(2)}
							</span>
						</>
					)}
					<span aria-hidden="true">·</span>
					<span data-testid="task-session-count">
						{activeSessions.length} active / {completedSessions.length} completed
					</span>
					{activeSession && (
						<button
							type="button"
							className="btn btn-xs btn-ghost"
							data-testid="task-dial-in-btn"
							aria-label="Dial in to active session"
						>
							Dial in
						</button>
					)}
				</div>

				{/* W3 AC-29: Sessions section */}
				<section data-testid="task-sessions-section" className="flex flex-col gap-2">
					<h2 className="text-[13px] font-semibold text-[var(--text-primary)]">Sessions</h2>
					{sessions.length === 0 ? (
						<p className="text-[12px] text-[var(--text-tertiary)]">No sessions yet.</p>
					) : (
						<ul className="flex flex-col gap-1">
							{sessions.map((session) => (
								<li
									key={session.id}
									data-testid="session-row"
									className="flex items-center gap-3 px-[12px] py-[9px] rounded-[var(--r-subtle)] bg-[var(--surface-container)]"
								>
									<div className="flex-1 min-w-0">
										<div className="text-[14px] font-medium truncate">{session.title}</div>
										<div className="text-[12px] text-[var(--text-tertiary)] truncate">
											{session.agent}
										</div>
									</div>
									{session.cost !== null && (
										<span className="text-[12px] font-mono tabular-nums text-[var(--text-tertiary)]">
											${((session.cost.minor ?? 0) / 100).toFixed(2)}
										</span>
									)}
									<StatusChip status={sessionStatusToStatus(session.status)} />
								</li>
							))}
						</ul>
					)}
				</section>

				{/* W3 AC-31: Artifacts section */}
				<ArtifactSection
					filter={{ axis: "task", taskId: taskId ?? "" }}
					layout="stack"
					heading="Artifacts"
					onOpen={onOpenArtifact}
				/>

				{/* W3 AC-30: Discussion section */}
				<HostThreadSection hostKind="task" hostId={taskId ?? ""} title="Discussion" />
			</div>
		</div>
	);
}
