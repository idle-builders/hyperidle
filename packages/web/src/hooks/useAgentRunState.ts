/**
 * Agent run state, fetched from `agent-orchestration` and combined with core's
 * own data in the browser.
 *
 * @lore AU26 J4 (founder, verbatim): *"its all for UI? thats why orchestration
 * now has an api so that the ui can get the agent run state from the
 * orchestration directly and combine this information in the ui instead of in
 * the core api service."*
 *
 * Two consumers, one shape of work:
 *   - `useRosterRunState` — the team page's roster row (status dot, health tone,
 *     the active-task context line). Core-api used to compute all of this in
 *     `GET /api/org/teams/:id`.
 *   - `useAgentRunState` — the agent profile's live chip, recent-runs list,
 *     success rate and degraded-health banner. Core-api used to compute all of
 *     this in `GET /api/agents/:id/profile`.
 *
 * Both derive with the SAME `computeHealthSignals` / `deriveHealthLevel` /
 * `deriveHealthDetail` the routes used, now in `@hyperidle/shared`, over the
 * same run rows — so both screens render exactly what they rendered before.
 * `harnessAvailable` still comes from core-api (it is a fact about the server's
 * adapter pool, not run state) and is fed straight back in as the one input the
 * browser cannot compute.
 */

import type {
	AgentActiveSession,
	AgentHealthLevel,
	AgentHealthSignals,
	AgentOperationalStatus,
	AgentPerformanceStats,
	AgentRunSummary,
	AgentSessionSummary,
} from "@hyperidle/shared";
import { computeHealthSignals, deriveHealthDetail, deriveHealthLevel } from "@hyperidle/shared";
import { useEffect, useMemo, useState } from "react";
import { fetchLatestRunOutcomes, fetchRunsByAgentIds } from "../services/agent-runs.js";
import { apiFetch } from "../services/api-fetch.js";

/** The subset of a task the run-state renders need. Both fields are core's. */
interface TaskRef {
	readonly title: string;
	readonly betId: string | null;
}

