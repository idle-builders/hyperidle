import type { HyperIdleDb } from "@hyperidle/db";
import { getTeamMembers } from "./team-lookup.js";

/**
 * Resolve which human users should receive a review/escalation.
 *
 * Resolution algorithm:
 *  1. If teamId is provided, find the teamMembers row for that team.
 *  2. Query humans whose users.teamId matches that teamMembers.id.
 *  3. If any humans found on the team, return them.
 *  4. Otherwise fall back to ALL human users so every review still reaches someone.
 *
 * @lore AU20 destroy pass + founder ruling 1: the old org-edges matrix
 * (direct/function/team edges configuring named reviewers per agent/role/team)
 * was an approval chart — hierarchy and roles-as-permissions the product ethos
 * forbids. The matrix is gone; the capability survives as a simpler query:
 * team membership already encodes who the humans on a team are, so
 * "which humans review this agent's work" = "the humans on this agent's team".
 * The fallback (team has no humans → all humans) ensures no review is silently
 * lost on a mixed-team org where a team has only agents right now.
 */
export async function resolveReviewRecipients(
	db: HyperIdleDb,
	context: { userId?: string; agentRole?: string; teamId?: string },
	users: { listHumans(db: HyperIdleDb, teamMembersId?: string): Promise<Array<{ id: string }>> },
): Promise<string[]> {
	// Team-scoped: find humans on the agent's own team.
	if (context.teamId) {
		const memberGroup = await getTeamMembers(db, { teamId: context.teamId });
		if (memberGroup) {
			const teamHumans = await users.listHumans(db, memberGroup.id);
			if (teamHumans.length > 0) {
				return teamHumans.map((u) => u.id);
			}
		}
	}

	// Fallback: all humans — every review reaches someone.
	const allHumans = await users.listHumans(db, undefined);
	return allHumans.map((u) => u.id);
}
