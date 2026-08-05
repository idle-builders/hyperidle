/**
 * useTeams — thin one-shot fetch hook for GET /api/teams.
 *
 * @lore U1: Replaces useProducts. `ProductListResponse` → `TeamListResponse`.
 * @lore U11: Migrated from /api/products to /api/teams (server route renamed in U2).
 * @lore L13: No caching, no retry — same pattern as useBet and useTeam.
 */

import type { TeamListResponse } from "@hyperidle/shared";
import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface UseTeamsResult {
	data: TeamListResponse | null;
	loading: boolean;
	error: Error | null;
	/** Trigger a fresh fetch — used by ErrorState onRetry (AC4). */
	refetch: () => void;
}

export function useTeams(): UseTeamsResult {
	const [state, setState] = useState<Omit<UseTeamsResult, "refetch">>({
		data: null,
		loading: true,
		error: null,
	});
	// fetchKey increments to re-run the effect (refetch pattern).
	const [fetchKey, setFetchKey] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fetchKey is a refetch counter — incrementing it re-runs the effect intentionally even though it isn't read inside the body.
	useEffect(() => {
		let cancelled = false;
		setState({ data: null, loading: true, error: null });
		apiFetch("/api/teams")
			.then((res) => {
				if (!res.ok) throw new Error(`Teams fetch failed: ${res.status}`);
				return res.json() as Promise<TeamListResponse>;
			})
			.then((data) => {
				if (!cancelled) setState({ data, loading: false, error: null });
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setState({
						data: null,
						loading: false,
						error: err instanceof Error ? err : new Error(String(err)),
					});
				}
			});
		return (): void => {
			cancelled = true;
		};
	}, [fetchKey]);

	return {
		...state,
		refetch: (): void => setFetchKey((k) => k + 1),
	};
}
