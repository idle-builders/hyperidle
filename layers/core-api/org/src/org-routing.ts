import type { HyperIdleDb } from "@hyperidle/db";
import { listUsers } from "@hyperidle/users";

/**
 * Resolve which human users should receive a review/escalation.
 *
 * Resolution algorithm:
 *  1. If teamId is provided, query humans whose users.teamId matches teams.id.
 *  2. If any humans found on the team, return them.
 *  3. Otherwise fall back to ALL human users so every review still reaches someone.
 *
 * @lore AU20 destroy pass + founder ruling 1: the old org-edges matrix
 * (direct/function/team edges configuring named reviewers per agent/role/team)
 * was an approval chart — hierarchy and roles-as-permissions the product ethos
 * forbids. The matrix is gone; the capability survives as a simpler query:
 * team membership already encodes who the humans on a team are, so
 * "which humans review this agent's work" = "the humans on this agent's team".
 * The fallback (team has no humans → all humans) ensures no review is silently
 * lost on a mixed-team org where a team has only agents right now.
 *
 * @lore AU44 B1: `getTeamMembers` call removed — `users.teamId` now references
 * `teams.id` directly, so a `listUsers({ teamIds: [teamId] })` suffices without
 * the former two-hop (teamId → teamMembers.id → users.teamId). The DI port
 * (`listHumans`) is also collapsed: `listUsers` is called directly since this
 * module is in core-api and can import from `@hyperidle/users`.
 * `userId` and `agentRole` fields removed from context — they were the
 * direct/function edge mechanisms wearing a type; they die with the edges.
 */
export async function resolveReviewRecipients(
	db: HyperIdleDb,
	context: { teamId?: string },
): Promise<string[]> {
	// Team-scoped: find humans on the agent's own team.
	if (context.teamId) {
		const teamHumans = await listUsers(db, {
			kind: "human",
			teamIds: [context.teamId],
		});
		if (teamHumans.length > 0) {
			return teamHumans.map((u) => u.id);
		}
	}

	// Fallback: all humans — every review reaches someone.
	const allHumans = await listUsers(db, { kind: "human" });
	return allHumans.map((u) => u.id);
}
