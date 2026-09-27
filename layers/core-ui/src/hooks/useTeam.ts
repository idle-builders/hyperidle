/**
 * useTeam — a team page's composite view, built client-side from the user
 * and task action doors.
 *
 * @lore BC5 T9: the door swap — `GET /api/teams/:id` (a server-composed
 * `TeamDetail`) is gone. `team` is id + name now (architecture.md §1); phase,
 * `leadAgentId` and capacity went with the `teams` columns that carried them
 * (D-c7jgxy). This hook rebuilds the page's shape from three calls:
 * `search_users({ teamId })` for the header (every member shares the same
 * effective `team`) and the agent roster, `search_tasks({ teamId, state:
 * "in_progress", parentTaskId: null })` for the active-task cards, and one
 * `open_task` per active task (small, bounded count) to compute its subtask
 * progress — the same shape `TaskCardSummary` always carried. Status is
 * `"blocked"` when the team has any task in the `blocked` state, `"healthy"`
 * otherwise — `"behind"` (capacity overrun) is gone with capacity itself
 * (D-npax8h).
 */

import type { TaskNode, TaskState } from "@hyperidle/domain-model";
import { useCallback, useEffect, useState } from "react";
import { call } from "../services/call.js";

export interface TeamRosterMember {
	readonly agentId: string;
	readonly name: string;
	readonly role: string;
	readonly agentCategory: string | null;
}

export interface TeamTaskCard {
	readonly id: string;
	readonly title: string;
	readonly state: TaskState;
	readonly progressDone: number;
	readonly progressTotal: number;
}

export type TeamPageStatus = "healthy" | "blocked";

export interface TeamPageData {
	readonly team: { readonly id: string; readonly name: string; readonly status: TeamPageStatus };
	readonly roster: readonly TeamRosterMember[];
	readonly tasksInProgress: readonly TeamTaskCard[];
}

export interface UseTeamResult {
	data: TeamPageData | null;
	loading: boolean;
	error: Error | null;
	refetch: () => void;
}

/** Sums a task's whole subtree — descendants only, not the task itself. */
function countProgress(nodes: readonly TaskNode[]): { done: number; total: number } {
	let done = 0;
	let total = 0;
	for (const node of nodes) {
		total += 1;
		if (node.state === "done") done += 1;
		const sub = countProgress(node.children);
		done += sub.done;
		total += sub.total;
	}
	return { done, total };
}

export function useTeam(teamId: string | undefined): UseTeamResult {
	const [data, setData] = useState<TeamPageData | null>(null);
	const [loading, setLoading] = useState(teamId !== undefined);
	const [error, setError] = useState<Error | null>(null);
	const [fetchCount, setFetchCount] = useState(0);

	const refetch = useCallback((): void => {
		setFetchCount((c) => c + 1);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fetchCount is an intentional trigger dep (counter pattern)
	useEffect(() => {
		if (!teamId) {
			setData(null);
			setLoading(false);
			setError(null);
			return;
		}
		let cancelled = false;
		setData(null);
		setLoading(true);
		setError(null);

		(async (): Promise<void> => {
			try {
				const [membersResult, blockedResult, inProgressResult] = await Promise.all([
					call("search_users", { teamId }),
					call("search_tasks", { teamId, state: "blocked", limit: 1 }),
					call("search_tasks", { teamId, state: "in_progress", parentTaskId: null }),
				]);
				if (cancelled) return;
				if (!membersResult.ok) {
					throw new Error(membersResult.problems[0]?.message ?? "Team fetch failed");
				}
				const members = membersResult.data;
				if (members.length === 0) {
					// No member carries this team — same "not found" the old route 404'd.
					throw new Error("Team fetch failed: 404");
				}
				const teamName = members[0]?.team?.name ?? teamId;
				const roster: TeamRosterMember[] = members
					.filter((m) => m.kind === "ai")
					.map((m) => ({
						agentId: m.id,
						name: m.name,
						role: m.role,
						agentCategory: m.agentCategory,
					}));

				const status: TeamPageStatus =
					blockedResult.ok && blockedResult.data.length > 0 ? "blocked" : "healthy";

				const rootTasks = inProgressResult.ok ? inProgressResult.data : [];
				const views = await Promise.all(rootTasks.map((t) => call("open_task", { id: t.id })));
				const tasksInProgress: TeamTaskCard[] = rootTasks.map((t, index) => {
					const view = views[index];
					const progress = view?.ok ? countProgress(view.data.children) : { done: 0, total: 0 };
					return {
						id: t.id,
						title: t.title,
						state: t.state,
						progressDone: progress.done,
						progressTotal: progress.total,
					};
				});

				if (!cancelled) {
					setData({ team: { id: teamId, name: teamName, status }, roster, tasksInProgress });
					setLoading(false);
				}
			} catch (err: unknown) {
				if (!cancelled) {
					setData(null);
					setLoading(false);
					setError(err instanceof Error ? err : new Error(String(err)));
				}
			}
		})();

		return (): void => {
			cancelled = true;
		};
		// fetchCount in deps so refetch() triggers a new fetch (counter pattern).
	}, [teamId, fetchCount]);

	return { data, loading, error, refetch };
}
