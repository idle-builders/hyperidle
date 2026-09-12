/**
 * useTaskSearch — search tasks by title for the dependency picker.
 *
 * Calls `GET /api/tasks?q=<query>` (`work.list(db, "task", { text: q })` —
 * an ILIKE across title/description/doneCondition, ranked so title matches
 * sort first, with no `parentTaskId` restriction so every depth is
 * searchable, and `excludeKilled` applied automatically whenever `q` is
 * set). Built on `useFetch` for the request/cancel plumbing, with its own
 * debounce so fast typing doesn't fire a request per keystroke.
 *
 * @lore BA6: the global `GET /api/search` route (`useGlobalSearch`) was
 * rejected as this picker's door — it caps tasks at 5 and restricts to roots
 * (`parentTaskId: null`), both wrong for a field that must find a
 * non-root task by title at any depth.
 *
 * Excludes `excludeIds` (the task being edited, and tasks already in the
 * dependency list) client-side — the server has no exclusion param and does
 * not need one, since the real guard against a self-dependency or a
 * duplicate is the write-door's own validation. This filtering is purely
 * "don't offer it in the list."
 */

import { useEffect, useMemo, useState } from "react";
import { useFetch } from "./useFetch.js";

export interface TaskSearchResult {
	id: string;
	title: string;
}

export type TaskSearchStatus = "idle" | "loading" | "ready" | "error";

export interface UseTaskSearchResult {
	status: TaskSearchStatus;
	results: readonly TaskSearchResult[];
	error: string | null;
}

const DEBOUNCE_MS = 200;

function isTaskSearchResult(value: unknown): value is TaskSearchResult {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return typeof v.id === "string" && typeof v.title === "string";
}

/**
 * Search tasks by title. `query` empty/whitespace-only means idle, no fetch.
 * `excludeIds` is applied to already-fetched results (not a fetch trigger),
 * so adding a dependency mid-search re-filters instantly without refetching.
 */
export function useTaskSearch(query: string, excludeIds: readonly string[]): UseTaskSearchResult {
	const trimmed = query.trim();
	const [debounced, setDebounced] = useState(trimmed);

	const url = debounced === "" ? null : `/api/tasks?q=${encodeURIComponent(debounced)}`;
	const { data, error, isLoading, refetch } = useFetch<unknown>(url);

	// biome-ignore lint/correctness/useExhaustiveDependencies: debounced/error/refetch are read for their value AT THE MOMENT the timer fires, not to retrigger scheduling — only `trimmed` should reset the debounce timer.
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebounced(trimmed);
			// @lore BA6: a url-keyed fetch never re-fires when the debounced
			// value settles back on the same string it started at (retyping the
			// same query fast enough that no intermediate value ever commits) —
			// `setDebounced` bails out as a no-op since the value didn't change.
			// After an error that same string must still be retryable, so nudge
			// `useFetch` explicitly whenever the settled query matches the one
			// that just failed.
			if (trimmed === debounced && trimmed !== "" && error !== null) refetch();
		}, DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [trimmed]);

	const rawResults = useMemo<readonly TaskSearchResult[]>(
		() => (Array.isArray(data) ? data.filter(isTaskSearchResult) : []),
		[data],
	);
	const results = useMemo(
		() => rawResults.filter((r) => !excludeIds.includes(r.id)),
		[rawResults, excludeIds],
	);

	const pendingDebounce = trimmed !== debounced;
	const status: TaskSearchStatus =
		trimmed === ""
			? "idle"
			: pendingDebounce || isLoading
				? "loading"
				: error !== null
					? "error"
					: "ready";

	return { status, results, error };
}
