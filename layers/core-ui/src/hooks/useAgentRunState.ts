/**
 * Agent run state, read through the session action list and combined with
 * core's own data in the browser.
 *
 * @lore AU26 J4 (founder, verbatim): *"its all for UI? thats why orchestration
 * now has an api so that the ui can get the agent run state from the
 * orchestration directly and combine this information in the ui instead of in
 * the core api service."*
 *
 * @lore `GET /api/agent-orchestration/runs?agent_ids=…` is deleted along
 * with the rest of the run-read routes. Both hooks now
 * call `search_sessions({ agentIds })` — `POST /api/actions/search_sessions`,
 * the same door a person's client and an agent's MCP tool use.
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
 * `deriveHealthDetail` the routes used, now in `@hyperidle/domain-model`, over the
 * same session rows — so both screens render exactly what they rendered before.
 * `harnessAvailable` still comes from core-api (it is a fact about the server's
 * adapter pool, not run state) and is fed straight back in as the one input the
 * browser cannot compute.
 */

import type { AgentHealthLevel, AgentOperationalStatus, SessionRow } from "@hyperidle/domain-model";
import { useEffect, useMemo, useRef, useState } from "react";
import { call } from "../services/call.js";
import type {
	AgentActiveSession,
	AgentHealthSignals,
	AgentPerformanceStats,
	AgentSessionSummary,
} from "./agent-health.js";
import { computeHealthSignals, deriveHealthDetail, deriveHealthLevel } from "./agent-health.js";

/**
 * Where a screen's run state is in its fetch.
 *
 * @lore AU26 review W5/W6: the first cut of these hooks had neither. Seeded
 * empty and swallowing every failure, they painted "0 sessions · 0% success ·
 * idle" and a healthy roster BEFORE the second round-trip landed, and left
 * exactly that on screen forever if the read failed — a crashed agent rendered
 * as healthy, with no toast, no chip, no console. The health banner is a safety
 * signal; failing it open silently is worse than failing it closed. Callers
 * distinguish the three states and say which one they are in.
 */
export type RunStateStatus = "loading" | "ready" | "error";

/**
 * `search_sessions` defaults to 100 with no `limit` set; the old route had no
 * cap at all — a health window needs every run. 500 (the action's max) is
 * the closest this read can get to "every one" under the new contract.
 */
const MAX_SESSIONS = 500;

/** Every session for the given agents, newest first across all of them. */
async function fetchSessionsByAgentIds(
	agentIds: ReadonlyArray<string>,
	signal: AbortSignal,
): Promise<ReadonlyArray<SessionRow>> {
	if (agentIds.length === 0) return [];
	const result = await call(
		"search_sessions",
		{ agentIds: [...agentIds], limit: MAX_SESSIONS },
		signal,
	);
	if (!result.ok) throw new Error(result.problems[0]?.message ?? "search_sessions failed");
	return result.data;
}

/** The subset of a task the run-state renders need. Both fields are core's. */
interface TaskRef {
	readonly title: string;
	// @lore BB1: betId removed — tasks link directly via /work/task/:taskId
}

/**
 * Resolve N task titles in ONE request.
 *
 * @lore AU26 review W4: this was `GET /api/tasks/:id` per task — the exact N+1
 * `@lore AB1 S2` had removed server-side ("Replaced N+1 pattern (one query per
 * session) with a single Drizzle query that JOINs sessions with tasks"), moved
 * into the browser by the J4 composition. `search_tasks`'s `ids` filter
 * batches it back.
 */
async function fetchTaskRefs(
	taskIds: ReadonlyArray<string>,
	signal: AbortSignal,
): Promise<Map<string, TaskRef>> {
	const refs = new Map<string, TaskRef>();
	const unique = [...new Set(taskIds)];
	if (unique.length === 0) return refs;

	const result = await call("search_tasks", { ids: unique }, signal);
	if (!result.ok) throw new Error(result.problems[0]?.message ?? "search_tasks failed");
	for (const row of result.data) {
		refs.set(row.id, { title: row.title });
	}
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
	// @lore BB1: activeBetId removed — use activeTaskId + /work/task/:taskId
}

export interface RosterMemberRef {
	readonly agentId: string;
	/** From core-api's roster. Absent is treated as available, as it was server-side. */
	readonly harnessAvailable?: boolean;
}

/** The roster's run state plus where the fetch is (see `RunStateStatus`). */
export interface RosterRunStateResult {
	readonly byAgent: ReadonlyMap<string, RosterRunState>;
	readonly status: RunStateStatus;
}

/**
 * Run state for every roster member, keyed by agent id. Members with no run
 * resolve to idle/healthy — the same defaults the route produced. `status` says
 * whether that map is fact yet: on `"error"` the caller must not present the
 * defaults as health (review W6).
 */
