/**
 * useAgents — thin one-shot fetch hook for GET /api/agents.
 *
 * Every agent in the backend, unfiltered — for pickers that offer any agent
 * as a choice (e.g. a task's owner) rather than one team's roster.
 * `useTeamAgents` is a filter over this hook's result, not a second fetch —
 * the one fetch here is the whole agent-loading surface.
 *
 * @lore: same shape as `useTeams` — no caching, no retry beyond the
 * exposed `refetch`.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import type { AgentConfig } from "../settings/settings-types.js";

export interface UseAgentsResult {
	agents: AgentConfig[];
	loading: boolean;
	error: Error | null;
	refetch: () => void;
}

export function useAgents(): UseAgentsResult {
	const [state, setState] = useState<Omit<UseAgentsResult, "refetch">>({
		agents: [],
		loading: true,
		error: null,
	});
	const [fetchKey, setFetchKey] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fetchKey is a refetch counter — incrementing it re-runs the effect intentionally even though it isn't read inside the body.
	useEffect(() => {
		let cancelled = false;
		setState((prev) => ({ ...prev, loading: true, error: null }));
		apiFetch("/api/agents")
			.then((res) => {
				if (!res.ok) throw new Error(`Agent fetch failed: ${res.status}`);
				return res.json() as Promise<unknown>;
			})
			.then((body) => {
				// A response the endpoint never actually sends (e.g. a test double
				// answering every route the same way) degrades to "no agents" rather
				// than a runtime crash in a `.map()` two components away.
				const agents = Array.isArray(body) ? (body as AgentConfig[]) : [];
				if (!cancelled) setState({ agents, loading: false, error: null });
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setState({
						agents: [],
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
