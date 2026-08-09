/**
 * useTeam — thin one-shot fetch hook for GET /api/teams/:id.
 *
 * @lore U1: Replaces useProduct. `ProductDetail` → `TeamDetail`.
 * @lore U11: Migrated from /api/products/:id to /api/teams/:id (server route renamed in U2).
 * @lore L13: No caching, no retry, no SWR — when a real data layer
 * (React Query, RSC, etc.) lands track-wide, replace this hook in one edit.
 *
 * @lore AF16 T3: Added `refetch()` callback (fetchCount increment) so WorkTeam
 * can re-fetch team data after a routine is created without a page reload.
 * The fetchCount trick is an intentional trigger pattern — biome suppressed below.
 */

import type { TeamDetail } from "@hyperidle/domain-model";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface UseTeamResult {
	data: TeamDetail | null;
	loading: boolean;
	error: Error | null;
	refetch: () => void;
}

export function useTeam(teamId: string | undefined): UseTeamResult {
	const [data, setData] = useState<TeamDetail | null>(null);
	const [loading, setLoading] = useState(teamId !== undefined);
	const [error, setError] = useState<Error | null>(null);
	const [fetchCount, setFetchCount] = useState(0);

	const refetch = useCallback((): void => {
		setFetchCount((c) => c + 1);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fetchCount is an intentional trigger dep (counter pattern)
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
		// fetchCount in deps so refetch() triggers a new fetch (counter pattern).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [teamId, fetchCount]);

	return { data, loading, error, refetch };
}
