/**
 * useTaskSearch — BA6: search tasks by title for the dependency picker.
 *
 * @lore BA6: the door this hook calls, `GET /api/tasks?q=<query>`, already
 * existed before this WP (`layers/core-api/src/routes/tasks.ts` → `work.list(db,
 * "task", { text: q })`, `work-service.ts`'s `WorkFilter.text` — an ILIKE
 * across title/description/doneCondition, ranked so title matches sort
 * first, with NO `parentTaskId` restriction so every depth is searchable). A
 * previous pass concluded "there is no task-search endpoint"; that was
 * wrong, and this hook is the fix — reuse the existing door, not a new one.
 * The global `GET /api/search` route was rejected as the door for this picker:
 * it caps tasks at 5 and restricts to roots (`parentTaskId: null`), both
 * wrong for a field that must find a non-root task by title.
 *
 * Excludes `excludeIds` (the task being edited, and tasks already in the
 * dependency list) client-side. The API has no exclusion param and does not
 * need one — the real guard against a self-dependency or a duplicate is the
 * server-side write-door validation (`assertValidDependencies`), unchanged by
 * this hook. This filtering is purely "don't offer it in the list", not a
 * security boundary.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

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
	const [status, setStatus] = useState<TaskSearchStatus>("idle");
	const [rawResults, setRawResults] = useState<readonly TaskSearchResult[]>([]);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		abortRef.current?.abort();
		const trimmed = query.trim();
		if (trimmed === "") {
			setStatus("idle");
			setRawResults([]);
			setError(null);
			return;
		}

		const ac = new AbortController();
		abortRef.current = ac;
		setStatus("loading");
		setError(null);

		(async (): Promise<void> => {
			try {
				const res = await apiFetch(`/api/tasks?q=${encodeURIComponent(trimmed)}`, {
					signal: ac.signal,
				});
				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`);
				}
				const raw: unknown = await res.json();
				if (ac.signal.aborted) return;
				setRawResults(Array.isArray(raw) ? raw.filter(isTaskSearchResult) : []);
				setStatus("ready");
			} catch (err) {
				if (err instanceof DOMException && err.name === "AbortError") return;
				if (ac.signal.aborted) return;
				setError(err instanceof Error ? err.message : "Search failed");
				setStatus("error");
			}
		})();

		return () => ac.abort();
	}, [query]);

	const results = useMemo(
		() => rawResults.filter((r) => !excludeIds.includes(r.id)),
		[rawResults, excludeIds],
	);

	return { status, results, error };
}
