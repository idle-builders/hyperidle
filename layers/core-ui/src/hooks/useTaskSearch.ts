// @lore: useGlobalSearch rejected as this picker's door — caps tasks at 5 and restricts to parentTaskId:null; search_tasks finds any depth

import { useEffect, useRef, useState } from "react";
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

// @lore: excludeIds MUST be memoized by caller — referential identity in effect deps; fresh array literal every render → infinite search loop
export function useTaskSearch(query: string, excludeIds: readonly string[]): UseTaskSearchResult {
	const trimmed = query.trim();
	const [debounced, setDebounced] = useState(trimmed);
	const [results, setResults] = useState<readonly TaskSearchResult[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	// Bumped to force a re-run of the search effect when `debounced` settles
	// back on the value it already held — see the retry comment below.
	const [retryToken, setRetryToken] = useState(0);

	const debouncedRef = useRef(debounced);
	const errorRef = useRef(error);
	debouncedRef.current = debounced;
	errorRef.current = error;

	// Only `trimmed` resets the debounce timer; refs hold debounced/error at fire time.
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebounced(trimmed);
			// @lore: retryToken bumped when settled query matches current — setDebounced bails out (same value); error must still be retryable so token forces re-run
			if (trimmed === debouncedRef.current && trimmed !== "" && errorRef.current !== null) {
				setRetryToken((t) => t + 1);
			}
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
