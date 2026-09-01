/**
 * WorkOverview — AD9: Work landing page replacing WorkPortfolio.
 *
 * Flat, attention-sorted team list — one row per team with status chip + active-bet count.
 * Mirrors the Conversations/Knowledge overview frame.
 *
 * Split in two:
 *   - WorkOverviewView — presentational, state-driven (teams | loading | error).
 *     All markup lives here so it can render every state from props (stories).
 *   - WorkOverview     — thin data wrapper: useTeams() + the 1-team <Navigate>
 *     short-circuit + useNavigate() routing. Delegates rendering to the view.
 *
 * State contract (in order):
 *   loading        → SkeletonList(rows=4)
 *   error          → ErrorState("Couldn't load teams")
 *   1 team         → <Navigate to="/work/team/:id" replace>    ← AC11 single chokepoint
 *   0 teams        → EmptyState (finish setup)
 *   2+ teams       → attention-sorted ItemList of Rows
 *
 * @lore AD9: The 1-team branch is THE single chokepoint for the AD3 "skip the
 * overview at 1 team" rule + spec scenarios 1 & 3. Every entry path
 * (post-setup landing, /work/portfolio redirect, bookmarked /work) flows
 * through /work → here; redirect sites stay unconditional → /work.
 *
 * @lore AD9: WorkOverviewView is presentational so WorkOverview.stories.tsx can
 * render the loading/error/empty/populated states live in the component viewer
 * without a backend or router-fetch stubbing. The view takes onSelectTeam /
 * onNewBet callbacks; the wrapper supplies navigate().
 */

import type { TeamListItem } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
	Button,
	EmptyState,
	ErrorState,
	ItemList,
	PageHeader,
	PageScaffold,
	Row,
	SkeletonList,
	StatusChip,
} from "../ds";
import { useTeams } from "../hooks/useTeams.js";
import { sortTeamsByAttention } from "./work/sortTeamsByAttention.js";

export interface WorkOverviewViewProps {
	/** Teams to render. Already includes the full TeamListItem shape; sorting happens here. */
	teams: readonly TeamListItem[];
	loading: boolean;
	/** Non-null when the teams fetch failed. */
	error: Error | null;
	/** Invoked with a team id when a row is activated. */
	onSelectTeam: (teamId: string) => void;
	/** Invoked when the header "New task" button is pressed. */
	onNewBet: () => void;
	/** Invoked when the empty state's "Finish setup" action is pressed. */
	onFinishSetup: () => void;
	/**
	 * Retry callback — wired to ErrorState.onRetry (AC4 spec §3).
	 * Triggers a fresh /api/teams fetch without a full page reload.
	 */
	onRetry: () => void;
}

/**
 * Presentational Work overview. Renders one of: loading / error / empty / populated.
 * Holds zero data-fetching or router logic — every state is driven by props so the
 * story (and tests) can exercise each branch directly.
 *
 * Note: the 1-team short-circuit is NOT here — it is a navigation concern owned by
 * the WorkOverview wrapper. A 1-team list never reaches the view.
 */
export function WorkOverviewView({
	teams,
	loading,
	error,
	onSelectTeam,
	onNewBet,
	onFinishSetup,
	onRetry,
}: WorkOverviewViewProps): JSX.Element {
	// Loading state
	if (loading) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Teams" />}
				data-testid="work-overview-page-loading"
			>
				{/* AD9: pt-[18px] (--space-6) loading gap so first skeleton bar clears the header border-b */}
				<div className="max-w-[800px] w-full pt-[18px]">
					<SkeletonList rows={4} ariaLabel="Loading teams" />
				</div>
			</PageScaffold>
		);
	}

	// Error state — W3: render static user-facing copy only; error.message stays off the screen.
	if (error) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Teams" />}
				data-testid="work-overview-page-error"
			>
				<ErrorState
					title="Couldn't load teams"
					description="Check your connection and try again."
					onRetry={onRetry}
				/>
			</PageScaffold>
		);
	}

	// Empty state (0 teams — defensive; FirstRunRedirect normally routes to /setup)
	if (teams.length === 0) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Teams" />}
				data-testid="work-overview-page-empty"
			>
				<EmptyState
					title="No teams yet"
					description="Teams group your agents and tasks. Finish setup to create your first team."
					action={
						<Button variant="primary" size="sm" onClick={onFinishSetup}>
							Finish setup
						</Button>
					}
				/>
			</PageScaffold>
		);
	}

	// Populated: attention-sorted list
	const sorted = sortTeamsByAttention(teams);

	return (
		<PageScaffold
			frame="page"
			header={
				<PageHeader
					title="Teams"
					subtitle={
						<span className="type-small  text-[var(--text-tertiary)]">
							{teams.length} {teams.length === 1 ? "team" : "teams"}
						</span>
					}
					actions={
						<Button variant="primary" size="sm" onClick={onNewBet}>
							New task
						</Button>
					}
				/>
			}
			data-testid="work-overview-page"
		>
			<div className="max-w-[800px] w-full">
				<ItemList variant="flush" as="ul" isEmpty={false}>
					{sorted.map((team) => {
						// @lore BB1: activeBets→tasksInProgress on TeamListItem
						const taskCount = team.tasksInProgress;
						const taskLabel = `${taskCount} active ${taskCount === 1 ? "task" : "tasks"}`;
						return (
							<Row
								key={team.id}
								as="li"
								data-testid="team-row"
								title={team.name}
								cells={[
									{
										// AD9: Active-task count as a numeric end cell (tabular-nums),
										// placed BEFORE the StatusChip. Row reads:
										// [name .......... N active tasks] [StatusChip]
										content: taskLabel,
										align: "end" as const,
										numeric: true,
										"data-testid": "team-active-tasks",
									},
									{
										content: <StatusChip status={team.status} />,
										align: "end" as const,
									},
								]}
								onClick={() => onSelectTeam(team.id)}
							/>
						);
					})}
				</ItemList>
			</div>
		</PageScaffold>
	);
}

/**
 * Data wrapper: fetches teams, applies the 1-team short-circuit, wires navigation,
 * and delegates rendering to WorkOverviewView.
 */
export function WorkOverview(): JSX.Element {
	const navigate = useNavigate();
	const { data, loading, error, refetch } = useTeams();
	const teams = data?.teams ?? [];

	// AC11: 1-team short-circuit — single chokepoint, never shows a 1-row list.
	// Done before delegating to the view (a navigation concern, not a render state).
	if (!(loading || error) && teams.length === 1 && teams[0]) {
		return <Navigate to={`/work/team/${encodeURIComponent(teams[0].id)}`} replace />;
	}

	return (
		<WorkOverviewView
			teams={teams}
			loading={loading}
			error={error}
			onRetry={refetch}
			onSelectTeam={(teamId) => navigate(`/work/team/${encodeURIComponent(teamId)}`)}
			onNewBet={() => navigate("/work/task/new")}
			onFinishSetup={() => navigate("/setup")}
		/>
	);
}
