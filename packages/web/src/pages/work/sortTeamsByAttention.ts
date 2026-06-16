/**
 * AD9 — Attention-sort helper for the WorkOverview team list.
 *
 * Rank: blocked (0) → behind (1) → healthy (2).
 * Tie-break within rank: team name ascending.
 *
 * @lore AD9: No agentHealthWarning tie-break — the simplified row no longer
 * surfaces the agents signal (founder design-review dropped agents + progress cells).
 * Tie-break is name asc only.
 */

import type { TeamListItem } from "@hyperidle/shared";

const RANK: Record<string, number> = {
	blocked: 0,
	behind: 1,
	healthy: 2,
};

/**
 * Returns a new array sorted by attention priority:
 *   blocked(0) → behind(1) → healthy(2);
 *   ties broken by name ascending.
 *
 * Does NOT mutate the input.
 */
export function sortTeamsByAttention(teams: readonly TeamListItem[]): TeamListItem[] {
	return [...teams].sort((a, b) => {
		const rankDiff = (RANK[a.status] ?? 2) - (RANK[b.status] ?? 2);
		if (rankDiff !== 0) return rankDiff;
		return a.name.localeCompare(b.name);
	});
}
