/**
 * useArtifactThreadSummary — L18 hook for the bet-level artifact thread summary.
 *
 * Fetches GET /api/bets/:id/artifact-thread-summary and exposes
 * { data, error, isLoading, refresh }.
 *
 * @lore L18: refresh() uses the version-fragment trick (appends #v=N to the URL).
 * The wiring for refresh() when an artifact-thread post occurs lives at the
 * WorkBet page level — when the user posts on a per-artifact thread from the
 * same WorkBet page, the caller calls refresh() here. Cross-tab posts do not
 * refresh the summary until the next navigation (acceptable for v1).
 */

import type { ArtifactThreadSummaryResponse } from "@hyperidle/shared";
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
 * Pass null as betId to skip the fetch (returns null data immediately).
 */
export function useArtifactThreadSummary(betId: string | null): UseArtifactThreadSummaryResult {
	const [version, setVersion] = useState(0);

	const refresh = useCallback(() => {
		setVersion((v) => v + 1);
	}, []);

	const url = useMemo(() => {
		if (!betId) return null;
		const base = `/api/bets/${encodeURIComponent(betId)}/artifact-thread-summary`;
		return version > 0 ? `${base}#v=${version}` : base;
	}, [betId, version]);

	const state = useFetch<ArtifactThreadSummaryResponse>(url);

	return { ...state, refresh };
}