export function useRosterRunState(members: ReadonlyArray<RosterMemberRef>): RosterRunStateResult {
	const [state, setState] = useState<ReadonlyMap<string, RosterRunState>>(new Map());
	const [status, setStatus] = useState<RunStateStatus>(members.length === 0 ? "ready" : "loading");
	// The caller may hand a fresh array each render; key the effect on content.
	const idsKey = useMemo(
		() => members.map((m) => `${m.agentId}:${m.harnessAvailable !== false}`).join(","),
		[members],
	);
	const membersRef = useRef(members);
	membersRef.current = members;

	// idsKey is the content-stable key for `members`; membersRef holds the latest
	// array so the effect body reads current data without depending on `members`
	// itself (a fresh array identity every render would thrash the fetch).
	// biome-ignore lint/correctness/useExhaustiveDependencies: idsKey is a deliberate trigger-only dep — it is never read in the body, only compared for change; that is the point of the ref indirection above.
	useEffect(() => {
		const members = membersRef.current;
		if (members.length === 0) {
			setState(new Map());
			setStatus("ready");
			return;
		}
		setStatus("loading");
		const ac = new AbortController();
		(async () => {
			const runs = await fetchSessionsByAgentIds(
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
					// @lore BB1: activeBetId removed
				});
			}
			setState(next);
			setStatus("ready");
		})().catch(() => {
			// A run-state failure must never blank the roster — the members, their
			// names and their roles are core's data and already rendered. But it must
			// not be mistaken for "everyone is healthy and idle" either (review W6):
			// the map empties AND the status says so, so the roster can render an
			// unknown-health row instead of a green dot.
			if (!ac.signal.aborted) {
				setState(new Map());
				setStatus("error");
			}
		});
		return () => ac.abort();
	}, [idsKey]);

	return { byAgent: state, status };
}

/** The defaults a member with no fetched run state renders — idle and healthy. */
export const DEFAULT_ROSTER_RUN_STATE: RosterRunState = {
	operationalStatus: "idle",
	healthLevel: "healthy",
	healthDetail: "Healthy",
	activeTaskTitle: null,
	activeTaskId: null,
	// @lore BB1: activeBetId removed
};

// ---------------------------------------------------------------------------
// Agent profile
// ---------------------------------------------------------------------------

/**
 * Exactly the four blocks core-api used to serve on `AgentProfileResponse`,
 * plus where the fetch is: `status` is `"ready"` only when these four are fact
 * (review W5/W6).
 */
export interface AgentRunState {
	readonly activeSession: AgentActiveSession | null;
	readonly recentSessions: ReadonlyArray<AgentSessionSummary>;
	readonly performance: AgentPerformanceStats;
	readonly healthSignals: AgentHealthSignals;
	readonly status: RunStateStatus;
}

function emptyAgentRunState(harnessAvailable: boolean, status: RunStateStatus): AgentRunState {
	return {
		activeSession: null,
		recentSessions: [],
		performance: { totalSessions: 0, successCount: 0, successRate: 0 },
		healthSignals: computeHealthSignals({ sessions: [], harnessAvailable }),
		status,
	};
}

/**
 * Run state for one agent. `harnessAvailable` comes from the profile response —
 * it is the one health input the browser cannot compute for itself.
 */
export function useAgentRunState(agentId: string | null, harnessAvailable: boolean): AgentRunState {
	const [state, setState] = useState<AgentRunState>(() =>
		emptyAgentRunState(harnessAvailable, agentId === null ? "ready" : "loading"),
	);

	useEffect(() => {
		if (agentId === null) {
			setState(emptyAgentRunState(harnessAvailable, "ready"));
			return;
		}
		setState((prev) => (prev.status === "loading" ? prev : { ...prev, status: "loading" }));
		const ac = new AbortController();
		(async () => {
			const runs = await fetchSessionsByAgentIds([agentId], ac.signal);
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
								// @lore BB1: betId removed from session nav
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
				status: "ready",
			});
		})().catch(() => {
			// Same reasoning as the roster: identity and config are already rendered
			// from core's response, so the page stays up. What must NOT happen is the
			// page claiming health it does not have (review W6) — `status: "error"` is
			// what the profile renders its "run state unavailable" alert from, in
			// place of the health banner it can no longer compute.
			if (!ac.signal.aborted) setState(emptyAgentRunState(harnessAvailable, "error"));
		});
		return () => ac.abort();
	}, [agentId, harnessAvailable]);

	return state;
}

function groupByAgent(runs: ReadonlyArray<SessionRow>): Map<string, ReadonlyArray<SessionRow>> {
	const byAgent = new Map<string, SessionRow[]>();
	for (const run of runs) {
		const bucket = byAgent.get(run.agentId) ?? [];
		bucket.push(run);
		byAgent.set(run.agentId, bucket);
	}
	return byAgent;
}
