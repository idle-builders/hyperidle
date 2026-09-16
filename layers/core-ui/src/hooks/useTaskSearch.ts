/**
 * useTaskSearch — search tasks by title for the dependency picker.
 *
 * Calls `search_tasks` with `text` (an ILIKE across title/description/
 * doneCondition, ranked so title matches sort first, no `parentTaskId`
 * restriction so every depth is searchable) and `excludeKilled: true`.
 * `excludeIds` is now sent server-side too — `search_tasks` applies it
 * directly, so the caller no longer needs to re-filter results itself.
 * Built on its own debounce so fast typing doesn't fire a request per
 * keystroke.
 *
 * @lore BA6: the global `GET /api/search` route (`useGlobalSearch`) was
 * rejected as this picker's door — it caps tasks at 5 and restricts to roots
 * (`parentTaskId: null`), both wrong for a field that must find a
 * non-root task by title at any depth.
 */

import { useEffect, useState } from "react";
import { call } from "../services/call.js";

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

/**
 * Search tasks by title. `query` empty/whitespace-only means idle, no call.
 * `excludeIds` is now a `search_tasks` input, so a change to it re-runs the
 * search too.
 *
 * @lore the caller MUST memoize `excludeIds` (see `TaskDependencyField`'s
 * `useMemo`). It sits in the search effect's dependency array by referential
 * identity; a fresh array literal at the call site re-triggers the search on
 * every render the hook's own state updates cause — an infinite loop, not
 * just a wasted request.
 */
export function useTaskSearch(query: string, excludeIds: readonly string[]): UseTaskSearchResult {
	const trimmed = query.trim();
	const [debounced, setDebounced] = useState(trimmed);
	const [results, setResults] = useState<readonly TaskSearchResult[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	// Bumped to force a re-run of the search effect when `debounced` settles
	// back on the value it already held — see the retry comment below.
	const [retryToken, setRetryToken] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: debounced/error are read for their value AT THE MOMENT the timer fires, not to retrigger scheduling — only `trimmed` should reset the debounce timer.
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebounced(trimmed);
			// @lore BA6: a debounced-value-keyed effect never re-fires when the
			// settled value equals what it already held (retyping the same query
			// fast enough that no intermediate value ever commits) — `setDebounced`
			// bails out as a no-op since the value didn't change. After an error
			// that same string must still be retryable, so bump `retryToken`
			// explicitly whenever the settled query matches the one that just failed.
			if (trimmed === debounced && trimmed !== "" && error !== null) setRetryToken((t) => t + 1);
		}, DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [trimmed]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: retryToken triggers a re-run on demand (the retry-after-error path above) without being read inside the effect.
	useEffect(() => {
		if (debounced === "") {
			setResults([]);
			setError(null);
			return;
		}
		let cancelled = false;
		setIsLoading(true);
		setError(null);
		(async (): Promise<void> => {
			const result = await call("search_tasks", {
				text: debounced,
				excludeIds,
				excludeKilled: true,
			});
			if (cancelled) return;
			setIsLoading(false);
			if (result.ok) {
				setResults(result.data);
			} else {
				setError(result.problems[0]?.message ?? "Search failed");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [debounced, excludeIds, retryToken]);

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
