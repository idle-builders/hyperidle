import type { UserRow } from "@hyperidle/domain-model";
import { useEffect, useState } from "react";
import { call } from "../services/call.js";
import type { AgentConfig } from "../settings/settings-types.js";

export interface UseAgentsResult {
	agents: AgentConfig[];
	loading: boolean;
	error: Error | null;
	refetch: () => void;
}

function toAgentConfig(row: UserRow): AgentConfig {
	return {
		id: row.id,
		name: row.name,
		role: row.role,
		ownerUserId: row.ownerUserId,
		identityDocumentId: null,
		harnessType: null,
		modelId: null,
		modelProvider: null,
		maxConcurrentSessions: 1,
		status: row.status,
		agentCategory: row.agentCategory,
	};
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
		call("search_users", { kind: "ai" })
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setState({
						agents: [],
						loading: false,
						error: new Error(result.problems[0]?.message ?? "Agent fetch failed"),
					});
					return;
				}
				setState({ agents: result.data.map(toAgentConfig), loading: false, error: null });
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
