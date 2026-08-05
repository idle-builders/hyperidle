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
 *
 * @lore AU19 Increment 1c: two conversions from the pre-migration
 * `packages/server/src/services/scaffold-agents.ts`:
 *  (1) `AgentScaffoldSpec` is redeclared locally (structurally identical to
 *      `packages/server/src/services/contracts.ts`'s type) rather than
 *      imported — `contracts.ts` is a cross-cutting registry-strategy
 *      contracts file shared by many not-yet-migrated Services (not one of
 *      `org`'s §4 seed files), so importing it would be a real Mechanism-C
 *      violation. TypeScript's structural typing means callers building an
 *      object matching the shape (from `contracts.ts`'s `AgentScaffoldSpec`
 *      or any equivalent shape) still typecheck unchanged — same idiom as
 *      `@hyperidle/work`'s `WorkUserRow` vs. the real `users` row type.
 *  (2) `getUserById`/`insertUser` are an injected `OrgUserDirectory` port
 *      (Mechanism C) instead of a relative import of the sibling
 *      `user-store.ts` — an ordinary downward core-api→core-api edge (NOT
 *      §10.3 against-grain; `users` just hasn't migrated to its own package
 *      yet). Callers pass the real `packages/server` function references
 *      unchanged — no behavior change.
 */

import type { WriteExecutor } from "@hyperidle/db";
import type { PrimaryHarnessConfig } from "@hyperidle/shared";
import type { OrgAgentRunConfigWriter, OrgUserDirectory } from "./ports.js";
import { resolveTeamAgentHarness } from "./team-default-harness.js";

export interface ScaffoldResult {
	agentIds: string[];
	leadAgentId: string | null;
}

/**
 * Either an explicit resolved PrimaryHarnessConfig, or the team's default
 * columns (the writer resolves explicit → team-default → builtin internally).
 *
 * @lore AU20 Am7: callers no longer pre-compute `resolveTeamAgentHarness`
 * separately; they pass either an explicit PrimaryHarnessConfig or the team
 * object directly (structurally satisfies `TeamHarnessDefault`).
 */
type TeamHarnessDefault = {
	readonly defaultHarnessType: string | null;
	readonly defaultModelId: string | null;
	readonly defaultModelProvider: string | null;
};

/**
 * The knowledge-only shape a Strategy returns (persona, role, category) — the
 * Kernel (`persistScaffoldedAgents`) attaches identity + mechanism fields on
 * top. Structurally identical to `packages/server/src/services/
 * contracts.ts`'s `AgentScaffoldSpec` (see the Increment 1c `@lore` above).
 */
export interface AgentScaffoldSpec {
	readonly role: string;
	readonly name: string;
	readonly agentCategory: "team" | "strategy" | "individual";
	readonly systemPrompt: string | null;
	readonly idHint?: string;
}

/**
 * Resolve the id to assign to a scaffolded agent.
 *
 * Rules:
 * 1. If idHint starts with "system:" → always fresh UUID (deny-set).
 * 2. If idHint is free (no row with that id exists) → use it.
 * 3. If idHint collides → fresh UUID.
 * 4. If no idHint → fresh UUID.
 */
async function resolveAgentId(
	db: WriteExecutor,
	users: Pick<OrgUserDirectory, "getUserById">,
	idHint: string | undefined,
): Promise<string> {
	if (!idHint) return crypto.randomUUID();
	// Deny-set: system: prefix is the Kernel/system namespace — never assignable via hint.
	if (idHint.startsWith("system:")) return crypto.randomUUID();
	// Check for collision
	const existing = await users.getUserById(db, idHint);
	if (existing) return crypto.randomUUID();
	return idHint;
}

/**
 * Persist the scaffolded agent specs returned by a Strategy.
 *
 * @param db             - The database handle.
 * @param users          - Injected `users` Service port (Mechanism C).
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
/**
 * Persist the scaffolded agent specs returned by a Strategy.
 *
 * @param db             - The database handle.
 * @param users          - Injected `users` Service port (Mechanism C).
 * @param teamMembersId  - teamMembers.id to set as users.teamId (null for non-team-scoped agents).
 * @param specs          - The app-owned agent specs to persist.
 * @param harness        - Optional harness hint. Pass a `PrimaryHarnessConfig` (explicit,
 *                         already resolved) OR the `team` row (defaultHarnessType/modelId/
 *                         modelProvider fields — the writer resolves team default → builtin).
 *                         Omit (or pass undefined) to use the builtin/sonnet-4-6 fallback.
 * @returns              { agentIds, leadAgentId } — the assigned users.id values.
 *
 * @lore AU20 Am7: `resolveTeamAgentHarness` is folded in — callers no longer
 * pre-compute it separately. Pass `team` directly; the writer resolves
 * explicit → team-default → builtin. Existing callers that already resolved
 * the harness (i.e. pass a `PrimaryHarnessConfig` directly) continue to work
 * unchanged because `PrimaryHarnessConfig` has `harnessType: string` while
 * `TeamHarnessDefault` has `defaultHarnessType: string | null` — structurally
 * disjoint, discriminated by `'harnessType' in harness`.
 */
export async function persistScaffoldedAgents(
	db: WriteExecutor,
	users: Pick<OrgUserDirectory, "getUserById" | "insertUser"> & OrgAgentRunConfigWriter,
	teamMembersId: string | null,
	specs: readonly AgentScaffoldSpec[],
	harness?: PrimaryHarnessConfig | TeamHarnessDefault,
): Promise<ScaffoldResult> {
	// Resolve explicit → team-default → builtin internally.
	let resolvedHarness: PrimaryHarnessConfig | undefined;
	if (harness !== undefined) {
		if ("harnessType" in harness) {
			// Explicit PrimaryHarnessConfig (already resolved by caller).
			resolvedHarness = harness;
		} else {
			// TeamHarnessDefault — resolve via the folded-in logic.
			resolvedHarness = resolveTeamAgentHarness(undefined, harness);
		}
	}

	const now = new Date().toISOString();
	const agentIds: string[] = [];
	let leadAgentId: string | null = null;
	let firstProductManagerId: string | null = null;

	for (const spec of specs) {
		const agentId = await resolveAgentId(db, users, spec.idHint);
		agentIds.push(agentId);

		await users.insertUser(db, {
			id: agentId,
			kind: "ai",
			name: spec.name,
			role: spec.role,
			agentCategory: spec.agentCategory,
			status: "active",
			teamId: teamMembersId,
			createdAt: now,
		});
		// AU26 G1 (§D-L): the Kernel-owned mechanism fields — NOT on the spec
		// (closure contract) — moved off `users` into `agent_run_config`, so the
		// single writer now makes two writes. The values themselves are unchanged.
		await users.writeAgentRunConfig(db, agentId, {
			systemPrompt: spec.systemPrompt,
			// POLISH-060 B3: Use resolvedHarness when supplied; fall back to builtin/sonnet-4-6.
			harnessType: resolvedHarness?.harnessType ?? "builtin",
			modelId: resolvedHarness?.modelId ?? "claude-sonnet-4-6",
			modelProvider: resolvedHarness?.modelProvider ?? "anthropic",
			// builders can run 3 concurrent sessions; all others 1.
			maxConcurrentSessions: spec.role === "builder" ? 3 : 1,
		});

		if (spec.role === "product_manager" && firstProductManagerId === null) {
			firstProductManagerId = agentId;
		}
	}

	// Lead = first product_manager; else first spec.
	leadAgentId = firstProductManagerId ?? agentIds[0] ?? null;

	return { agentIds, leadAgentId };
}
