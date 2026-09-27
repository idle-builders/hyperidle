/**
 * useTeamAgents: a team's roster, filtered from the full agent catalog.
 *
 * `useAgents` already does the one fetch this needs (`GET /api/agents`, same
 * shape, same error) — this hook is a filter over it, not a second fetch.
 * `WorkTeam` only reads `agents`/`refetch` from the result, never `loading`,
 * so folding the fetch didn't change any caller's observable behavior.
 *
 * @lore AB3: We do NOT extend the team endpoint with system-prompt/config data.
 * Team endpoint stays lean (serves portfolio + other consumers). Agent
 * config (including systemPrompt up to 50KB) is fetched separately and
 * cached for the duration of the page session.
 */

import { useMemo, useRef } from "react";
import type { AgentConfig } from "../settings/settings-types.js";
import { useAgents } from "./useAgents.js";

export interface UseTeamAgentsResult {
	/** Full agent configs keyed by agent id for O(1) lookup. */
	agents: Map<string, AgentConfig>;
	loading: boolean;
	error: Error | null;
	/** Re-fetches the agent list. Call after save/create to refresh. */
	refetch: () => void;
}

export function useTeamAgents(rosterAgentIds: readonly string[]): UseTeamAgentsResult {
	const { agents: allAgents, loading, error, refetch } = useAgents();

	// Sorted+joined so an inline (unmemoized) array from the caller only
	// changes this key — and re-runs the filter below — when its CONTENT
	// changes, not on every render.
	const idsKey = useMemo(() => [...rosterAgentIds].sort().join(","), [rosterAgentIds]);
	const rosterRef = useRef(rosterAgentIds);
	rosterRef.current = rosterAgentIds;

	// idsKey stands in for rosterAgentIds' content; rosterRef holds the latest array for the filter.
	const agents = useMemo(() => {
		if (idsKey === "") return new Map<string, AgentConfig>();
		const idsSet = new Set(rosterRef.current);
		return new Map(allAgents.filter((a) => idsSet.has(a.id)).map((a) => [a.id, a]));
	}, [allAgents, idsKey]);

	return { agents, loading, error, refetch };
}
