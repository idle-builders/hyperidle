/**
 * useTaskSessions — a task's agent runs, read from the Layer that owns them.
 *
 * @lore W3: Created for the task detail page (AC-29).
 *
 * @lore AU26 J4: this used to fetch `GET /api/tasks/:id/sessions` — a core-api
 * route whose entire payload was agent-run data. That route is deleted. Founder
 * ruling: *"orchestration now has an api so that the ui can get the agent run
 * state from the orchestration directly and combine this information in the ui
 * instead of in the core api service."* The hook now calls
 * `GET /api/agent-orchestration/runs?task_id=…` and does the same mapping the
 * route used to do — including the `Session N` numbering, which needs
 * OLDEST-first order (the run read serves newest-first, so the list is
 * reversed). `WorkTask.tsx` and `TaskSheet.tsx` render exactly what they did.
 *
 * @lore AU21 Increment 14a: `cost` field deleted along with the rest of the cost
 * feature. `harnessUrl`/`tokens` remain genuinely unserved (no source anywhere).
 */

import type { AgentRunSummary } from "@hyperidle/domain-model";
import { useEffect, useState } from "react";
import { fetchRunsByTaskId } from "../services/agent-runs.js";
import { absoluteDate } from "../utils/time.js";
import type { FetchState } from "./useFetch.js";

export interface TaskSession {
	id: string;
	title: string;
	agent: string;
	tokens: number | null;
	status: string;
	harnessUrl: string | null;
	/** AC1: Session effectiveness score. Float 0-1, or null when not evaluated. */
	effectivenessScore?: number | null;
}

export interface TaskSessionsData {
	sessions: TaskSession[];
}

/** The exact projection `GET /api/tasks/:id/sessions` used to return. */
function toTaskSessions(runs: ReadonlyArray<AgentRunSummary>): TaskSession[] {
	// The run read is newest-first; the list is rendered and numbered oldest-first.
	const oldestFirst = [...runs].reverse();
	return oldestFirst.map((run) => ({
		id: run.id,
		// UI-036: date-based title instead of "Session N" ordinal
		title: absoluteDate(run.startedAt),
		// UI-035: agentId is an internal id — show generic label until agent
		// names are available from a parallel fetch (no /api/agents call here yet)
		agent: "Agent",
		tokens: null,
		// @lore AF12: state-based contract — the frontend keys the live dot off
		// status === 'active'. Use `state` (not `outcome`) so a cascade-stopped
		// session renders 'stopped' via the raw-status fallback, never blank.
		status: run.state ?? "",
		harnessUrl: null,
		effectivenessScore:
			run.effectivenessScore != null && !Number.isNaN(Number.parseFloat(run.effectivenessScore))
				? Number.parseFloat(run.effectivenessScore)
				: null,
	}));
}

export function useTaskSessions(taskId: string | undefined): FetchState<TaskSessionsData> {
	const [state, setState] = useState<FetchState<TaskSessionsData>>({
		data: null,
		error: null,
		isLoading: taskId !== undefined,
	});

	useEffect(() => {
		if (taskId === undefined) {
			setState({ data: null, error: null, isLoading: false });
			return;
		}
		let cancelled = false;
		setState({ data: null, error: null, isLoading: true });
		fetchRunsByTaskId(taskId)
			.then((runs) => {
				if (!cancelled) {
					setState({ data: { sessions: toTaskSessions(runs) }, error: null, isLoading: false });
				}
			})
			.catch((cause: unknown) => {
				if (!cancelled) {
					setState({
						data: null,
						error: cause instanceof Error ? cause.message : String(cause),
						isLoading: false,
					});
				}
			});
		return () => {
			cancelled = true;
		};
	}, [taskId]);

	return state;
}
