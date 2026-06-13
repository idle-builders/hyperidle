/**
 * AA1 — WorkRoutine detail page: shows a single routine's config and run history.
 * AA2 — Adds delete button with inline confirmation, cost cap, created, last run summary.
 *
 * Layout:
 *   Header — name, state chip, schedule label, agent, team
 *   Config — KV grid + action buttons (pause/resume, trigger, delete)
 *   Last run summary section
 *   Run history — table of recent runs with duration, outcome, cost
 *
 * @lore AA1: This page is addressed by routineId. The route is
 * /work/routine/:routineId. Data is fetched via useRoutine hook.
 */

import {
	Breadcrumb,
	Button,
	EmptyState,
	ErrorState,
	KeyValue,
	Progress,
	routineStateToStatus,
	SkeletonCard,
	StatusChip,
} from "@hyperidle/design-system";
import type { RoutineBudget, RoutineDetail, RoutineRunSummary } from "@hyperidle/shared";
import { absoluteDate, absoluteDateTime, formatMoney } from "@hyperidle/shared";
import { type JSX, useState } from "react";
import { Link as RRLink, useNavigate, useParams } from "react-router-dom";
import { useRoutine } from "../hooks/useRoutine.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { apiFetch } from "../services/api-fetch.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";

export interface WorkRoutineProps {
	/**
	 * Override the routine detail with directly injected data. When set,
	 * the useRoutine hook is not called. Used by stories and tests.
	 * Pass `null` to simulate a resolved-but-empty fetch (e.g. 404 path).
	 */
	overrideData?: RoutineDetail | null;
	/**
	 * Override the loading state. When true, loading skeleton is shown.
	 */
	overrideLoading?: boolean;
	/**
	 * Override the error state. When set, the error UI is shown.
	 */
	overrideError?: Error | null;
}

export function WorkRoutine({
	overrideData,
	overrideLoading,
	overrideError,
}: WorkRoutineProps = {}): JSX.Element {
	const { routineId } = useParams<{ routineId: string }>();

	// Only call useRoutine when there is no override
	const fetched = useRoutine(overrideData !== undefined ? undefined : routineId);

	const error = overrideError !== undefined ? (overrideError ?? null) : fetched.error;
	const data = overrideData !== undefined ? overrideData : (fetched.data as RoutineDetail | null);
	const loading = overrideLoading === true || (overrideData === undefined && fetched.loading);

	if (loading) {
		return (
			<div className="flex flex-col gap-[12px] h-full" data-testid="work-routine-loading">
				<SkeletonCard ariaLabel="Loading routine header" />
				<SkeletonCard ariaLabel="Loading run history" />
			</div>
		);
	}

	if (error !== null && error !== undefined) {
		return (
			<div className="flex flex-col gap-[12px] h-full" data-testid="work-routine-error">
				<ErrorState title="Failed to load routine" description={error.message} />
			</div>
		);
	}

	if (data === null) {
		return (
			<div className="flex flex-col gap-[12px] h-full" data-testid="work-routine-not-found">
				<EmptyState
					title="Routine not found"
					description="This routine does not exist or has been removed."
				/>
			</div>
		);
	}

	return <WorkRoutineLoaded detail={data} />;
}

