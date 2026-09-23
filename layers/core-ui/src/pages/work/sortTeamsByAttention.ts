/**
 * AD9 — Attention-sort helper for the WorkOverview team list.
 *
 * Rank: blocked (0) → healthy (1) — "behind" (capacity overrun) is gone
 * with capacity itself.
 * Tie-break within rank: team name ascending.
 *
 * @lore AD9: No agentHealthWarning tie-break — the simplified row no longer
 * surfaces the agents signal (founder design-review dropped agents + progress cells).
 * Tie-break is name asc only.
 */

import type { TeamsListItem } from "../../hooks/useTeams.js";

const RANK: Record<string, number> = {
	blocked: 0,
	healthy: 1,
};

/**
 * Returns a new array sorted by attention priority:
 *   blocked(0) → healthy(1) — "behind" (capacity overrun) is gone with
 *   capacity itself;
 *   ties broken by name ascending.
 *
 * Does NOT mutate the input.
 */
export function sortTeamsByAttention(teams: readonly TeamsListItem[]): TeamsListItem[] {
	return [...teams].sort((a, b) => {
		const rankDiff = (RANK[a.status] ?? 1) - (RANK[b.status] ?? 1);
		if (rankDiff !== 0) return rankDiff;
		return a.name.localeCompare(b.name);
	});
}