async function fetchTaskRefs(
	taskIds: ReadonlyArray<string>,
	signal: AbortSignal,
): Promise<Map<string, TaskRef>> {
	const refs = new Map<string, TaskRef>();
	await Promise.all(
		[...new Set(taskIds)].map(async (taskId) => {
			const res = await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}`, { signal });
			if (!res.ok) return;
			const task = (await res.json()) as { title?: unknown; betId?: unknown };
			refs.set(taskId, {
				title: typeof task.title === "string" ? task.title : taskId,
				betId: typeof task.betId === "string" ? task.betId : null,
			});
		}),
	);
	return refs;
}

// ---------------------------------------------------------------------------
// Team roster
// ---------------------------------------------------------------------------

/** Exactly the six fields core-api used to stamp onto each `RosterMember`. */
export interface RosterRunState {
	readonly operationalStatus: AgentOperationalStatus;
	readonly healthLevel: AgentHealthLevel;
	readonly healthDetail: string;
	readonly activeTaskTitle: string | null;
	readonly activeTaskId: string | null;
	readonly activeBetId: string | null;
}

export interface RosterMemberRef {
	readonly agentId: string;
	/** From core-api's roster. Absent is treated as available, as it was server-side. */
	readonly harnessAvailable?: boolean;
}

/**
 * Run state for every roster member, keyed by agent id. Members with no run
 * resolve to idle/healthy — the same defaults the route produced.
 */
export function useRosterRunState(
	members: ReadonlyArray<RosterMemberRef>,
): ReadonlyMap<string, RosterRunState> {
	const [state, setState] = useState<ReadonlyMap<string, RosterRunState>>(new Map());
	// The caller may hand a fresh array each render; key the effect on content.
	const idsKey = useMemo(
		() => members.map((m) => `${m.agentId}:${m.harnessAvailable !== false}`).join(","),
		[members],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: idsKey is the content-stable key for `members`
	useEffect(() => {
		if (members.length === 0) {
			setState(new Map());
			return;
		}
		const ac = new AbortController();
		(async () => {
			const runs = await fetchRunsByAgentIds(
				members.map((m) => m.agentId),
				ac.signal,
			);
			const byAgent = groupByAgent(runs);
			const activeTaskIds = [...byAgent.values()].flatMap((agentRuns) => {
				const active = agentRuns.find((r) => r.state === "active");
				return active?.taskId ? [active.taskId] : [];
			});
			const taskRefs = await fetchTaskRefs(activeTaskIds, ac.signal);
			if (ac.signal.aborted) return;

			const next = new Map<string, RosterRunState>();
			for (const member of members) {
				const agentRuns = byAgent.get(member.agentId) ?? [];
				const active = agentRuns.find((r) => r.state === "active") ?? null;
				const signals = computeHealthSignals({
					sessions: agentRuns,
					harnessAvailable: member.harnessAvailable !== false,
				});
				const isError = signals.failureRate7d > 0.5 || signals.lastSessionCrashed;
				const activeTask = active?.taskId ? (taskRefs.get(active.taskId) ?? null) : null;
				next.set(member.agentId, {
					operationalStatus: active !== null ? "active" : isError ? "error" : "idle",
					healthLevel: deriveHealthLevel(signals),
					healthDetail: deriveHealthDetail(signals),
					activeTaskTitle: activeTask?.title ?? null,
					activeTaskId: active?.taskId ?? null,
					activeBetId: activeTask?.betId ?? null,
				});
			}
			setState(next);
		})().catch(() => {
			// A run-state fetch failure must never blank the roster — the members,
			// their names and their roles are core's data and already rendered. The
			// defaults below (idle / healthy) are exactly what an agent with no runs
			// showed before.
			if (!ac.signal.aborted) setState(new Map());
		});
		return () => ac.abort();
	}, [idsKey]);

	return state;
}

/** The defaults a member with no fetched run state renders — idle and healthy. */
export const DEFAULT_ROSTER_RUN_STATE: RosterRunState = {
	operationalStatus: "idle",
	healthLevel: "healthy",
	healthDetail: "Healthy",
	activeTaskTitle: null,
	activeTaskId: null,
	activeBetId: null,
};

// ---------------------------------------------------------------------------
// Agent profile
// ---------------------------------------------------------------------------

/** Exactly the four blocks core-api used to serve on `AgentProfileResponse`. */
export interface AgentRunState {
	readonly activeSession: AgentActiveSession | null;
	readonly recentSessions: ReadonlyArray<AgentSessionSummary>;
	readonly performance: AgentPerformanceStats;
	readonly healthSignals: AgentHealthSignals;
}

function emptyAgentRunState(harnessAvailable: boolean): AgentRunState {
	return {
		activeSession: null,
		recentSessions: [],
		performance: { totalSessions: 0, successCount: 0, successRate: 0 },
		healthSignals: computeHealthSignals({ sessions: [], harnessAvailable }),
	};
}

/**
 * Run state for one agent. `harnessAvailable` comes from the profile response —
 * it is the one health input the browser cannot compute for itself.
 */
export function useAgentRunState(agentId: string | null, harnessAvailable: boolean): AgentRunState {
	const [state, setState] = useState<AgentRunState>(() => emptyAgentRunState(harnessAvailable));

	useEffect(() => {
		if (agentId === null) {
			setState(emptyAgentRunState(harnessAvailable));
			return;
		}
		const ac = new AbortController();
		(async () => {
			const runs = await fetchRunsByAgentIds([agentId], ac.signal);
			// The 10 most recent runs drive the recent-runs list; task titles and the
			// active run's bet link are core's data, fetched from core.
			const recent = runs.slice(0, 10);
			const active = runs.find((r) => r.state === "active") ?? null;
			const taskIds = [
				...recent.flatMap((r) => (r.taskId ? [r.taskId] : [])),
				...(active?.taskId ? [active.taskId] : []),
			];
			const taskRefs = await fetchTaskRefs(taskIds, ac.signal);
			if (ac.signal.aborted) return;

			const successCount = runs.filter((r) => r.outcome === "completed").length;
			setState({
				activeSession:
					active?.taskId != null
						? {
								sessionId: active.id,
								taskId: active.taskId,
								// @lore AB1 M1: the bet route expects betId, not taskId.
								betId: taskRefs.get(active.taskId)?.betId ?? "",
								startedAt: active.startedAt,
							}
						: null,
				recentSessions: recent.flatMap((run) =>
					run.taskId
						? [
								{
									sessionId: run.id,
									taskId: run.taskId,
									taskTitle: taskRefs.get(run.taskId)?.title ?? run.taskId,
									outcome: run.outcome,
									startedAt: run.startedAt,
									endedAt: run.endedAt,
								},
							]
						: [],
				),
				performance: {
					totalSessions: runs.length,
					successCount,
					successRate: runs.length > 0 ? successCount / runs.length : 0,
				},
				healthSignals: computeHealthSignals({ sessions: runs, harnessAvailable }),
			});
		})().catch(() => {
			// Same reasoning as the roster: identity and config are already rendered
			// from core's response; a run-state failure degrades to "no runs".
			if (!ac.signal.aborted) setState(emptyAgentRunState(harnessAvailable));
		});
		return () => ac.abort();
	}, [agentId, harnessAvailable]);

	return state;
}

function groupByAgent(
	runs: ReadonlyArray<AgentRunSummary>,
): Map<string, ReadonlyArray<AgentRunSummary>> {
	const byAgent = new Map<string, AgentRunSummary[]>();
	for (const run of runs) {
		const bucket = byAgent.get(run.agentId) ?? [];
		bucket.push(run);
		byAgent.set(run.agentId, bucket);
	}
	return byAgent;
}

// ---------------------------------------------------------------------------
// Bet view
// ---------------------------------------------------------------------------

/**
 * The outcome of the newest run per task, keyed by task id. A task with no run
 * is absent, which callers render as `null` — the exact shape core-api used to
 * serve as `latestSessionOutcome` on `GET /api/bets/:id` (AU26 J4).
 */
export function useLatestRunOutcomes(
	taskIds: ReadonlyArray<string>,
): Readonly<Record<string, string | null>> {
	const [outcomes, setOutcomes] = useState<Readonly<Record<string, string | null>>>({});
	const idsKey = useMemo(() => [...taskIds].join(","), [taskIds]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: idsKey is the content-stable key for `taskIds`
	useEffect(() => {
		if (taskIds.length === 0) {
			setOutcomes({});
			return;
		}
		const ac = new AbortController();
		fetchLatestRunOutcomes(taskIds, ac.signal)
			.then((next) => {
				if (!ac.signal.aborted) setOutcomes(next);
			})
			.catch(() => {
				// The task list is core's data and already rendered; a run-state
				// failure just means no outcome chip, exactly as for a task with no run.
				if (!ac.signal.aborted) setOutcomes({});
			});
		return () => ac.abort();
	}, [idsKey]);

	return outcomes;
}
