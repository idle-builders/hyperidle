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
}

export function useAgentProfile(agentId: string | undefined): UseAgentProfileResult {
	const [state, setState] = useState<UseAgentProfileResult>({
		data: null,
		loading: agentId !== undefined,
		error: null,
	});

	useEffect(() => {
		if (!agentId) {
			setState({ data: null, loading: false, error: null });
			return;
		}
		let cancelled = false;
		setState({ data: null, loading: true, error: null });
		apiFetch(`/api/agents/${encodeURIComponent(agentId)}/profile`)
			.then((res) => {
				if (!res.ok) throw new Error(`Agent profile fetch failed: ${res.status}`);
				return res.json() as Promise<AgentProfileResponse>;
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
	}, [agentId]);

	return state;
}
