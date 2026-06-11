/**
 * useTeam — thin one-shot fetch hook for GET /api/teams/:id.
 *
 * @lore U1: Replaces useProduct. `ProductDetail` → `TeamDetail`.
 * @lore U11: Migrated from /api/products/:id to /api/teams/:id (server route renamed in U2).
 * @lore L13: No caching, no retry, no SWR — when a real data layer
 * (React Query, RSC, etc.) lands track-wide, replace this hook in one edit.
 * @lore AF16 T3: Added `refetch` (fetchCount bump) to mirror useTeamAgents.refetch pattern,
 * so post-mutation callers (e.g. RoutineCreateDialog.onCreated) can trigger a fresh load.
 */

import type { TeamDetail } from "@hyperidle/shared";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface UseTeamResult {
	data: TeamDetail | null;
	loading: boolean;
	error: Error | null;
	/** Re-fetches the team. Call after create/update to refresh. */
	refetch: () => void;
}

export function useTeam(teamId: string | undefined): UseTeamResult {
	const [fetchCount, setFetchCount] = useState(0);
	const [data, setData] = useState<TeamDetail | null>(null);
	const [loading, setLoading] = useState(teamId !== undefined);
	const [error, setError] = useState<Error | null>(null);

	const refetch = useCallback((): void => {
		setFetchCount((c) => c + 1);
	}, []);

	useEffect(() => {
		if (!teamId) {
			setData(null);
			setLoading(false);
			setError(null);
			return;
		}
		let cancelled = false;
		setData(null);
		setLoading(true);
		setError(null);
		apiFetch(`/api/teams/${encodeURIComponent(teamId)}`)
			.then((res) => {
				if (!res.ok) throw new Error(`Team fetch failed: ${res.status}`);
				return res.json() as Promise<TeamDetail>;
			})
			.then((d) => {
				if (!cancelled) {
					setData(d);
					setLoading(false);
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setData(null);
					setLoading(false);
					setError(err instanceof Error ? err : new Error(String(err)));
				}
			});
		return (): void => {
			cancelled = true;
		};
		// fetchCount in deps so refetch() triggers a new fetch
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [teamId, fetchCount]);

	return { data, loading, error, refetch };
}
