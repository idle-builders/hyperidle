/**
 * Stories for the AD9 Work overview — the team-list landing that replaces the
 * all-bets portfolio grid.
 *
 * Renders the four states of WorkOverviewView (the presentational half of
 * WorkOverview) live in the component viewer (:8098) so the founder can review
 * the chosen design (Variant A frame + B's attention-sort) on real DS components:
 *
 *   Populated — 3 teams, attention-sorted (blocked → healthy, name asc)
 *   Loading   — SkeletonList(rows=4)
 *   Error     — ErrorState("Couldn't load teams")
 *   Empty     — EmptyState("No teams yet")
 *
 * The 1-team short-circuit (<Navigate>) is a wrapper concern and never reaches
 * the view, so it is intentionally NOT a story state.
 *
 * @lore AD9: stories render WorkOverviewView (props-driven) — not WorkOverview
 * (hook + router) — so each state renders with no backend and no fetch stubbing.
 */

import type { TeamsListItem } from "../hooks/useTeams.js";
import { WorkOverviewView } from "./WorkOverview";

export default { title: "Page: Work/Overview", tier: "3" as const };

// ---------------------------------------------------------------------------
// Fixtures — the full TeamsListItem shape. The view sorts internally, so
// order here is the pre-sort (insertion) order to prove the attention-sort
// visibly reorders.
// ---------------------------------------------------------------------------

function team(
	id: string,
	name: string,
	status: TeamsListItem["status"],
	tasksInProgress: number,
): TeamsListItem {
	return { id, name, status, tasksInProgress };
}

// Insertion order is deliberately NOT attention-order so the rendered list
// proves the sort: Core Platform (blocked) → Content, Design Studio
// (healthy, name asc).
const TEAMS: TeamsListItem[] = [
	team("t-design", "Design Studio", "healthy", 1),
	team("t-core", "Core Platform", "blocked", 2),
	team("t-content", "Content", "healthy", 0),
];

const noop = (): void => {};

// ---------------------------------------------------------------------------
// Populated — the key state the founder reviews.
// ---------------------------------------------------------------------------

export const Populated = (): React.JSX.Element => (
	<div style={{ height: 520 }}>
		<WorkOverviewView
			teams={TEAMS}
			loading={false}
			error={null}
			onSelectTeam={noop}
			onNewBet={noop}
			onFinishSetup={noop}
			onRetry={noop}
		/>
	</div>
);
Populated.storyName = "Populated (4 teams, attention-sorted)";

// ---------------------------------------------------------------------------
// Loading — SkeletonList placeholder.
// ---------------------------------------------------------------------------

export const Loading = (): React.JSX.Element => (
	<div style={{ height: 520 }}>
		<WorkOverviewView
			teams={[]}
			loading={true}
			error={null}
			onSelectTeam={noop}
			onNewBet={noop}
			onFinishSetup={noop}
			onRetry={noop}
		/>
	</div>
);

// ---------------------------------------------------------------------------
// Error — fetch failure.
// ---------------------------------------------------------------------------

export const ErrorStateStory = (): React.JSX.Element => (
	<div style={{ height: 520 }}>
		<WorkOverviewView
			teams={[]}
			loading={false}
			error={new Error("Network request failed")}
			onSelectTeam={noop}
			onNewBet={noop}
			onFinishSetup={noop}
			onRetry={noop}
		/>
	</div>
);
ErrorStateStory.storyName = "Error";

// ---------------------------------------------------------------------------
// Empty — 0 teams (defensive; setup normally precedes this).
// ---------------------------------------------------------------------------

export const Empty = (): React.JSX.Element => (
	<div style={{ height: 520 }}>
		<WorkOverviewView
			teams={[]}
			loading={false}
			error={null}
			onSelectTeam={noop}
			onNewBet={noop}
			onFinishSetup={noop}
			onRetry={noop}
		/>
	</div>
);
