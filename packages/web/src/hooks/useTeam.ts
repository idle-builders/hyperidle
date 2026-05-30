/**
 * useTeam — thin one-shot fetch hook for GET /api/products/:id.
 *
 * @lore U1: Replaces useProduct. `ProductDetail` → `TeamDetail`.
 * The API URL path stays `/api/products/:id` for backward compat.
 *
 * @lore L13: No caching, no retry, no SWR — when a real data layer
 * (React Query, RSC, etc.) lands track-wide, replace this hook in one edit.
 */

import type { TeamDetail } from "@hyperidle/shared";
import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface UseTeamResult {
	data: TeamDetail | null;
	loading: boolean;
	error: Error | null;
}

export function useTeam(teamId: string | undefined): UseTeamResult {
	const [state, setState] = useState<UseTeamResult>({
		data: null,
		loading: teamId !== undefined,
		error: null,
	});

	useEffect(() => {
		if (!teamId) {
			setState({ data: null, loading: false, error: null });
			return;
		}
		let cancelled = false;
		setState({ data: null, loading: true, error: null });
		apiFetch(`/api/products/${encodeURIComponent(teamId)}`)
			.then((res) => {
				if (!res.ok) throw new Error(`Team fetch failed: ${res.status}`);
				return res.json() as Promise<TeamDetail>;
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
	}, [teamId]);

	return state;
}
