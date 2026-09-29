/**
 * AB1 — AgentProfile page stories. Renders key states for visual verification.
 *
 * Uses overrideData/overrideLoading/overrideError to inject fixture data
 * without needing a live API. Wrapped in MemoryRouter because the component
 * uses Link and useParams internally.
 */

import type { JSX } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AgentProfileData } from "../hooks/useAgentProfile.js";
import type { AgentRunState } from "../hooks/useAgentRunState.js";
import { AgentProfile } from "./AgentProfile.js";

function wrap(element: JSX.Element): JSX.Element {
	return (
		<MemoryRouter initialEntries={["/agents/agent-1"]}>
			<Routes>
				<Route path="/agents/:agentId" element={element} />
			</Routes>
		</MemoryRouter>
	);
}

const BASE_PROFILE: AgentProfileData = {
	id: "agent-1",
	name: "Atlas Builder",
	discipline: "builder",
	agentCategory: "team",
	teamName: "HyperIdle Core",
	teamId: "team-1",
	createdAt: "2024-01-15T08:00:00.000Z",
	identityDocumentId: "ki_af_agent-1",
	harnessType: "claude-code",
	maxConcurrentSessions: 2,
	subscriptions: [
		{
			id: "sub-1",
			event: "task.changed",
			schedule: null,
			paused: false,
			documentId: "doc-sub-1",
			nextRunAt: null,
		},
		{
			id: "sub-2",
			event: null,
			schedule: "0 9 * * 1",
			paused: true,
			documentId: null,
			nextRunAt: "2024-06-10T09:00:00.000Z",
		},
	],
	harnessCapabilities: {
		type: "claude-code",
		name: "Claude Code",
		kind: "local",
		authAction: { kind: "native_cli_login", label: "Sign in" },
		discovery: { state: "ready" },
		models: [{ id: "sonnet", label: "Sonnet", selectable: true, options: [] }],
		returnEnforcement: "settings-claude",
		modelProviders: ["anthropic"],
	},
	harnessAvailable: true,
	reviewTrackRecord: {
		approvalRate: 0.86,
		totalVerdicts: 14,
		recentVerdicts: [
			{ decision: "approve", threadId: "thr-1", createdAt: "2024-06-08T10:00:00.000Z" },
			{
				decision: "approve_with_comments",
				threadId: "thr-2",
				createdAt: "2024-06-05T10:00:00.000Z",
			},
		],
		windowDays: 30,
	},
};

const BASE_RUN_STATE: AgentRunState = {
	status: "ready",
	activeSession: null,
	recentSessions: [
		{
			sessionId: "sess-1",
			taskId: "task-1",
			taskTitle: "Implement auth migration",
			outcome: "completed",
			startedAt: "2024-06-01T10:00:00.000Z",
			endedAt: "2024-06-01T11:30:00.000Z",
		},
		{
			sessionId: "sess-2",
			taskId: "task-2",
			taskTitle: "Fix onboarding flow bug",
			outcome: "crashed",
			startedAt: "2024-06-02T14:00:00.000Z",
			endedAt: "2024-06-02T14:05:00.000Z",
		},
		{
			sessionId: "sess-3",
			taskId: "task-3",
			taskTitle: "Add pagination to document list",
			outcome: "completed",
			startedAt: "2024-06-03T09:00:00.000Z",
			endedAt: "2024-06-03T10:45:00.000Z",
		},
	],
	performance: {
		totalSessions: 47,
		successCount: 43,
		successRate: 0.9148,
	},
	healthSignals: {
		failureRate7d: 0.08,
		lastSessionCrashed: false,
		harnessAvailable: true,
		idleDurationMs: 3600000,
		degraded: false,
	},
};

export default { title: "Page: Agents/AgentProfile" };

/** Healthy agent: no active session, no degraded health, skills and activity shown. */
export const Healthy = (): JSX.Element =>
	wrap(<AgentProfile overrideData={BASE_PROFILE} overrideRunState={BASE_RUN_STATE} />);

/** Agent with active session — shows active session chip and link. */
export const WithActiveSession = (): JSX.Element =>
	wrap(
		<AgentProfile
			overrideData={BASE_PROFILE}
			overrideRunState={{
				...BASE_RUN_STATE,
				activeSession: {
					sessionId: "sess-active",
					taskId: "task-active",
					startedAt: new Date().toISOString(),
				},
			}}
		/>,
	);

/**
 * AU26 review W6 — the run read failed. The page must say so rather than paint
 * a healthy, idle agent with 0 sessions: an unavailability alert, "—" for the
 * numbers, and no health banner (there is no health to report).
 */
export const RunStateUnavailable = (): JSX.Element =>
	wrap(
		<AgentProfile
			overrideData={BASE_PROFILE}
			overrideRunState={{
				...BASE_RUN_STATE,
				status: "error",
				activeSession: null,
				recentSessions: [],
				performance: { totalSessions: 0, successCount: 0, successRate: 0 },
			}}
		/>,
	);

/** Degraded agent — shows health warning banner with role="alert". */
export const Degraded = (): JSX.Element =>
	wrap(
		<AgentProfile
			overrideData={BASE_PROFILE}
			overrideRunState={{
				...BASE_RUN_STATE,
				healthSignals: {
					failureRate7d: 0.75,
					lastSessionCrashed: true,
					harnessAvailable: false,
					idleDurationMs: 86400000,
					degraded: true,
				},
			}}
		/>,
	);

/** Agent with no sessions and no subscriptions yet — empty state rows. */
export const NoHistory = (): JSX.Element =>
	wrap(
		<AgentProfile
			overrideData={{ ...BASE_PROFILE, subscriptions: [] }}
			overrideRunState={{
				status: "ready",
				activeSession: null,
				recentSessions: [],
				performance: { totalSessions: 0, successCount: 0, successRate: 0 },
				healthSignals: {
					failureRate7d: 0,
					lastSessionCrashed: false,
					harnessAvailable: true,
					idleDurationMs: null,
					degraded: false,
				},
			}}
		/>,
	);

/** Agent with no subscriptions yet — shows "No subscriptions yet." */
export const NoSubscriptions = (): JSX.Element =>
	wrap(
		<AgentProfile
			overrideRunState={BASE_RUN_STATE}
			overrideData={{ ...BASE_PROFILE, subscriptions: [] }}
		/>,
	);

/** Loading skeleton state. */
export const Loading = (): JSX.Element => wrap(<AgentProfile overrideLoading={true} />);

/** Error state — fetch failed. */
export const FetchError = (): JSX.Element =>
	wrap(<AgentProfile overrideError={new Error("Network request failed: connection refused")} />);

/** 404 state — agent not found. */
export const NotFound = (): JSX.Element =>
	wrap(<AgentProfile overrideError={new Error("Agent profile fetch failed: 404")} />);

/** Strategy agent (no team, shows category tag). */
export const StrategyAgent = (): JSX.Element =>
	wrap(
		<AgentProfile
			overrideRunState={BASE_RUN_STATE}
			overrideData={{
				...BASE_PROFILE,
				name: "Scout Strategy",
				discipline: "scout",
				// @lore: agentCategory — "strategy" is not a valid value; every such row carries "individual".
				agentCategory: "individual",
				teamName: null,
				teamId: null,
			}}
		/>,
	);
