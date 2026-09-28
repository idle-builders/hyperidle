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
	/** Session effectiveness score. Float 0-1, or null when not evaluated. */
	effectivenessScore?: number | null;
}

export interface TaskSessionsData {
	sessions: TaskSession[];
}

/**
 * `search_sessions` defaults to 100 with no `limit` set; 500 (the action's
 * max) is the closest a task's sessions read can get to "every one".
 */
const MAX_SESSIONS = 500;

function toTaskSessions(rows: ReadonlyArray<SessionRow>): TaskSession[] {
	const oldestFirst = [...rows].reverse();
	return oldestFirst.map((row) => ({
		id: row.id,

		title: absoluteDate(row.startedAt),
		// agentId is an internal id — generic label until agent names available from a parallel fetch
		agent: "Agent",
		tokens: null,
		// @lore: live dot keys off state === "active"; use state not outcome so cascade-stopped session renders "stopped" via fallback, never blank
		status: row.state ?? "",
		harnessUrl: null,
		effectivenessScore:
			row.effectivenessScore != null && !Number.isNaN(Number.parseFloat(row.effectivenessScore))
				? Number.parseFloat(row.effectivenessScore)
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
