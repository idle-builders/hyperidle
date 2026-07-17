/**
 * AB3 — useTeamAgents: fetches full agent config for a team's roster.
 *
 * Fetches from GET /api/agents (the existing list endpoint) and filters
 * client-side to agents whose id appears in rosterAgentIds.
 *
 * @lore AB3: We do NOT extend the team endpoint with system-prompt/config data.
 * Team endpoint stays lean (serves portfolio + other consumers). Agent
 * config (including systemPrompt up to 50KB) is fetched separately and
 * cached for the duration of the page session.
 *
 * @lore AB3: The caller MUST memoize the rosterAgentIds array (e.g.
 * with useMemo) to prevent re-fetch loops. A new array reference on
 * every render will re-trigger the useEffect dependency check and
 * initiate a new fetch on every render cycle.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import type { AgentConfig } from "../settings/settings-types.js";

export interface UseTeamAgentsResult {
	/** Full agent configs keyed by agent id for O(1) lookup. */
	agents: Map<string, AgentConfig>;
	loading: boolean;
	error: Error | null;
	/** Re-fetches the agent list. Call after save/create to refresh. */
	refetch: () => void;
}

export function useTeamAgents(rosterAgentIds: readonly string[]): UseTeamAgentsResult {
	const [agents, setAgents] = useState<Map<string, AgentConfig>>(new Map());
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	// fetchCount increments on refetch() to trigger the effect.
	const [fetchCount, setFetchCount] = useState(0);

	// Stable reference for rosterAgentIds as a Set for O(1) membership check.
	// We convert to a JSON key so the effect dep doesn't change on every render.
	const idsKey = useMemo(
		() => [...rosterAgentIds].sort().join(","),
		// @lore AB3: Intentionally re-compute only when the sorted id list changes,
		// not on every render. Callers passing an inline array will trigger this
		// once per unique set of IDs.
		[rosterAgentIds],
	);

	const idsRef = useRef<ReadonlySet<string>>(new Set(rosterAgentIds));
	useEffect(() => {
		idsRef.current = new Set(rosterAgentIds);
	}, [rosterAgentIds]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fetchCount is intentionally used as a refetch trigger only — it is not read inside the effect body.
	useEffect(() => {
		if (!idsKey) {
			setAgents(new Map());
			setLoading(false);
			setError(null);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setError(null);

		apiFetch("/api/agents")
			.then((res) => {
				if (!res.ok) throw new Error(`Agent fetch failed: ${res.status}`);
				return res.json() as Promise<AgentConfig[]>;
			})
			.then((all) => {
				if (!cancelled) {
					const filtered = all.filter((a) => idsRef.current.has(a.id));
					const map = new Map(filtered.map((a) => [a.id, a]));
					setAgents(map);
					setLoading(false);
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setError(err instanceof Error ? err : new Error(String(err)));
					setLoading(false);
				}
			});

		return (): void => {
			cancelled = true;
		};
		// Re-run when the set of IDs changes OR when refetch() is called.
	}, [idsKey, fetchCount]);

	const refetch = useCallback((): void => {
		setFetchCount((c) => c + 1);
	}, []);

	return { agents, loading, error, refetch };
}
