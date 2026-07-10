/**
 * AK7 — app selection helper.
 *
 * Handles bet_* surfaces only. routine_delegate is owned by the routine scheduler.
 *
 * Steps:
 *   1. enumerateTeamCandidates — eligible team candidates (bet_* only, role-only,
 *      orderBy users.id). This is the membership-group join (mechanism, not knowledge).
 *   2. Emit work_selection_requested (observable occasion — audit-only in AK7).
 *   3. Resolve agent selection through app-owned defaults.
 *   4. Resolve + validate the returned id (guard: active AI user-id → null on failure).
 *
 * Returns the chosen users.id or null. null → caller takes its no-agent path.
 * NEVER spawns a session, NEVER reads a persona, NEVER enforces cost.
 *
 * @lore AK7: selectOwner is the single caller for bet_* selection. All
 * bet_* selection surfaces call selectOwner.
 *
 * @lore AK7: Off-team valid agents: the Kernel attaches to any valid active user-id
 * the resolver returns. team-membership is the resolver's concern, not an
 * Execution-side veto (concept §3 case 2). Out-of-scope now but noted for future
 * invariant if team-scoped cost attribution is added.
 */

import { type HyperIdleDb, teamMembers, users } from "@hyperidle/db";
import { type EventBus, findRoleCatalogEntry, type UserRole } from "@hyperidle/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { SelectionCandidate } from "../app-runtime/contracts.js";
import { resolveAgentSelection } from "./agent-defaults/resolvers.js";

/**
 * AK7: Enumerate eligible team candidates for bet_* selection surfaces.
 *
 * Wraps findEligibleTeamAgents and projects each user row into SelectionCandidate
 * (role ONLY — no systemPrompt, no skills, no WIP; bet_* selection is WIP-blind
 * per concept §3a). MUST use orderBy(users.id) so the spreadIndex round-robin
 * maps deterministically across stateless per-task calls.
 *
 * Eligibility criteria (identical to bet-decomposition.ts:91-114):
 *   - kind = 'ai'
 *   - status = 'active'
 *   - teamId in the team's membership group ids
 *   - role maps to category='team' in the role catalog
 *
 * @lore AK7: orderBy(users.id) is load-bearing: without it the i%len round-robin
 * spread is non-deterministic (DB-scan order varies). The golden test (§7) pins
 * the candidate order by inserting agents with lexicographically ordered ids and
 * asserts [A,B,A] on spread — a collapsed impl yields [A,A,A] and fails.
 */
export async function enumerateTeamCandidates(
	db: HyperIdleDb,
	teamId: string,
): Promise<SelectionCandidate[]> {
	// 1. Resolve membership group ids for this team (1:1 invariant in practice).
	const memberGroups = await db
		.select({ id: teamMembers.id })
		.from(teamMembers)
		.where(eq(teamMembers.teamId, teamId));
	if (memberGroups.length === 0) return [];

	const memberGroupIds = memberGroups.map((m) => m.id);

	// 2. Fetch active AI users in those membership groups, ordered by users.id.
	//    orderBy(users.id) is load-bearing for deterministic round-robin spread.
	const rows = await db
		.select({ id: users.id, role: users.role })
		.from(users)
		.where(
			and(eq(users.kind, "ai"), eq(users.status, "active"), inArray(users.teamId, memberGroupIds)),
		)
		.orderBy(users.id);

	// 3. Filter to category='team' via the role catalog; project to SelectionCandidate.
	//    role-only — no systemPrompt, no skills, no WIP (bet_* is WIP-blind, concept §3a).
	return rows
		.filter((u) => {
			const entry = findRoleCatalogEntry(u.role);
			return entry?.category === "team";
		})
		.map((u) => ({ agentId: u.id, role: u.role as UserRole }));
}

/**
 * AK7 — app selection helper for bet_* surfaces.
 *
 * Returns the chosen users.id or null. null → caller takes its no-agent path.
 *
 * @lore AK8: "bet_decomposer" is production-dead post-AK8. AK8 removed the only
 * production caller. The surface
 * value is retained in the union — not pruned — to avoid churning AK7's protected
 * union tests and the closed surface set. A future dead-code sweep may remove it
 * once AK7 test fixtures are updated. See AK8 plan §Key design decisions.
 */
export async function selectOwner(
	deps: { db: HyperIdleDb; eventBus: EventBus },
	occasion: {
		surface: "bet_task" | "bet_decomposer";
		teamId: string;
		workKey: string;
		roleHint: UserRole | null;
		spreadIndex?: number | null;
	},
): Promise<string | null> {
	const { db, eventBus } = deps;

	// Step 1: Enumerate eligible team candidates (mechanism, not knowledge).
	const candidates = await enumerateTeamCandidates(db, occasion.teamId);

	// Step 2: Emit work_selection_requested BEFORE resolving (emit-then-call ordering).
	// The event is the observable occasion (audit-only in AK7); the resolver call is the reply.
	// @lore AK7: Idempotency — a crash between emit and ownerAgentId write leaves only an
	// orphan audit record; re-running re-emits and existing CAS/owner-already-set guards
	// prevent double-assignment.
	eventBus.emit({
		type: "work_selection_requested",
		streamId: occasion.teamId,
		teamId: occasion.teamId,
		surface: occasion.surface,
		workKey: occasion.workKey,
		roleHint: occasion.roleHint,
		at: new Date().toISOString(),
	});

	// Step 3: Resolve the agent decision.
	const { agentId } = await resolveAgentSelection({
		db,
		surface: occasion.surface,
		teamId: occasion.teamId,
		workKey: occasion.workKey,
		candidates,
		roleHint: occasion.roleHint,
		spreadIndex: occasion.spreadIndex ?? null,
		excludeAgentId: null,
		skillId: null,
	});

	// Step 4: Resolve + validate the returned id (the unattachable-session guard).
	// Contract (concept §3): selection can NEVER produce an unattachable session.
	//   - agentId null → no agent
	//   - id missing from users table → null (treat as no-agent)
	//   - kind !== 'ai' → null (no attaching human users)
	//   - status !== 'active' → null (inactive agents cannot be attached)
	//   - off-team but otherwise valid → attach (Kernel attaches to any valid active user-id)
	if (agentId === null) {
		return null;
	}

	const [row] = await db.select().from(users).where(eq(users.id, agentId)).limit(1);

	if (!row || row.kind !== "ai" || row.status !== "active") {
		return null;
	}

	return agentId;
}