function WorkRoutineLoaded({ detail }: { detail: RoutineDetail }): JSX.Element {
	const { routine, runs, budget } = detail;
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();

	// Local state for optimistic state toggle (Pause/Resume)
	const [currentState, setCurrentState] = useState(routine.state);
	const [actionPending, setActionPending] = useState(false);
	// AA2: Delete confirmation state
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	/** PATCH /api/routines/:id to toggle active <-> paused state */
	async function handleTogglePause(): Promise<void> {
		if (actionPending) return;
		const newState = currentState === "active" ? "paused" : "active";
		setActionPending(true);
		try {
			const res = await fetch(`/api/routines/${encodeURIComponent(routine.id)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ state: newState }),
			});
			if (res.ok) {
				setCurrentState(newState);
			}
		} finally {
			setActionPending(false);
		}
	}

	/** POST /api/routines/:id/trigger to manually run the routine */
	async function handleTriggerNow(): Promise<void> {
		if (actionPending) return;
		setActionPending(true);
		try {
			await fetch(`/api/routines/${encodeURIComponent(routine.id)}/trigger`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});
		} finally {
			setActionPending(false);
		}
	}

	/** AA2: DELETE /api/routines/:id — soft delete */
	async function handleDeleteConfirm(): Promise<void> {
		if (actionPending) return;
		setActionPending(true);
		try {
			const res = await apiFetch(`/api/routines/${encodeURIComponent(routine.id)}`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
			});
			if (res.ok) {
				// Navigate back to portfolio after successful delete
				navigate("/work/portfolio");
			}
		} finally {
			setActionPending(false);
			setShowDeleteConfirm(false);
		}
	}

	const autonomyLabels: Record<number, string> = {
		1: "L1 — Every run reviewed",
		2: "L2 — Human reviews",
		3: "L3 — Autonomous, human on error",
		4: "L4 — Fully autonomous",
	};
	const autonomyLabel =
		routine.autonomyLevel != null
			? (autonomyLabels[routine.autonomyLevel] ?? `L${routine.autonomyLevel}`)
			: "—";

	const lastRunLabel =
		routine.lastRunAt != null
			? `${absoluteDateTime(routine.lastRunAt)}${routine.lastRunOutcome ? ` — ${routine.lastRunOutcome}` : ""}`
			: "Never";

	return (
		<div className="flex flex-col gap-[12px] h-full" data-testid="work-routine-page">
			{/* AG4: DS Breadcrumb — routine-breadcrumb-back testId preserved on first segment */}
			<section aria-label="Routine header">
				<div className="mb-1">
					<Breadcrumb
						segments={[
							{ label: "Work", to: "/work/portfolio", testId: "routine-breadcrumb-back" },
							...(routine.teamName ? [{ label: routine.teamName }] : []),
							{ label: routine.name },
						]}
						leading={
							!sidebarMobile ? (
								<NavHistoryCluster onBack={() => navigate(-1)} onForward={() => navigate(1)} />
							) : undefined
						}
						LinkComponent={RRLink}
					/>
				</div>
				<div className="flex items-center gap-[12px] flex-wrap">
					<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-primary)] flex-1">
						{routine.name}
					</h1>
					<StatusChip status={routineStateToStatus(currentState)} />
				</div>
				<div className="mt-1 text-xs text-[var(--text-tertiary)]">
					{routine.agentName} · {routine.triggerType}
				</div>
				{routine.description && (
					<p className="mt-2 text-xs text-[var(--text-secondary)]">{routine.description}</p>
				)}
			</section>

			{/* Configuration section — KV grid + action buttons */}
			<section
				aria-label="Routine configuration"
				className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]"
			>
				<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
					Configuration
				</h2>

				{/* KV grid */}
				<div className="flex flex-col gap-[9px]">
					<KeyValue label="Agent" value={routine.agentName} />
					<KeyValue label="Schedule" value={routine.scheduleLabel} />
					<KeyValue label="Trigger type" value={routine.triggerType} />
					<KeyValue label="Autonomy level" value={autonomyLabel} />
					<KeyValue
						label="Next run"
						value={routine.nextRunAt ? absoluteDateTime(routine.nextRunAt) : "On next event"}
					/>
					{/* AA3: Cumulative cost and cost caps moved to Budget section */}
					<KeyValue label="Last run" value={lastRunLabel} />
					{/* AA2: created date (always shown when present) */}
					{routine.createdAt && (
						<div className="flex flex-row gap-[6px] items-center justify-between">
							<span className="uppercase font-[family-name:var(--font-mono)] text-[11px] tracking-[var(--tracking-caps)] font-medium text-[var(--text-tertiary)]">
								Created
							</span>
							<span
								className="text-[15px] text-[var(--text-primary)]"
								data-testid="routine-created"
							>
								{absoluteDate(routine.createdAt)}
							</span>
						</div>
					)}
				</div>

				{/* Action buttons at bottom of config section */}
				{showDeleteConfirm ? (
					<div
						className="flex items-center gap-[9px] mt-[18px]"
						data-testid="routine-delete-inline"
					>
						<span className="text-xs text-[var(--text-secondary)] flex-1">
							Delete this routine? History will be preserved.
						</span>
						<Button
							variant="destructive"
							size="sm"
							className="min-h-[44px]"
							onClick={() => void handleDeleteConfirm()}
							disabled={actionPending}
							data-testid="routine-delete-confirm"
						>
							Confirm delete
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="min-h-[44px]"
							onClick={() => setShowDeleteConfirm(false)}
							disabled={actionPending}
							data-testid="routine-delete-cancel"
						>
							Cancel
						</Button>
					</div>
				) : (
					<div className="flex gap-[9px] mt-[18px]" data-testid="routine-actions">
						<Button
							variant="ghost"
							size="sm"
							onClick={handleTogglePause}
							disabled={actionPending}
							data-testid={currentState === "active" ? "routine-pause-btn" : "routine-resume-btn"}
						>
							{currentState === "active" ? "Pause" : "Resume"}
						</Button>
						<Button
							variant="primary"
							size="sm"
							onClick={handleTriggerNow}
							disabled={actionPending}
							data-testid="routine-trigger-now-btn"
						>
							Trigger Now
						</Button>
						{/* AA2: spacer + delete button (right-aligned) */}
						<div className="flex-1" />
						<Button
							variant="destructive"
							size="sm"
							onClick={() => setShowDeleteConfirm(true)}
							disabled={actionPending}
							data-testid="routine-delete-btn"
						>
							Delete
						</Button>
					</div>
				)}
			</section>

			{/* AA3: Budget section — between Configuration and Last Run Summary */}
			{budget != null && <BudgetSection budget={budget} />}

			{/* AA2: Last run summary section */}
			<section
				aria-label="Last run summary"
				className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]"
				data-testid="routine-last-run-summary"
			>
				<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
					Last Run Summary
				</h2>
				{routine.lastRunSummary ? (
					<p className="text-xs text-[var(--text-secondary)]">{routine.lastRunSummary}</p>
				) : (
					<p className="text-xs text-[var(--text-tertiary)]">No previous runs</p>
				)}
			</section>

			{/* Recent runs section */}
			<section aria-label="Run history" data-testid="routine-run-history">
				<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
					Recent Runs
				</h2>
				{runs.length === 0 ? (
					<p className="text-xs text-[var(--text-secondary)]">No runs recorded yet.</p>
				) : (
					<div className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[12px]">
						{runs.map((run, idx) => (
							<RunRow key={run.id} run={run} isLast={idx === runs.length - 1} />
						))}
					</div>
				)}
			</section>
		</div>
	);
}

/**
 * AA3: Budget section — shows avg cost, monthly cost, caps, and utilization progress bars.
 * Inserted between Configuration and Last Run Summary on WorkRoutine.
 */
function BudgetSection({ budget }: { budget: RoutineBudget }): JSX.Element {
	return (
		<section
			aria-label="Budget"
			className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]"
			data-testid="routine-budget"
		>
			<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
				Budget
			</h2>
			<div className="flex flex-col gap-[9px]">
				<KeyValue
					label="Avg cost per run"
					value={budget.avgCostPerRun ? formatMoney(budget.avgCostPerRun) : "---"}
				/>
				<KeyValue label="Cost this month" value={formatMoney(budget.costThisMonth ?? null)} />
				<KeyValue
					label="Cost cap per run"
					value={budget.costCapPerRun ? formatMoney(budget.costCapPerRun) : "No cap"}
				/>
				<KeyValue
					label="Monthly cap"
					value={budget.costCapMonthly ? formatMoney(budget.costCapMonthly) : "No cap"}
				/>
			</div>
			{budget.perRunUtilizationPercent != null && (
				<div className="mt-[9px]">
					<Progress
						value={budget.perRunUtilizationPercent}
						label="Per-run budget"
						variant={budget.perRunUtilizationPercent > 80 ? "amber" : "green"}
					/>
				</div>
			)}
			{budget.monthlyUtilizationPercent != null && (
				<div className="mt-[9px]">
					<Progress
						value={budget.monthlyUtilizationPercent}
						label="Monthly budget"
						variant={budget.monthlyUtilizationPercent > 80 ? "amber" : "green"}
					/>
					{budget.monthlyUtilizationPercent >= 100 && (
						<p className="text-[11px] text-[var(--accent-secondary)] mt-[3px]">
							Monthly budget exhausted — runs skipped until next month
						</p>
					)}
				</div>
			)}
		</section>
	);
}

/**
 * Single run row in the recent-runs table.
 * Columns: time (flex-1) | duration (60px right) | outcome dot (60px center) | cost (60px right)
 */
function RunRow({ run, isLast }: { run: RoutineRunSummary; isLast: boolean }): JSX.Element {
	// AA3: amber dot for budget policy stops (not errors — see design/approved.md Surface 4)
	const dotColor =
		run.outcome === "success"
			? "var(--status-success)"
			: run.outcome === "error" || run.outcome === "timeout"
				? "var(--status-error)"
				: run.outcome === "budget_exhausted" || run.outcome === "monthly_budget_exhausted"
					? "var(--accent-secondary)"
					: "var(--text-tertiary)";

	return (
		<div
			data-testid="routine-run-row"
			className={[
				"flex items-center gap-[9px] py-[6px]",
				!isLast ? "border-b border-[var(--border-subtle)]" : "",
			]
				.filter(Boolean)
				.join(" ")}
		>
			{/* Time — flex-1 mono */}
			<span className="flex-1 text-[11px] font-mono text-[var(--text-tertiary)]">
				{absoluteDateTime(run.startedAt)}
			</span>

			{/* Duration — 60px right tabular */}
			<span className="w-[60px] shrink-0 text-[11px] font-mono text-[var(--text-tertiary)] text-right tabular-nums">
				{run.durationSeconds !== null ? `${run.durationSeconds}s` : "—"}
			</span>

			{/* Outcome dot — 60px center */}
			<span className="w-[60px] shrink-0 flex justify-center">
				<span
					role="img"
					aria-label={run.outcome}
					className="w-[6px] h-[6px] rounded-full"
					style={{ background: dotColor }}
					title={run.outcome}
				/>
			</span>

			{/* Cost — 60px right tabular */}
			<span className="w-[60px] shrink-0 text-[11px] font-mono text-[var(--text-tertiary)] text-right tabular-nums">
				{run.cost ? formatMoney(run.cost) : "—"}
			</span>
		</div>
	);
}
