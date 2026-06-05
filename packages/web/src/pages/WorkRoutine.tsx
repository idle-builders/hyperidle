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
	KeyValue,
	routineStateToStatus,
	SkeletonCard,
	StatusChip,
} from "@hyperidle/design-system";
import type { RoutineDetail, RoutineRunSummary } from "@hyperidle/shared";
import { formatMoney } from "@hyperidle/shared";
import { type JSX, useState } from "react";
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

	// Local state for optimistic state toggle (Pause/Resume)
	const [currentState, setCurrentState] = useState(routine.state);
	const [actionPending, setActionPending] = useState(false);

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
			? `${new Date(routine.lastRunAt).toLocaleString()}${routine.lastRunOutcome ? ` — ${routine.lastRunOutcome}` : ""}`
			: "Never";

	return (
		<div className="flex flex-col gap-[12px] h-full" data-testid="work-routine-page">
			{/* Breadcrumb: <- Portfolio / {team} / {routine.name} */}
			<section aria-label="Routine header">
				<div className="mb-1">
					<Link
						to="/work/portfolio"
						data-testid="routine-breadcrumb-back"
						className="btn btn-ghost btn-xs"
					>
						← Portfolio
					</Link>
					{routine.teamName && (
						<span className="text-xs text-[var(--text-tertiary)] ml-1">/ {routine.teamName}</span>
					)}
					<span className="text-xs text-[var(--text-tertiary)] ml-1">/ {routine.name}</span>
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

				{/* KV grid — 2 columns, gap-[9px_18px] per approved design */}
				<div className="flex flex-col gap-[9px]">
					<KeyValue label="Agent" value={routine.agentName} />
					<KeyValue label="Schedule" value={routine.scheduleLabel} />
					<KeyValue label="Trigger type" value={routine.triggerType} />
					<KeyValue label="Autonomy level" value={autonomyLabel} />
					<KeyValue
						label="Next run"
						value={
							routine.nextRunAt ? new Date(routine.nextRunAt).toLocaleString() : "On next event"
						}
					/>
					<KeyValue
						label="Cumulative cost"
						value={routine.costActual ? formatMoney(routine.costActual) : "—"}
					/>
					<KeyValue label="Last run" value={lastRunLabel} />
					{routine.createdAt && (
						<KeyValue label="Created" value={new Date(routine.createdAt).toLocaleDateString()} />
					)}
				</div>

				{/* Action buttons at bottom of config section */}
				<div className="flex gap-[9px] mt-[18px]" data-testid="routine-actions">
					<button
						type="button"
						className="btn btn-ghost btn-sm"
						onClick={handleTogglePause}
						disabled={actionPending}
						data-testid={currentState === "active" ? "routine-pause-btn" : "routine-resume-btn"}
					>
						{currentState === "active" ? "Pause" : "Resume"}
					</button>
					<button
						type="button"
						className="btn btn-primary btn-sm"
						onClick={handleTriggerNow}
						disabled={actionPending}
						data-testid="routine-trigger-now-btn"
					>
						Trigger Now
					</button>
				</div>
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
 * Single run row in the recent-runs table.
 * Columns: time (flex-1) | duration (60px right) | outcome dot (60px center) | cost (60px right)
 */
function RunRow({ run, isLast }: { run: RoutineRunSummary; isLast: boolean }): JSX.Element {
	const dotColor =
		run.outcome === "success"
			? "var(--status-success)"
			: run.outcome === "error"
				? "var(--status-error)"
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
				{new Date(run.startedAt).toLocaleString()}
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
