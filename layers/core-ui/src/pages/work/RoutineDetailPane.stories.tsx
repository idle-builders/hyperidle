/**
 * AV4 — RoutineDetailPane stories (design artifacts for the component viewer).
 *
 * @lore AV4: Self-contained — wraps in <MemoryRouter> + <ToastRegion> so the story
 * renders standalone. The in-app /designsystem viewer that once supplied a
 * BrowserRouter ancestor was removed in #404; page stories now self-wrap their
 * Router (matches WorkTask/AgentProfile stories). RoutineDetailPane uses
 * useNavigate (for delete), so a Router ancestor is required.
 */

import type { RoutineDetail } from "@hyperidle/domain-model";
import type { JSX, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { ToastRegion } from "../../shell/ToastRegion.js";
import { RoutineDetailPane } from "./RoutineDetailPane.js";

const noop = (): void => {};

function Wrapper({ children }: { children: ReactNode }): JSX.Element {
	return (
		<MemoryRouter>
			<ToastRegion>{children}</ToastRegion>
		</MemoryRouter>
	);
}

const ROUTINE_DETAIL: RoutineDetail = {
	routine: {
		id: "routine-story-1",
		name: "Daily Digest",
		prompt:
			"Send a daily digest of all team activity to each member. Include bets in progress, completed tasks, and any blockers flagged in the last 24 hours.",
		state: "active",
		triggerType: "calendar",
		triggerConfig: JSON.stringify({ cron: "0 8 * * *" }),
		eventType: null,
		scheduleLabel: "Every day at 8:00 AM",
		ownerAgentId: "agent-1",
		agentName: "Atlas Builder",
		agentInitials: "AB",
		teamId: "team-1",
		teamName: "Build Team",
		autonomyLevel: 2,
		humanReview: false,
		lastRunAt: "2026-01-05T08:00:00.000Z",
		lastRunOutcome: "success",
		nextRunAt: "2026-01-06T08:00:00.000Z",
		createdAt: "2025-12-01T00:00:00.000Z",
		lastRunSummary:
			"Digest sent to 4 team members. Highlighted 2 active bets, 3 completed tasks, and 1 blocker from Atlas Builder.",
		silent: false,
		eventTransitionTo: null,
	},
	runs: [
		{
			id: "run-1",
			startedAt: "2026-01-05T08:00:01.000Z",
			endedAt: "2026-01-05T08:01:30.000Z",
			durationSeconds: 89,
			outcome: "success",
			errorMessage: null,
		},
		{
			id: "run-2",
			startedAt: "2026-01-04T08:00:01.000Z",
			endedAt: "2026-01-04T08:02:10.000Z",
			durationSeconds: 129,
			outcome: "success",
			errorMessage: null,
		},
		{
			id: "run-3",
			startedAt: "2026-01-03T08:00:01.000Z",
			endedAt: "2026-01-03T08:01:00.000Z",
			durationSeconds: 59,
			outcome: "timeout",
			errorMessage: null,
		},
		{
			id: "run-4",
			startedAt: "2026-01-02T08:00:01.000Z",
			endedAt: "2026-01-02T08:00:45.000Z",
			durationSeconds: 44,
			outcome: "error",
			errorMessage: "Connection timeout",
		},
	],
};

const PAUSED_ROUTINE: RoutineDetail = {
	...ROUTINE_DETAIL,
	routine: {
		...ROUTINE_DETAIL.routine,
		state: "paused",
		nextRunAt: null,
	},
};

const EMPTY_RUNS: RoutineDetail = {
	...ROUTINE_DETAIL,
	runs: [],
};

/** BA1 D2/D8/N7 — an event routine: no cron, fires off the platform's event bus. */
const EVENT_TRIGGERED: RoutineDetail = {
	...ROUTINE_DETAIL,
	routine: {
		...ROUTINE_DETAIL.routine,
		triggerType: "event",
		triggerConfig: null,
		eventType: "bet_state_changed",
		scheduleLabel: "On bet state changed",
	},
};

export default { title: "Page: Work/RoutineDetailPane" };

/** Populated state — active routine with runs. */
export const Populated = (): JSX.Element => (
	<Wrapper>
		<div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
			<RoutineDetailPane routineId="routine-story-1" overrideData={ROUTINE_DETAIL} onClose={noop} />
		</div>
	</Wrapper>
);

/** Paused routine — no next run. */
export const Paused = (): JSX.Element => (
	<Wrapper>
		<div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
			<RoutineDetailPane routineId="routine-story-1" overrideData={PAUSED_ROUTINE} onClose={noop} />
		</div>
	</Wrapper>
);

/** No runs yet — empty run history. */
export const NoRuns = (): JSX.Element => (
	<Wrapper>
		<div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
			<RoutineDetailPane routineId="routine-story-1" overrideData={EMPTY_RUNS} onClose={noop} />
		</div>
	</Wrapper>
);

/** Event routine — fires on a platform event, not a schedule. */
export const EventTriggered = (): JSX.Element => (
	<Wrapper>
		<div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
			<RoutineDetailPane
				routineId="routine-story-1"
				overrideData={EVENT_TRIGGERED}
				onClose={noop}
			/>
		</div>
	</Wrapper>
);
