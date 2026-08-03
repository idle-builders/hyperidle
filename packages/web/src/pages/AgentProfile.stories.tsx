/**
 * AB1 — AgentProfile page stories. Renders key states for visual verification.
 *
 * Uses overrideData/overrideLoading/overrideError to inject fixture data
 * without needing a live API. Wrapped in MemoryRouter because the component
 * uses Link and useParams internally.
 */

import type { AgentProfileResponse } from "@hyperidle/shared";
import type { JSX } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

const BASE_PROFILE: AgentProfileResponse = {
	id: "agent-1",
	name: "Atlas Builder",
	role: "builder",
	agentCategory: "team",
	teamName: "HyperIdle Core",
	teamId: "team-1",
	createdAt: "2024-01-15T08:00:00.000Z",
	systemPrompt:
		"You are Atlas, a meticulous TypeScript builder who values clean code, thorough testing, and honest communication. You never ship broken builds.",
	harnessType: "claude-code",
	modelTierPreference: "workhorse",
	maxConcurrentSessions: 2,
	mcpSetup: null,
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
			taskTitle: "Add pagination to knowledge list",
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
	harnessCapabilities: {
		toolUse: true,
		mcpSupport: true,
		fileEditing: true,
		subAgents: true,
	},
	reviewTrackRecord: {
		approvalRate: 0.92,
		totalVerdicts: 34,
		recentVerdicts: [
			{ decision: "approve", threadId: "t-1", createdAt: "2024-06-03T10:45:00.000Z" },
			{ decision: "approve", threadId: "t-2", createdAt: "2024-06-02T14:00:00.000Z" },
			{ decision: "request-changes", threadId: "t-3", createdAt: "2024-06-01T09:00:00.000Z" },
			{ decision: "approve-with-comments", threadId: "t-4", createdAt: "2024-05-30T16:00:00.000Z" },
			{ decision: "approve", threadId: "t-5", createdAt: "2024-05-29T11:00:00.000Z" },
		],
		windowDays: 30,
	},
};

export default { title: "Page: Agents/AgentProfile" };

/** Healthy agent: no active session, no degraded health, skills and activity shown. */
export const Healthy = (): JSX.Element => wrap(<AgentProfile overrideData={BASE_PROFILE} />);

/** Agent with active session — shows active session chip and link. */
export const WithActiveSession = (): JSX.Element =>
	wrap(
		<AgentProfile
			overrideData={{
				...BASE_PROFILE,
				activeSession: {
					sessionId: "sess-active",
					taskId: "task-active",
					betId: "bet-1",
					startedAt: new Date().toISOString(),
				},
				healthSignals: {
					...BASE_PROFILE.healthSignals,
				},
			}}
		/>,
	);

/** Degraded agent — shows health warning banner with role="alert". */
export const Degraded = (): JSX.Element =>
	wrap(
		<AgentProfile
			overrideData={{
				...BASE_PROFILE,
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

/** Agent with no sessions and no reviews yet — empty state rows. */
export const NoHistory = (): JSX.Element =>
	wrap(
		<AgentProfile
			overrideData={{
				...BASE_PROFILE,
				activeSession: null,
				recentSessions: [],
				reviewTrackRecord: {
					approvalRate: 0,
					totalVerdicts: 0,
					recentVerdicts: [],
					windowDays: 30,
				},
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

/** Agent with no reviews yet — shows "No reviews recorded yet." */
export const NoReviews = (): JSX.Element =>
	wrap(
		<AgentProfile
			overrideData={{
				...BASE_PROFILE,
				reviewTrackRecord: {
					approvalRate: 0,
					totalVerdicts: 0,
					recentVerdicts: [],
					windowDays: 30,
				},
			}}
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
			overrideData={{
				...BASE_PROFILE,
				name: "Scout Strategy",
				role: "scout",
				agentCategory: "strategy",
				teamName: null,
				teamId: null,
				harnessCapabilities: {
					toolUse: false,
					mcpSupport: false,
					fileEditing: false,
					subAgents: false,
				},
			}}
		/>,
	);
