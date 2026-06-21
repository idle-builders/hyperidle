/**
 * AK7 RED STUB — selectOwner + enumerateTeamCandidates.
 *
 * This file is a red-phase stub. It exports the function signatures so tests
 * compile, but the implementations throw "not implemented" so tests fail at
 * runtime (the correct TDD red-phase failure mode).
 *
 * The green phase replaces these with the real implementations per architecture §4:
 *   1. enumerateTeamCandidates: findEligibleTeamAgents + orderBy(users.id) + role projection
 *   2. selectOwner:
 *      a. enumerate candidates
 *      b. emit work_selection_requested
 *      c. call getActiveStrategy().selectAgent(req)
 *      d. resolve + validate the returned id (the unattachable-session guard)
 *
 * @lore AK7: selectOwner is the SINGLE Kernel caller of getActiveStrategy().selectAgent.
 * All bet_* selection surfaces call selectOwner; routine_delegate calls selectAgentFabric
 * directly (Fabric-internal, no Kernel enumeration, concept §3a / §5.3).
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus, SelectionCandidate, UserRole } from "@hyperidle/shared";

/**
 * AK7: Enumerate eligible team candidates for bet_* selection surfaces.
 *
 * Wraps findEligibleTeamAgents and projects each User into SelectionCandidate (role only).
 * MUST add orderBy(users.id) so spreadIndex round-robin is deterministic.
 *
 * @lore AK7 RED STUB — see green phase implementation target in select-agent.ts.
 */
export async function enumerateTeamCandidates(
	_db: HyperIdleDb,
	_teamId: string,
): Promise<SelectionCandidate[]> {
	throw new Error("AK7: enumerateTeamCandidates not implemented — green phase required");
}

/**
 * AK7 — Kernel selection helper. The SINGLE caller of getActiveStrategy().selectAgent.
 *
 * Steps:
 *   1. Enumerate eligible team candidates (membership-group join + orderBy users.id).
 *   2. Emit work_selection_requested (observable occasion).
 *   3. Call the active Strategy's selectAgent (the decision).
 *   4. Resolve + validate the returned id (guard: active AI user-id → null on failure).
 *
 * Returns the chosen users.id or null. null → caller takes its no-agent path.
 * NEVER spawns a session, NEVER reads a persona, NEVER enforces cost.
 *
 * Only handles bet_* surfaces. routine_delegate is Fabric-internal (concept §3a / §5.3).
 *
 * @lore AK7 RED STUB — see green phase implementation target.
 */
export async function selectOwner(
	_deps: { db: HyperIdleDb; eventBus: EventBus },
	_occasion: {
		surface: "bet_task" | "bet_decomposer";
		teamId: string;
		workKey: string;
		roleHint: UserRole | null;
		spreadIndex?: number | null;
	},
): Promise<string | null> {
	throw new Error("AK7: selectOwner not implemented — green phase required");
}
