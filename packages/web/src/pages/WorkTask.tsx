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

import { ErrorState } from "@hyperidle/design-system";
import { formatMoney } from "@hyperidle/shared";
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
 * LiveDot — 6px pulsing green circle shown next to active/in-progress states.
 * Uses Tailwind's built-in `animate-pulse` (opacity 50%->100% cycle, 2s).
 *
 * @lore visual-parity-audit D-30: The mockup shows a 6px green dot with
 * pulse animation next to "In progress" / "Active" status text in the
 * meta-strip. We use Tailwind animate-pulse which matches the 2s infinite
 * opacity animation described in the audit.
 */
function LiveDot(): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className="inline-block w-[6px] h-[6px] rounded-full bg-[var(--accent-primary)] animate-pulse shrink-0"
		/>
	);
}

/**
 * Human-readable status label lookup — used in meta strip status cell.
 * Extracted to reduce cognitive complexity of WorkTask.
 */
const TASK_STATUS_LABEL: Record<string, string> = {
	in_progress: "In progress",
	done: "Done",
	blocked: "Blocked",
	review: "In review",
	hold: "On hold",
	proposed: "Planned",
	accepted: "Planned",
	killed: "Killed",
};

function getTaskStatusLabel(state: string): string {
	return TASK_STATUS_LABEL[state] ?? state.replace(/_/g, " ");
}

