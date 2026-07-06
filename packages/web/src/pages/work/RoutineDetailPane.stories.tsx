/**
 * AV4 — RoutineDetailPane stories.
 * Renders key states at /designsystem for visual verification.
 *
 * @lore AV4: Wrapped in <ToastRegion> only (not MemoryRouter) — the /designsystem
 * route already runs inside the app's BrowserRouter. Adding a second Router
 * causes "cannot render Router inside another Router" crash.
 * RoutineDetailPane uses useNavigate (for delete). This is safe since BrowserRouter
 * is the ancestor when /designsystem is the active route.
 */

import type { RoutineDetail } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { ToastRegion } from "../../shell/ToastRegion.js";
import { RoutineDetailPane } from "./RoutineDetailPane.js";

const noop = (): void => {};

function Wrapper({ children }: { children: ReactNode }): JSX.Element {
	return <ToastRegion>{children}</ToastRegion>;
}

const ROUTINE_DETAIL: RoutineDetail = {
	routine: {
		id: "routine-story-1",
		name: "Daily Digest",
		description:
			"Send a daily digest of all team activity to each member. Include bets in progress, completed tasks, and any blockers flagged in the last 24 hours.",
		state: "active",
		triggerType: "calendar",
		triggerConfig: JSON.stringify({ cron: "0 8 * * *" }),
		scheduleLabel: "Every day at 8:00 AM",
		ownerAgentId: "agent-1",
		agentName: "Atlas Builder",
		agentInitials: "AB",
		teamId: "team-1",
		teamName: "Build Team",
		autonomyLevel: 2,
		humanReview: false,
		delegationAllowed: false,
		lastRunAt: "2026-01-05T08:00:00.000Z",
		lastRunOutcome: "success",
		nextRunAt: "2026-01-06T08:00:00.000Z",
		costActual: { minor: 750, currency: "USD" },
		createdAt: "2025-12-01T00:00:00.000Z",
		costCapPerRun: { minor: 5000, currency: "USD" },
		costCapMonthly: { minor: 50000, currency: "USD" },
		lastRunSummary:
			"Digest sent to 4 team members. Highlighted 2 active bets, 3 completed tasks, and 1 blocker from Atlas Builder.",
		silent: false,
	},
	budget: {
		avgCostPerRun: { minor: 650, currency: "USD" },
		costThisMonth: { minor: 4550, currency: "USD" },
		costCapPerRun: { minor: 5000, currency: "USD" },
		costCapMonthly: { minor: 50000, currency: "USD" },
		perRunUtilizationPercent: 13,
		monthlyUtilizationPercent: 9,
	},
	runs: [
		{
			id: "run-1",
			startedAt: "2026-01-05T08:00:01.000Z",
			endedAt: "2026-01-05T08:01:30.000Z",
			durationSeconds: 89,
			outcome: "success",
			cost: { minor: 750, currency: "USD" },
			errorMessage: null,
		},
		{
			id: "run-2",
			startedAt: "2026-01-04T08:00:01.000Z",
			endedAt: "2026-01-04T08:02:10.000Z",
			durationSeconds: 129,
			outcome: "success",
			cost: { minor: 620, currency: "USD" },
			errorMessage: null,
		},
		{
			id: "run-3",
			startedAt: "2026-01-03T08:00:01.000Z",
			endedAt: "2026-01-03T08:01:00.000Z",
			durationSeconds: 59,
			outcome: "budget_exhausted",
			cost: { minor: 5000, currency: "USD" },
			errorMessage: null,
		},
		{
			id: "run-4",
			startedAt: "2026-01-02T08:00:01.000Z",
			endedAt: "2026-01-02T08:00:45.000Z",
			durationSeconds: 44,
			outcome: "error",
			cost: null,
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
