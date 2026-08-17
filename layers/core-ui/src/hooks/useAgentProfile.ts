/**
 * AB1 — useAgentProfile: fetches the agent profile from GET /api/agents/:id/profile.
 *
 * Follows the same pattern as useTeam — thin one-shot fetch, no caching.
 * When agentId is undefined, returns idle state (no fetch).
 */

import type { AgentProfileResponse } from "@hyperidle/domain-model";
import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface UseAgentProfileResult {
	data: AgentProfileResponse | null;
	loading: boolean;
	error: Error | null;
	/** @lore UI-014: HTTP status code surfaced separately so callers can branch on 404/429/5xx
	 * without parsing error.message strings. null for network errors (no HTTP response). */
	httpStatus: number | null;
}

export function useAgentProfile(agentId: string | undefined): UseAgentProfileResult {
	const [state, setState] = useState<UseAgentProfileResult>({
		data: null,
		loading: agentId !== undefined,
		error: null,
		httpStatus: null,
	});

	useEffect(() => {
		if (!agentId) {
			setState({ data: null, loading: false, error: null, httpStatus: null });
			return;
		}
		let cancelled = false;
		setState({ data: null, loading: true, error: null, httpStatus: null });

		(async (): Promise<void> => {
			try {
				const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/profile`);
				if (!res.ok) {
					// @lore UI-014: user-facing error message — no raw HTTP status code.
					// httpStatus carries the numeric code so AgentProfile.tsx can branch
					// (404 = not found, 429 = rate-limited, 5xx = server error) without
					// parsing error.message strings.
					if (!cancelled)
						setState({
							data: null,
							loading: false,
							error: new Error("Something went wrong. Please try again."),
							httpStatus: res.status,
						});
					return;
				}
				const data = (await res.json()) as AgentProfileResponse;
				if (!cancelled) setState({ data, loading: false, error: null, httpStatus: null });
			} catch (err: unknown) {
				if (!cancelled) {
					setState({
						data: null,
						loading: false,
						error: err instanceof Error ? err : new Error(String(err)),
						httpStatus: null,
					});
				}
			}
		})();

		return (): void => {
			cancelled = true;
		};
	}, [agentId]);

	return state;
}
