import { type HyperIdleDb, orgEdges } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import type { OrgUserDirectory } from "./ports.js";

/**
 * Resolve which human users should receive a review/escalation.
 *
 * Resolution algorithm:
 *  1. Query WHERE mechanism="direct" AND target=context.userId (if userId provided)
 *  2. Query WHERE mechanism="function" AND target=context.agentRole (if agentRole provided)
 *  3. Query WHERE mechanism="team" AND target=context.teamId (if teamId provided)
 *  4. Union the fromUserId values (deduplicated via Set)
 *  5. If result set is empty, return all human user IDs
 *
 * @lore P2: This is the kernel-level routing query. It superseded the old
 * strategy-layer founder-router.ts for review routing; founder-router.ts
 * itself (dead, 0 real callers) was deleted in AU11. When no org edges
 * exist (or none match), falls back to ALL human users — ensuring every
 * review always reaches someone.
 *
 * @lore AU19 Increment 1c: `users` is an injected `OrgUserDirectory` port
 * (Mechanism C) — this used to import `listUsersByKind` directly from the
 * sibling `user-store.ts` (an ordinary downward core-api→core-api edge, NOT
 * §10.3 against-grain; `users` just hasn't migrated to its own package yet).
 * Callers (`tools/create-item.ts`, `session-review-creator.ts`) pass the real
 * `packages/server` function reference unchanged — no behavior change.
 */
export async function resolveReviewRecipients(
	db: HyperIdleDb,
	context: { userId?: string; agentRole?: string; teamId?: string },
	users: Pick<OrgUserDirectory, "listUsersByKind">,
): Promise<string[]> {
	const matchedFromUserIds = new Set<string>();

	// Query direct edges (mechanism = "direct", target = userId)
	if (context.userId) {
		const directMatches = await db
			.select({ fromUserId: orgEdges.fromUserId })
			.from(orgEdges)
			.where(and(eq(orgEdges.mechanism, "direct"), eq(orgEdges.target, context.userId)));
		for (const row of directMatches) {
			matchedFromUserIds.add(row.fromUserId);
		}
	}

	// Query function edges (mechanism = "function", target = agentRole)
	if (context.agentRole) {
		const functionMatches = await db
			.select({ fromUserId: orgEdges.fromUserId })
			.from(orgEdges)
			.where(and(eq(orgEdges.mechanism, "function"), eq(orgEdges.target, context.agentRole)));
		for (const row of functionMatches) {
			matchedFromUserIds.add(row.fromUserId);
		}
	}

	// Query team edges (mechanism = "team", target = teamId)
	if (context.teamId) {
		const teamMatches = await db
			.select({ fromUserId: orgEdges.fromUserId })
			.from(orgEdges)
			.where(and(eq(orgEdges.mechanism, "team"), eq(orgEdges.target, context.teamId)));
		for (const row of teamMatches) {
			matchedFromUserIds.add(row.fromUserId);
		}
	}

	// If any edges matched, return those fromUserIds
	if (matchedFromUserIds.size > 0) {
		return Array.from(matchedFromUserIds);
	}

	// Fallback: return all human user IDs
	const humanUsers = await users.listUsersByKind(db, "human");
	return humanUsers.map((u) => u.id);
}
