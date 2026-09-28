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

export type RunStateStatus = "loading" | "ready" | "error";

const MAX_SESSIONS = 500;

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

interface TaskRef {
	readonly title: string;
}

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

export interface RosterRunState {
	readonly operationalStatus: AgentOperationalStatus;
	readonly healthLevel: AgentHealthLevel;
	readonly healthDetail: string;
	readonly activeTaskTitle: string | null;
	readonly activeTaskId: string | null;
}

export interface RosterMemberRef {
	readonly agentId: string;
	readonly harnessAvailable?: boolean;
}

export interface RosterRunStateResult {
	readonly byAgent: ReadonlyMap<string, RosterRunState>;
	readonly status: RunStateStatus;
}

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
				});
			}
			setState(next);
			setStatus("ready");
		})().catch(() => {
			// run-state failure: empty map + status="error" so roster renders unknown-health, not a false green dot
			if (!ac.signal.aborted) {
				setState(new Map());
				setStatus("error");
			}
		});
		return () => ac.abort();
	}, [idsKey]);

	return { byAgent: state, status };
}

export const DEFAULT_ROSTER_RUN_STATE: RosterRunState = {
	operationalStatus: "idle",
	healthLevel: "healthy",
	healthDetail: "Healthy",
	activeTaskTitle: null,
	activeTaskId: null,
};

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
