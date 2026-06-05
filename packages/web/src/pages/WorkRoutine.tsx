/**
 * AA1 — WorkRoutine detail page: shows a single routine's config and run history.
 *
 * Layout:
 *   Header — name, state chip, schedule label, agent, team
 *   Run history — table of recent runs with duration, outcome, cost
 *
 * @lore AA1: This page is addressed by routineId. The route is
 * /work/routine/:routineId. Data is fetched via useRoutine hook.
 */

import {
	EmptyState,
	ErrorState,
	routineStateToStatus,
	SkeletonCard,
	StatusChip,
} from "@hyperidle/design-system";
import type { RoutineDetail, RoutineRunSummary } from "@hyperidle/shared";
import { formatMoney } from "@hyperidle/shared";
import type { JSX } from "react";
import { Link, useParams } from "react-router-dom";
import { useRoutine } from "../hooks/useRoutine.js";

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
	const { routine, runs } = detail;

	return (
		<div className="flex flex-col gap-[12px] h-full" data-testid="work-routine-page">
			{/* Header */}
			<section aria-label="Routine header">
				<div className="mb-1">
					<Link
						to="/work/portfolio"
						data-testid="routine-breadcrumb-back"
						className="btn btn-ghost btn-xs"
					>
						← Portfolio
					</Link>
				</div>
				<div className="flex items-center gap-[12px] flex-wrap">
					<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-primary)] flex-1">
						{routine.name}
					</h1>
					<StatusChip status={routineStateToStatus(routine.state)} />
				</div>
				<div className="mt-1 flex gap-[18px] flex-wrap">
					<span className="text-xs text-[var(--text-tertiary)]">{routine.scheduleLabel}</span>
					<span className="text-xs text-[var(--text-tertiary)]">{routine.agentName}</span>
					{routine.teamName && (
						<span className="text-xs text-[var(--text-tertiary)]">{routine.teamName}</span>
					)}
				</div>
				{routine.description && (
					<p className="mt-2 text-xs text-[var(--text-secondary)]">{routine.description}</p>
				)}
			</section>

			{/* Config panel */}
			<section
				aria-label="Routine configuration"
				className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]"
			>
				<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
					Configuration
				</h2>
				<div className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
					<div>
						<span className="text-[var(--text-tertiary)]">Trigger: </span>
						{routine.triggerType}
					</div>
					{routine.costActual && (
						<div>
							<span className="text-[var(--text-tertiary)]">Cumulative cost: </span>
							{formatMoney(routine.costActual)}
						</div>
					)}
					{routine.lastRunAt && (
						<div>
							<span className="text-[var(--text-tertiary)]">Last run: </span>
							{new Date(routine.lastRunAt).toLocaleString()}
						</div>
					)}
					{routine.nextRunAt && (
						<div>
							<span className="text-[var(--text-tertiary)]">Next run: </span>
							{new Date(routine.nextRunAt).toLocaleString()}
						</div>
					)}
				</div>
			</section>

			{/* Run history */}
			<section aria-label="Run history" data-testid="routine-run-history">
				<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
					Run History
				</h2>
				{runs.length === 0 ? (
					<EmptyState
						title="No runs yet"
						description="This routine has not run yet."
						dataTestId="routine-run-history-empty"
					/>
				) : (
					<div className="flex flex-col gap-[6px]">
						{runs.map((run) => (
							<RunRow key={run.id} run={run} />
						))}
					</div>
				)}
			</section>
		</div>
	);
}

function RunRow({ run }: { run: RoutineRunSummary }): JSX.Element {
	const outcomeColor =
		run.outcome === "success"
			? "var(--status-healthy)"
			: run.outcome === "error"
				? "var(--status-error)"
				: "var(--text-tertiary)";

	return (
		<div
			data-testid="routine-run-row"
			className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]"
		>
			<div className="flex items-center gap-[12px] flex-wrap">
				<span className="text-xs font-medium" style={{ color: outcomeColor }}>
					{run.outcome}
				</span>
				<span className="text-xs text-[var(--text-tertiary)]">
					{new Date(run.startedAt).toLocaleString()}
				</span>
				{run.durationSeconds !== null && (
					<span className="text-xs text-[var(--text-tertiary)]">{run.durationSeconds}s</span>
				)}
				{run.cost && (
					<span className="text-xs font-mono text-[var(--text-tertiary)]">
						{formatMoney(run.cost)}
					</span>
				)}
			</div>
			{run.errorMessage && (
				<p className="mt-1 text-[11px] text-[var(--text-error)]">{run.errorMessage}</p>
			)}
		</div>
	);
}
