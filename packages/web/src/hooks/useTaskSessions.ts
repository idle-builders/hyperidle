/**
 * useTaskSessions — thin fetch hook for GET /api/tasks/:id/sessions.
 *
 * Returns session list data for a task detail page.
 *
 * @lore W3: Created for the task detail page (AC-29). Mirrors the useBet
 * pattern — no caching, no retry, straightforward useFetch wrapper.
 */

import { type FetchState, useFetch } from "./useFetch.js";

/** @lore AU21 Increment 14a: `cost` field deleted along with the rest of the cost feature. */
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

export function useTaskSessions(taskId: string | undefined): FetchState<TaskSessionsData> {
	return useFetch<TaskSessionsData>(
		taskId !== undefined ? `/api/tasks/${encodeURIComponent(taskId)}/sessions` : null,
	);
}
