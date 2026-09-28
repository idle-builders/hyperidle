import type { HarnessDescriptor, SubscriptionView, UserView } from "@hyperidle/domain-model";
import { useEffect, useState } from "react";
import { call } from "../services/call.js";

export interface AgentProfileData {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly agentCategory: string | null;
	readonly teamName: string | null;
	readonly teamId: string | null;
	readonly createdAt: string;
	readonly identityDocumentId: string | null;
	readonly harnessType: string | null;
	readonly maxConcurrentSessions: number;
	readonly subscriptions: readonly SubscriptionView[];
	readonly harnessCapabilities: HarnessDescriptor | null;
	readonly harnessAvailable: boolean;
	readonly reviewTrackRecord: UserView["reviewTrackRecord"];
}

function resolveHarnessAvailable(
	harnessType: string | null,
	runsOn: readonly HarnessDescriptor[],
): boolean {
	if (!harnessType) return runsOn.some((h) => h.discovery.disabled !== true);
	const match = runsOn.find((h) => h.type === harnessType);
	return match !== undefined && match.discovery.disabled !== true;
}

export interface UseAgentProfileResult {
	data: AgentProfileData | null;
	loading: boolean;
	error: Error | null;
	/** HTTP status code — separate from error so callers branch on 404/429/5xx without parsing error.message; null when no HTTP response (network error). */
	httpStatus: number | null;
	refetch: () => void;
}

export function useAgentProfile(agentId: string | undefined): UseAgentProfileResult {
	const [state, setState] = useState<Omit<UseAgentProfileResult, "refetch">>({
		data: null,
		loading: agentId !== undefined,
		error: null,
		httpStatus: null,
	});
	const [fetchCount, setFetchCount] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fetchCount is a refetch counter — incrementing it re-runs the effect intentionally even though it isn't read inside the body.
	useEffect(() => {
		if (!agentId) {
			setState({ data: null, loading: false, error: null, httpStatus: null });
			return;
		}
		let cancelled = false;
		setState({ data: null, loading: true, error: null, httpStatus: null });

		(async (): Promise<void> => {
			try {
				const result = await call("open_user", { id: agentId });
				if (cancelled) return;
				if (!result.ok) {
					setState({
						data: null,
						loading: false,
						error: new Error("Something went wrong. Please try again."),
						httpStatus: null,
					});
					return;
				}
				const row = result.data.user;
				if (row === null) {
					setState({
						data: null,
						loading: false,
						error: new Error("Agent not found (404)"),
						httpStatus: 404,
					});
					return;
				}
				const identityDocumentId =
					result.data.documentIds.find((d) => d.slot === "agent_file")?.id ?? null;
				const harnessType = result.data.runConfig?.harnessType ?? null;
				const harnessCapabilities = result.data.runsOn.find((h) => h.type === harnessType) ?? null;
				const harnessAvailable = resolveHarnessAvailable(harnessType, result.data.runsOn);
				setState({
					data: {
						id: row.id,
						name: row.name,
						role: row.role,
						agentCategory: row.agentCategory,
						teamName: row.team?.name ?? null,
						teamId: row.team?.id ?? null,
						createdAt: row.createdAt,
						identityDocumentId,
						harnessType,
						maxConcurrentSessions: result.data.runConfig?.maxConcurrentSessions ?? 1,
						subscriptions: result.data.subscriptions,
						harnessCapabilities,
						harnessAvailable,
						reviewTrackRecord: result.data.reviewTrackRecord,
					},
					loading: false,
					error: null,
					httpStatus: null,
				});
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
	}, [agentId, fetchCount]);

	return { ...state, refetch: (): void => setFetchCount((c) => c + 1) };
}
