/**
 * useTaskSessions — a task's sessions, read through the session action list.
 *
 * @lore `GET /api/tasks/:id/sessions` (later `GET
 * /api/agent-orchestration/runs?task_id=…`) is deleted along with the rest of
 * the run-read routes. The hook now calls
 * `search_sessions({ taskId })` — `POST /api/actions/search_sessions`, the
 * same door a person's client and an agent's MCP tool use — and does the same
 * projection the old route used to do: the `Session N` numbering, which needs
 * OLDEST-first order (the search read serves newest-first, so the list is
 * reversed). `WorkTask.tsx` and `TaskSheet.tsx` render exactly what they did.
 *
 * @lore W3: Created for the task detail page (AC-29).
 *
 * @lore AU21 Increment 14a: `cost` field deleted along with the rest of the cost
 * feature. `harnessUrl`/`tokens` remain genuinely unserved (no source anywhere).
 */

import type { SessionRow } from "@hyperidle/domain-model";
import { useEffect, useState } from "react";
import { call } from "../services/call.js";
import { absoluteDate } from "../utils/time.js";
import type { FetchState } from "./useFetch.js";

export interface TaskSession {
	id: string;
	title: string;
	agent: string;
	tokens: number | null;
	status: string;
	harnessUrl: string | null;
}

export interface TaskSessionsData {
	sessions: TaskSession[];
}

/**
 * `search_sessions` defaults to 100 with no `limit` set; the old route had no
 * cap at all. 500 (the action's max) is the closest a task's sessions read
 * can get to "every one" under the new contract.
 */
const MAX_SESSIONS = 500;

/** The exact projection `GET /api/tasks/:id/sessions` used to return. */
function toTaskSessions(rows: ReadonlyArray<SessionRow>): TaskSession[] {
	// search_sessions serves newest-first; the list is rendered and numbered oldest-first.
	const oldestFirst = [...rows].reverse();
	return oldestFirst.map((row) => ({
		id: row.id,
		// UI-036: date-based title instead of "Session N" ordinal
		title: absoluteDate(row.startedAt),
		// UI-035: agentId is an internal id — show generic label until agent
		// names are available from a parallel fetch (no /api/agents call here yet)
		agent: "Agent",
		tokens: null,
		// @lore AF12: state-based contract — the frontend keys the live dot off
		// status === 'active'. Use `state` (not `outcome`) so a cascade-stopped
		// session renders 'stopped' via the raw-status fallback, never blank.
		status: row.state ?? "",
		harnessUrl: null,
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
		call("search_sessions", { taskId, limit: MAX_SESSIONS })
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setState({
						data: null,
						error: result.problems[0]?.message ?? "search_sessions failed",
						isLoading: false,
					});
					return;
				}
				setState({
					data: { sessions: toTaskSessions(result.data) },
					error: null,
					isLoading: false,
				});
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