/** Section title class — uppercase label with border-bottom divider. */
const SECTION_TITLE_CLASS =
	"text-[13px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)] pb-[6px] border-b border-[var(--border-subtle)] mb-[9px]";

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
	cost,
	effectivenessScore,
}: {
	id: string;
	title: string;
	agent: string;
	status: string;
	cost: { minor?: number | null; currency?: string | null } | null;
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
				<div className="text-[12px] text-[var(--text-tertiary)] truncate mt-[2px]">{agent}</div>
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
			{cost !== null && cost.minor != null && (
				<span className="text-[12px] font-mono tabular-nums text-[var(--text-tertiary)]">
					{formatMoney({
						minor: cost.minor,
						currency: (cost.currency || "USD") as import("@hyperidle/shared").CurrencyCode,
					})}
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

	const betId = overrideBetId ?? routeBetId;
	const taskId = overrideTaskId ?? routeTaskId;

	const { data: bet, loading: betLoading, error: betError } = useBet(betId);
	const { data: sessionsData } = useTaskSessions(taskId);
	const onOpenArtifact = useArtifactOpen();

	// Loading state
	if (betLoading) {
		return (
			<div data-testid="task-detail-loading" className="flex flex-col h-full">
				<header className="shrink-0 px-[24px] py-[18px] border-b border-[var(--border-subtle)]">
					<div className="skeleton h-[13px] w-[240px] mb-[6px]" />
					<div className="skeleton h-[20px] w-[320px]" />
				</header>
				<div role="status" aria-busy="true" className="flex-1 overflow-y-auto p-[24px]">
					<div className="skeleton h-[120px] w-full rounded-[var(--r-default)]" />
				</div>
			</div>
		);
	}

	// Error state
	if (betError) {
		return (
			<div data-testid="task-detail-error" role="alert" className="flex flex-col h-full">
				<div className="flex-1 overflow-y-auto p-[24px]">
					<ErrorState
						title="Failed to load task"
						description={betError.message}
						dataTestId="task-error-state"
					/>
				</div>
			</div>
		);
	}

	// Not found — bet loaded but task not in list
	const task = bet?.tasks.find((t) => t.id === taskId);
	if (!(bet && task)) {
		return (
			<div data-testid="task-detail-not-found" className="flex flex-col h-full">
				<div className="flex-1 overflow-y-auto p-[24px]">
					<p className="text-[13px] text-[var(--text-secondary)]">Task not found.</p>
				</div>
			</div>
		);
	}

	const sessions = sessionsData?.sessions ?? [];
	// @lore AF16 AC-2: activeSession removed — the "Dial in" button that used it
	// was removed (no session route exists). Re-add when work/session route is built.
	const activeSessions = sessions.filter((s) => s.status === "active");
	const completedSessions = sessions.filter((s) => s.status === "done" || s.status === "completed");

	// Status badge for header
	const statusBadgeClass = (() => {
		const state = task.state;
		if (state === "in_progress") {
			return "inline-flex items-center px-[9px] py-[3px] text-[12px] font-[500] rounded-[var(--r-pill)] bg-[rgba(22,118,79,0.08)] text-[var(--accent-primary)]";
		}
		if (state === "done") {
			return "inline-flex items-center px-[9px] py-[3px] text-[12px] font-[500] rounded-[var(--r-pill)] bg-[var(--surface-container)] text-[var(--text-secondary)]";
		}
		return "inline-flex items-center px-[9px] py-[3px] text-[12px] font-[500] rounded-[var(--r-pill)] bg-[var(--surface-container)] text-[var(--text-secondary)]";
	})();
	const statusLabel = task.state.replace(/_/g, " ");

	return (
		<div data-testid="task-detail-page" className="flex flex-col h-full">
			{/* Fixed bordered header: breadcrumb + h2 title + status badge + overflow */}
			<header className="shrink-0 px-[24px] py-[18px] border-b border-[var(--border-subtle)]">
				{/* W3 AC-27: Breadcrumb */}
				<nav data-testid="task-breadcrumb" aria-label="Breadcrumb">
					<div className="flex items-center gap-[4px] text-[13px] text-[var(--text-tertiary)] mb-[6px] flex-wrap">
						<Link
							to="/work/portfolio"
							className="hover:text-[var(--accent-primary)] transition-colors duration-[var(--motion-fast)]"
						>
							Work
						</Link>
						/
						<Link
							to="/work/portfolio"
							className="hover:text-[var(--accent-primary)] transition-colors duration-[var(--motion-fast)] truncate max-w-[100px]"
						>
							{bet.team}
						</Link>
						/
						<Link
							to={`/work/bet/${bet.id}`}
							className="hover:text-[var(--accent-primary)] transition-colors duration-[var(--motion-fast)] truncate max-w-[120px]"
						>
							{bet.title}
						</Link>
						/<span className="text-[var(--text-primary)] truncate max-w-[160px]">{task.title}</span>
					</div>
				</nav>
				{/* Title row */}
				<div className="flex items-start justify-between gap-[12px]">
					<h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] mt-[4px]">
						{task.title}
					</h2>
					{/* AC-2: "More actions" overflow button removed — no task-level overflow
					    actions are defined for WorkTask (archive, scope, etc. are not yet
					    modelled here). A button with no onClick is a no-op; removing is
					    correct per AC-2. Add back when real actions exist. */}
					<div className="flex items-center gap-[6px] shrink-0">
						<span className={statusBadgeClass}>{statusLabel}</span>
					</div>
				</div>
			</header>

			{/* Scrollable body */}
			<div className="flex-1 overflow-y-auto">
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
							<span className="text-[13px] font-[500] text-[var(--text-primary)]">
								{task.owner}
							</span>
						</div>
						{/* Status — plain text + live dot instead of StatusChip
						    @lore visual-parity-audit D-28: mockup shows "In progress" text + green dot,
						    not a StatusChip component with mono uppercase label. */}
						<div className="flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px] border-r border-[var(--border-subtle)]">
							<span className="text-[11px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
								Status
							</span>
							<div className="flex items-center gap-[6px] mt-[3px]">
								{task.state === "in_progress" && <LiveDot />}
								<span className="text-[13px] font-[500] text-[var(--text-primary)]">
									{getTaskStatusLabel(task.state)}
								</span>
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
									{formatRelativeTime(task.startedAt)}
								</span>
							</div>
						)}
						{/* Cost */}
						{task.costActual !== null && (
							<div className="flex flex-col gap-[3px] px-[18px] py-[12px] flex-1 min-w-[100px] border-r border-[var(--border-subtle)]">
								<span className="text-[11px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
									Cost
								</span>
								<span className="text-[13px] font-[500] font-mono tabular-nums text-[var(--text-primary)]">
									{formatMoney(task.costActual)}
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
						<div className={SECTION_TITLE_CLASS}>Sessions</div>
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
										cost={s.cost}
										effectivenessScore={s.effectivenessScore}
									/>
								))}
							</div>
						)}
					</section>

					{/* W3 AC-31: Artifacts section */}
					<section aria-label="Artifacts">
						<div className={SECTION_TITLE_CLASS}>Artifacts</div>
						<ArtifactSection
							filter={{ axis: "task", taskId: taskId ?? "" }}
							layout="stack"
							heading=""
							onOpen={onOpenArtifact}
						/>
					</section>

					{/* W3 AC-30: Discussion section */}
					<section aria-label="Discussion">
						<div className={SECTION_TITLE_CLASS}>Discussion</div>
						<HostThreadSection hostKind="task" hostId={taskId ?? ""} title="" />
					</section>
				</div>
			</div>
		</div>
	);
}
