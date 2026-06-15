/**
 * AK6 — Kernel persist helper: persistScaffoldedAgents
 *
 * The SINGLE writer of agent users rows. The Strategy returns specs (knowledge
 * fields only); this helper assigns final ids (honoring idHint when free),
 * attaches Kernel mechanism fields, inserts, and returns the final ids + lead.
 *
 * @lore AK6: The Strategy owns *who* (AgentScaffoldSpec — persona, role,
 * category). The Kernel owns *identity + mechanism* (users.id assignment,
 * kind, status, teamId, harnessType, modelId, etc.). This helper is the
 * single enforcer of that split: specs go in, real user rows come out.
 *
 * id-hint deny/allow (concept hard-rule):
 *   - DENY: prefix `system:` (the Kernel/system namespace). Always fresh UUID.
 *   - ALLOW when free: anything else, including `ast-${userId}` and `seed-agent-*`.
 *   - Collision → fresh UUID regardless of prefix.
 *
 * @lore AK6: This stub is the RED-phase placeholder so tests compile.
 * The green-phase builder implements the real logic.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { AgentScaffoldSpec } from "@hyperidle/shared";

export interface ScaffoldResult {
	agentIds: string[];
	leadAgentId: string | null;
}

/**
 * Persist the scaffolded agent specs returned by a Strategy.
 *
 * @param db      - The database handle.
 * @param teamMembersId - teamMembers.id to set as users.teamId (null for non-team-scoped agents).
 * @param specs   - The agent specs returned by the active Strategy's scaffoldAgents().
 * @returns       { agentIds, leadAgentId } — the assigned users.id values.
 *
 * Mechanism fields set here (NOT on the spec):
 *   kind: "ai", status: "active", teamId: teamMembersId,
 *   harnessType: "builtin", modelId: "claude-sonnet-4-6",
 *   modelProvider: "anthropic", maxConcurrentSessions: 3 if builder else 1,
 *   createdAt: now.
 *
 * Lead = first product_manager in specs; else first spec.
 */
export async function persistScaffoldedAgents(
	_db: HyperIdleDb,
	_teamMembersId: string | null,
	_specs: readonly AgentScaffoldSpec[],
): Promise<ScaffoldResult> {
	// RED PHASE STUB — this function is not yet implemented.
	// Tests that call it will fail at the assertion level (not import error).
	throw new Error("persistScaffoldedAgents not implemented — AK6 green phase required");
}
