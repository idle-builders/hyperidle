import { useMemo, useRef } from "react";
import type { AgentConfig } from "../settings/settings-types.js";
import { useAgents } from "./useAgents.js";

export interface UseTeamAgentsResult {
	agents: Map<string, AgentConfig>;
	loading: boolean;
	error: Error | null;
	refetch: () => void;
}

export function useTeamAgents(rosterAgentIds: readonly string[]): UseTeamAgentsResult {
	const { agents: allAgents, loading, error, refetch } = useAgents();

	// Sorted+joined so an unmemoized caller array only re-runs when content changes
	const idsKey = useMemo(() => [...rosterAgentIds].sort().join(","), [rosterAgentIds]);
	const rosterRef = useRef(rosterAgentIds);
	rosterRef.current = rosterAgentIds;

	const agents = useMemo(() => {
		if (idsKey === "") return new Map<string, AgentConfig>();
		const idsSet = new Set(rosterRef.current);
		return new Map(allAgents.filter((a) => idsSet.has(a.id)).map((a) => [a.id, a]));
	}, [allAgents, idsKey]);

	return { agents, loading, error, refetch };
}
