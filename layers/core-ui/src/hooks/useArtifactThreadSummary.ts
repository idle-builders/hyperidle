/**
 * useArtifactThreadSummary — L18 hook for the task-level artifact thread summary.
 *
 * Fetches GET /api/tasks/:id/artifact-thread-summary and exposes
 * { data, error, isLoading, refresh }.
 *
 * @lore L18: refresh() uses the version-fragment trick (appends #v=N to the URL).
 * The wiring for refresh() when an artifact-thread post occurs lives at the
 * WorkBet page level — when the user posts on a per-artifact thread from the
 * same WorkBet page, the caller calls refresh() here. Cross-tab posts do not
 * refresh the summary until the next navigation (acceptable for v1).
 */

import type { ArtifactThreadSummaryResponse } from "@hyperidle/domain-model";
import { useCallback, useMemo, useState } from "react";
import { useFetch } from "./useFetch.js";

export interface UseArtifactThreadSummaryResult {
	data: ArtifactThreadSummaryResponse | null;
	error: string | null;
	isLoading: boolean;
	refresh: () => void;
}

/**
 * Fetches the artifact thread summary for a bet.
 * Pass null as taskId to skip the fetch (returns null data immediately).
 */
export function useArtifactThreadSummary(taskId: string | null): UseArtifactThreadSummaryResult {
	const [version, setVersion] = useState(0);

	const refresh = useCallback(() => {
		setVersion((v) => v + 1);
	}, []);

	const url = useMemo(() => {
		if (!taskId) return null;
		const base = `/api/tasks/${encodeURIComponent(taskId)}/artifact-thread-summary`;
		return version > 0 ? `${base}#v=${version}` : base;
	}, [taskId, version]);

	const state = useFetch<ArtifactThreadSummaryResponse>(url);

	return { ...state, refresh };
}
