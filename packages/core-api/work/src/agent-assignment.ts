/**
 * AU21 §6 Decision F1 fold — `work`'s own `bet_task`/`bet_decomposer`
 * selection, relocated from the standalone `agent-selection` Service.
 *
 * Traced from source: `agent-selection/src/service.ts`'s `candidates()` +
 * `selectBetAgent()` only ever read `work`'s OWN already-injected
 * `teamCapacity` (→ `org`) and `users` (→ `@hyperidle/users`) ports (both
 * ordinary same-layer core-api edges per `ports.ts`'s own `@lore`) — the
 * standalone package added no capability `work` doesn't already have wired.
 * This module is the mechanical relocation: same algorithm, no DI port to a
 * separate Service, no behavior change.
 *
 * `routine_delegate` (the third `selectAgent` surface) does NOT move here —
 * it's a `routine`-owned decision (`@hyperidle/routine`'s
 * `agent-delegation.ts`) with a materially different candidate source
 * (`userSkills`, not team membership).
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { type EventBus, findRoleCatalogEntry, type UserRole } from "@hyperidle/shared";

export interface AgentAssignmentCandidate {
	readonly agentId: string;
	readonly role: UserRole;
}

interface AgentAssignmentUserRow {
	readonly id: string;
	readonly kind: string;
	readonly status: string;
	readonly role: string;
}

/** Structural mirror of `work`'s own already-injected `TeamCapacityReader`/`UserStoreReader` ports. */
export interface AgentAssignmentDeps {
	readonly teamCapacity: {
		getByTeamId(db: HyperIdleDb, teamId: string): Promise<{ readonly id: string } | undefined>;
	};
	readonly users: {
		listActiveAiUsersByTeams(
			db: HyperIdleDb,
			teamMembersIds: string[],
		): Promise<readonly AgentAssignmentUserRow[]>;
		getUserById(db: HyperIdleDb, id: string): Promise<AgentAssignmentUserRow | undefined>;
	};
}

/** WIP-blind active team candidates (category `"team"` in the role catalog), stable ascending id order. */
export async function listBetSelectionCandidates(
	db: HyperIdleDb,
	teamId: string,
	deps: AgentAssignmentDeps,
): Promise<readonly AgentAssignmentCandidate[]> {
	const membership = await deps.teamCapacity.getByTeamId(db, teamId);
	if (!membership) return [];
	const rows = await deps.users.listActiveAiUsersByTeams(db, [membership.id]);
	return rows
		.filter((user) => findRoleCatalogEntry(user.role)?.category === "team")
		.map((user) => ({ agentId: user.id, role: user.role }))
		.sort((left, right) => left.agentId.localeCompare(right.agentId));
}

async function validateSelectedAgent(
	db: HyperIdleDb,
	agentId: string | null,
	users: AgentAssignmentDeps["users"],
): Promise<{ readonly agentId: string | null }> {
	if (agentId === null) return { agentId: null };
	const user = await users.getUserById(db, agentId);
	return { agentId: user?.kind === "ai" && user.status === "active" ? agentId : null };
}

/**
 * Resolve a `bet_task`'s owner: role match wins, else round-robins by
 * `spreadIndex` over the WIP-blind candidate population. Emits
 * `work_selection_requested` (AC1 observable occasion) before resolving,
 * same as the retired Service did.
 */
export async function selectBetTaskOwner(
	db: HyperIdleDb,
	eventBus: EventBus,
	deps: AgentAssignmentDeps,
	occasion: {
		readonly teamId: string;
		readonly workKey: string;
		readonly roleHint: UserRole | null;
		readonly spreadIndex: number;
	},
): Promise<{ readonly agentId: string | null }> {
	const population = await listBetSelectionCandidates(db, occasion.teamId, deps);
	eventBus.emit({
		type: "work_selection_requested",
		streamId: occasion.teamId,
		teamId: occasion.teamId,
		surface: "bet_task",
		workKey: occasion.workKey,
		roleHint: occasion.roleHint,
		at: new Date().toISOString(),
	});

	const roleMatch = occasion.roleHint
		? population.find((candidate) => candidate.role === occasion.roleHint)
		: undefined;
	const agentId = roleMatch
		? roleMatch.agentId
		: population.length === 0
			? null
			: (population[occasion.spreadIndex % population.length]?.agentId ?? null);
	return validateSelectedAgent(db, agentId, deps.users);
}

/**
 * Resolve a `bet_decomposer`: prefers `roleHint` (the caller always passes
 * `"product_manager"`), else the first WIP-blind candidate.
 */
export async function selectBetDecomposerAgent(
	db: HyperIdleDb,
	eventBus: EventBus,
	deps: AgentAssignmentDeps,
	occasion: {
		readonly teamId: string;
		readonly workKey: string;
		readonly roleHint: UserRole | null;
	},
): Promise<{ readonly agentId: string | null }> {
	const population = await listBetSelectionCandidates(db, occasion.teamId, deps);
	eventBus.emit({
		type: "work_selection_requested",
		streamId: occasion.teamId,
		teamId: occasion.teamId,
		surface: "bet_decomposer",
		workKey: occasion.workKey,
		roleHint: occasion.roleHint,
		at: new Date().toISOString(),
	});

	const chosen = occasion.roleHint
		? (population.find((candidate) => candidate.role === occasion.roleHint) ?? population[0])
		: population[0];
	return validateSelectedAgent(db, chosen?.agentId ?? null, deps.users);
}
