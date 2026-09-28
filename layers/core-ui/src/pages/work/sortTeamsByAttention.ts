import type { TeamsListItem } from "../../hooks/useTeams.js";

const RANK: Record<string, number> = {
	blocked: 0,
	healthy: 1,
};

export function sortTeamsByAttention(teams: readonly TeamsListItem[]): TeamsListItem[] {
	return [...teams].sort((a, b) => {
		const rankDiff = (RANK[a.status] ?? 1) - (RANK[b.status] ?? 1);
		if (rankDiff !== 0) return rankDiff;
		return a.name.localeCompare(b.name);
	});
}
