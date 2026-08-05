/**
 * AA1 — WorkRoutine detail page: shows a single routine's config and run history.
 * AA2 — Adds delete button with inline confirmation, created, last run summary.
 * AV4 — Delegates body to shared RoutineDetailPane (de-greyed, editable prompt).
 *
 * Layout:
 *   PageHeader+Breadcrumb scaffold (loading/error/not-found handled here)
 *   RoutineDetailPane (de-greyed sections, editable form, run history)
 *
 * @lore AA1: This page is addressed by routineId. The route is
 * /work/routine/:routineId. Data is fetched via useRoutine hook.
 * @lore AV4: WorkRoutine now delegates its body to RoutineDetailPane (shared with
 * the WorkTeam split-pane destination). Deep-link durability preserved via this
 * page scaffold; de-greying and editable form live once in RoutineDetailPane.
 * WorkRoutineLoaded, BudgetSection, RunRow removed — all logic now in RoutineDetailPane.
 */

import {
	Breadcrumb,
	EmptyState,
	ErrorState,
	PageHeader,
	SkeletonCard,
} from "@hyperidle/design-system";
import type { RoutineDetail } from "@hyperidle/shared";
import type { JSX } from "react";
import { Link as RRLink, useNavigate, useParams } from "react-router-dom";
import { useRoutine } from "../hooks/useRoutine.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";
import { RoutineDetailPane } from "./work/RoutineDetailPane.js";

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
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();

	// Only call useRoutine when there is no override
	const fetched = useRoutine(overrideData !== undefined ? undefined : routineId);

	const error = overrideError !== undefined ? (overrideError ?? null) : fetched.error;
	const data = overrideData !== undefined ? overrideData : (fetched.data as RoutineDetail | null);
	const loading = overrideLoading === true || (overrideData === undefined && fetched.loading);

	if (loading) {
		return (
			<div className="flex flex-col h-full" data-testid="work-routine-loading">
				<PageHeader title="Routine" />
				<div className="flex-1 overflow-y-auto">
					<div className="flex flex-col gap-[12px] p-[24px]">
						<SkeletonCard ariaLabel="Loading routine header" />
						<SkeletonCard ariaLabel="Loading run history" />
					</div>
				</div>
			</div>
		);
	}

	if (error !== null && error !== undefined) {
		return (
			<div className="flex flex-col h-full" data-testid="work-routine-error">
				<PageHeader title="Routine" />
				<div className="flex-1 overflow-y-auto p-[24px]">
					<ErrorState title="Failed to load routine" description={error.message} />
				</div>
			</div>
		);
	}

	if (data === null) {
		return (
			<div className="flex flex-col h-full" data-testid="work-routine-not-found">
				<PageHeader title="Routine" />
				<div className="flex-1 overflow-y-auto p-[24px]">
					<EmptyState
						title="Routine not found"
						description="This routine does not exist or has been removed."
					/>
				</div>
			</div>
		);
	}

	const routineName = data.routine.name;
	const routineTeamName = data.routine.teamName ?? null;

	return (
		<div className="flex flex-col h-full" data-testid="work-routine-page">
			{/* AI7: PageHeader owns the pinned title strip. */}
			<PageHeader
				title={routineName}
				leading={
					/* AG4: DS Breadcrumb — routine-breadcrumb-back testId preserved on first segment */
					<Breadcrumb
						segments={[
							{ label: "Work", to: "/work", testId: "routine-breadcrumb-back" },
							...(routineTeamName ? [{ label: routineTeamName }] : []),
							{ label: routineName },
						]}
						leading={
							!sidebarMobile ? (
								<NavHistoryCluster onBack={() => navigate(-1)} onForward={() => navigate(1)} />
							) : undefined
						}
						LinkComponent={RRLink}
					/>
				}
			/>
			{/* AV4: body delegates to shared RoutineDetailPane (de-greyed, editable). */}
			<div className="flex-1 overflow-hidden">
				<RoutineDetailPane routineId={routineId ?? ""} overrideData={overrideData} />
			</div>
		</div>
	);
}
