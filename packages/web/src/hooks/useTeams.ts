/**
 * useTeams — thin one-shot fetch hook for GET /api/products.
 *
 * @lore U1: Replaces useProducts. `ProductListResponse` → `TeamListResponse`.
 * The API URL path stays `/api/products` for backward compat (server mounts
 * createTeamRoutes at that path).
 *
 * @lore L13: No caching, no retry — same pattern as useBet and useTeam.
 */

import type { TeamListResponse } from "@hyperidle/shared";
import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface UseTeamsResult {
	data: TeamListResponse | null;
	loading: boolean;
	error: Error | null;
}

export function useTeams(): UseTeamsResult {
	const [state, setState] = useState<UseTeamsResult>({
		data: null,
		loading: true,
		error: null,
	});

	useEffect(() => {
		let cancelled = false;
		setState({ data: null, loading: true, error: null });
		apiFetch("/api/products")
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
	}, []);

	return state;
}
