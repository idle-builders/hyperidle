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
 * @lore AK6: bootstrap-swap exception — the factory bootstrap at the leaf/desktop
 * layer (packages/db/factory-bootstrap.ts) is a PERMANENT registry-free exception.
 * It seeds the *default* roster because it runs before any Strategy is registered
 * (4 boot paths: desktop + 3 leaf CLIs run before startServer()). This helper
 * covers only the 3 server-side creation surfaces that DO have the registry.
 * This does not violate AC2 because the leaf path carries a *value*
 * (FactoryRosterSpec), not a Kernel decision.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { users } from "@hyperidle/db";
import type { PrimaryHarnessConfig } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { AgentScaffoldSpec } from "../app-runtime/contracts.js";

export interface ScaffoldResult {
	agentIds: string[];
	leadAgentId: string | null;
}

export type { PrimaryHarnessConfig };

/**
 * Resolve the id to assign to a scaffolded agent.
 *
 * Rules:
 * 1. If idHint starts with "system:" → always fresh UUID (deny-set).
 * 2. If idHint is free (no row with that id exists) → use it.
 * 3. If idHint collides → fresh UUID.
 * 4. If no idHint → fresh UUID.
 */
async function resolveAgentId(db: HyperIdleDb, idHint: string | undefined): Promise<string> {
	if (!idHint) return crypto.randomUUID();
	// Deny-set: system: prefix is the Kernel/system namespace — never assignable via hint.
	if (idHint.startsWith("system:")) return crypto.randomUUID();
	// Check for collision
	const [existing] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, idHint))
		.limit(1);
	if (existing) return crypto.randomUUID();
	return idHint;
}

/**
 * Persist the scaffolded agent specs returned by a Strategy.
 *
 * @param db             - The database handle.
 * @param teamMembersId  - teamMembers.id to set as users.teamId (null for non-team-scoped agents).
 * @param specs          - The app-owned agent specs to persist.
 * @param primaryHarness - Optional. When supplied, all agents use this harness/model instead
 *                         of the builtin/sonnet-4-6 default. Used by onboarding (B3) to wire
 *                         the user's chosen harness into every created agent.
 * @returns              { agentIds, leadAgentId } — the assigned users.id values.
 *
 * Mechanism fields set here (NOT on the spec):
 *   kind: "ai", status: "active", teamId: teamMembersId,
 *   harnessType: primaryHarness?.harnessType ?? "builtin",
 *   modelId: primaryHarness?.modelId ?? "claude-sonnet-4-6",
 *   modelProvider: primaryHarness?.modelProvider ?? "anthropic",
 *   maxConcurrentSessions: 3 if builder else 1,
 *   createdAt: now.
 *
 * Lead = first product_manager in specs; else first spec.
 *
 * @lore POLISH-060 B3: primaryHarness is optional so all existing callers (factory
 * bootstrap, seed paths) are unaffected. The Kernel owns mechanism fields; the
 * caller supplies the policy (which harness to use for this team).
 */
export async function persistScaffoldedAgents(
	db: HyperIdleDb,
	teamMembersId: string | null,
	specs: readonly AgentScaffoldSpec[],
	primaryHarness?: PrimaryHarnessConfig,
): Promise<ScaffoldResult> {
	const now = new Date().toISOString();
	const agentIds: string[] = [];
	let leadAgentId: string | null = null;
	let firstProductManagerId: string | null = null;

	for (const spec of specs) {
		const agentId = await resolveAgentId(db, spec.idHint);
		agentIds.push(agentId);

		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: spec.name,
			role: spec.role,
			agentCategory: spec.agentCategory,
			systemPrompt: spec.systemPrompt,
			status: "active",
			// Kernel-owned mechanism fields — NOT on the spec (closure contract).
			// POLISH-060 B3: Use primaryHarness when supplied; fall back to builtin/sonnet-4-6.
			harnessType: primaryHarness?.harnessType ?? "builtin",
			modelId: primaryHarness?.modelId ?? "claude-sonnet-4-6",
			modelProvider: primaryHarness?.modelProvider ?? "anthropic",
			// builders can run 3 concurrent sessions; all others 1.
			maxConcurrentSessions: spec.role === "builder" ? 3 : 1,
			teamId: teamMembersId,
			createdAt: now,
		});

		if (spec.role === "product_manager" && firstProductManagerId === null) {
			firstProductManagerId = agentId;
		}
	}

	// Lead = first product_manager; else first spec.
	leadAgentId = firstProductManagerId ?? agentIds[0] ?? null;

	return { agentIds, leadAgentId };
}
