/**
 * AA1 — WorkRoutine page stories. Renders key states for visual verification.
 */

import type { RoutineDetail } from "@hyperidle/domain-model";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WorkRoutine } from "./WorkRoutine";

// AJ6 W5: area-less title — no "Page: Area/*" prefix, no area subdir.
// Requires explicit meta.group; Work is the correct domain.
export default { title: "WorkRoutine", group: "Work" as const };

const MOCK_DETAIL: RoutineDetail = {
	routine: {
		id: "routine-1",
		name: "Daily digest",
		description: "Sends a daily summary to the team",
		state: "active",
		triggerType: "calendar",
		triggerConfig: JSON.stringify({ cron: "0 8 * * *" }),
		scheduleLabel: "Every day at 8:00 AM",
		ownerAgentId: "agent-1",
		// @lore AD8a: display name changed from "Chief of Staff" to "System Agent".
		agentName: "System Agent",
		agentInitials: "SA",
		teamId: "team-1",
		teamName: "HyperIdle Core",
		autonomyLevel: 2,
		humanReview: false,
		delegationAllowed: false,
		lastRunAt: "2026-01-01T08:00:00.000Z",
		lastRunOutcome: "success",
		nextRunAt: "2026-01-02T08:00:00.000Z",
		createdAt: null,
		lastRunSummary: null,
		silent: false,
	},
	runs: [
		{
			id: "run-1",
			startedAt: "2026-01-01T08:00:00.000Z",
			endedAt: "2026-01-01T08:01:30.000Z",
			durationSeconds: 90,
			outcome: "success",
			errorMessage: null,
		},
		{
			id: "run-2",
			startedAt: "2025-12-31T08:00:00.000Z",
			endedAt: "2025-12-31T08:01:00.000Z",
			durationSeconds: 60,
			outcome: "error",
			errorMessage: "Connection timeout",
		},
	],
};

function Wrapper({ children }: { children: React.ReactNode }) {
	return (
		<MemoryRouter initialEntries={["/work/routine/routine-1"]}>
			<Routes>
				<Route path="/work/routine/:routineId" element={<>{children}</>} />
			</Routes>
		</MemoryRouter>
	);
}

export function Active() {
	return (
		<Wrapper>
			<WorkRoutine overrideData={MOCK_DETAIL} overrideLoading={false} />
		</Wrapper>
	);
}

export function Paused() {
	return (
		<Wrapper>
			<WorkRoutine
				overrideData={{
					...MOCK_DETAIL,
					routine: { ...MOCK_DETAIL.routine, state: "paused", lastRunOutcome: null },
				}}
				overrideLoading={false}
			/>
		</Wrapper>
	);
}

export function ErrorRoutine() {
	return (
		<Wrapper>
			<WorkRoutine
				overrideData={{
					...MOCK_DETAIL,
					routine: { ...MOCK_DETAIL.routine, state: "error", lastRunOutcome: "error" },
				}}
				overrideLoading={false}
			/>
		</Wrapper>
	);
}

export function EmptyRuns() {
	return (
		<Wrapper>
			<WorkRoutine overrideData={{ ...MOCK_DETAIL, runs: [] }} overrideLoading={false} />
		</Wrapper>
	);
}

export function Loading() {
	return (
		<Wrapper>
			<WorkRoutine overrideLoading={true} />
		</Wrapper>
	);
}

export function NotFound() {
	return (
		<Wrapper>
			<WorkRoutine overrideData={null} overrideLoading={false} />
		</Wrapper>
	);
}
