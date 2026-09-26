/**
 * useTeams — the portfolio's team list, built client-side from the user and
 * task action doors.
 *
 * @lore BC5 T11: `GET /api/teams` is gone with the `teams` route family — a
 * team is id + name now (migration 0090 drops every other column). This
 * hook rebuilds `TeamListItem`'s old shape from `search_users({})` (teams =
 * the distinct `team` every row carries) and, per team, the same two
 * `search_tasks` calls `useTeam.ts` (singular) already makes for one team's
 * page: `state: "blocked"` (limit 1, for the status chip) and `state:
 * "in_progress", parentTaskId: null` (for the active-task count).
 * `phase`/`leadAgentId`/`tasksDone`/`shipRate`/`progress`/`routineCount`/
 * `agentCount` go with the columns and the routines/capacity concepts that
 * carried them — nothing renders them any more (AD9's row is name + active
 * count + status only).
 */

import { useEffect, useState } from "react";
import { call } from "../services/call.js";

export type TeamsListItemStatus = "healthy" | "blocked";

export interface TeamsListItem {
	readonly id: string;
	readonly name: string;
	readonly status: TeamsListItemStatus;
	readonly tasksInProgress: number;
}

export interface UseTeamsResult {
	data: { readonly teams: readonly TeamsListItem[] } | null;
	loading: boolean;
	error: Error | null;
	/** Trigger a fresh fetch — used by ErrorState onRetry. */
	refetch: () => void;
}

function distinctTeams(
	users: ReadonlyArray<{ readonly team: { readonly id: string; readonly name: string } | null }>,
): ReadonlyArray<{ readonly id: string; readonly name: string }> {
	const byId = new Map<string, { readonly id: string; readonly name: string }>();
	for (const u of users) {
		if (u.team && !byId.has(u.team.id)) byId.set(u.team.id, u.team);
	}
	return [...byId.values()];
}

export function useTeams(): UseTeamsResult {
	const [state, setState] = useState<Omit<UseTeamsResult, "refetch">>({
		data: null,
		loading: true,
		error: null,
	});
	// fetchKey increments to re-run the effect (refetch pattern).
	const [fetchKey, setFetchKey] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fetchKey is a refetch counter — incrementing it re-runs the effect intentionally even though it isn't read inside the body.
	useEffect(() => {
		let cancelled = false;
		setState({ data: null, loading: true, error: null });

		(async (): Promise<void> => {
			try {
				const usersResult = await call("search_users", {});
				if (!usersResult.ok) {
					throw new Error(usersResult.problems[0]?.message ?? "Teams fetch failed");
				}
				const teams = distinctTeams(usersResult.data);

				const withStats = await Promise.all(
					teams.map(async (team) => {
						const [blockedResult, inProgressResult] = await Promise.all([
							call("search_tasks", { teamId: team.id, state: "blocked", limit: 1 }),
							call("search_tasks", {
								teamId: team.id,
								state: "in_progress",
								parentTaskId: null,
							}),
						]);
						const status: TeamsListItemStatus =
							blockedResult.ok && blockedResult.data.length > 0 ? "blocked" : "healthy";
						const tasksInProgress = inProgressResult.ok ? inProgressResult.data.length : 0;
						return { ...team, status, tasksInProgress };
					}),
				);

				if (!cancelled) setState({ data: { teams: withStats }, loading: false, error: null });
			} catch (err: unknown) {
				if (!cancelled) {
					setState({
						data: null,
						loading: false,
						error: err instanceof Error ? err : new Error(String(err)),
					});
				}
			}
		})();

		return (): void => {
			cancelled = true;
		};
	}, [fetchKey]);

	return {
		...state,
		refetch: (): void => setFetchKey((k) => k + 1),
	};
}
