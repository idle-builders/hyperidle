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
 * @lore AU44 B1: `resolveTeamAgentHarness` inlined (one caller, no file needed).
 * `teamMembersId` parameter renamed to `teamId` — `users.teamId` now references
 * `teams.id` directly (team_members dissolved). `OrgAgentRunConfigWriter` folded
 * into `OrgUserDirectory`.
 *
 * @lore AU19 Increment 1c: two conversions from the pre-migration
 * `packages/server/src/services/scaffold-agents.ts`:
 *  (1) `AgentScaffoldSpec` is declared here; `framework/factory-defaults` carries a parallel
 *      declaration that was NOT removed (factory-defaults cannot import from a core-api service).
 *      The two declarations are structurally compatible but not de-duped.
 *  (2) `getUserById`/`insertUser` are an injected `OrgUserDirectory` port (Mechanism C).
 */

import type { WriteExecutor } from "@hyperidle/db";
import type { PrimaryHarnessConfig } from "@hyperidle/domain-model";
import type { OrgUserDirectory } from "./ports.js";

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
 * top.
 *
 * @lore AU44 B1: `framework/factory-defaults` carries a parallel `AgentScaffoldSpec`
 * declaration that was not removed — factory-defaults cannot import from a service-layer
 * package (`@hyperidle/org` lives in core-api). The two declarations are structurally
 * compatible; a future AU pass can place the canonical copy in the lowest shared package
 * both can reach.
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
 */
async function resolveAgentId(
	db: WriteExecutor,
	users: Pick<OrgUserDirectory, "getUserById">,
	idHint: string | undefined,
): Promise<string> {
	if (!idHint) return crypto.randomUUID();
	if (idHint.startsWith("system:")) return crypto.randomUUID();
	const existing = await users.getUserById(db, idHint);
	if (existing) return crypto.randomUUID();
	return idHint;
}

/**
 * Inline of the former `resolveTeamAgentHarness` from `team-default-harness.ts`.
 * Returns undefined when both explicit and team default are unset so the
 * builtin fallback in `persistScaffoldedAgents` applies.
 *
 * @lore AU44 B1: `team-default-harness.ts` deleted; one caller, no file needed.
 */
function resolveHarness(
	explicit: PrimaryHarnessConfig | undefined,
	team:
		| {
				defaultHarnessType?: string | null;
				defaultModelId?: string | null;
				defaultModelProvider?: string | null;
		  }
		| undefined,
): PrimaryHarnessConfig | undefined {
	if (explicit !== undefined) return explicit;
	if (team?.defaultHarnessType != null) {
		return {
			harnessType: team.defaultHarnessType,
			modelId: team.defaultModelId ?? "claude-sonnet-4-6",
			modelProvider: team.defaultModelProvider ?? "anthropic",
		};
	}
	return undefined;
}

/**
 * Persist the scaffolded agent specs returned by a Strategy.
 *
 * @param db      - The database handle.
 * @param users   - Injected `users` Service port (Mechanism C).
 * @param teamId  - teams.id to set as users.teamId (null for non-team-scoped agents).
 * @param specs   - The app-owned agent specs to persist.
 * @param harness - Optional harness hint. Pass a `PrimaryHarnessConfig` (explicit) OR
 *                  the `team` row (defaultHarnessType/modelId/modelProvider fields —
 *                  the writer resolves team default → builtin). Omit to use builtin.
 * @returns { agentIds, leadAgentId }
 *
 * @lore AU44 B1: param `teamMembersId` renamed to `teamId` — after the fold
 * `users.teamId` references `teams.id` directly. Callers that passed a teamMembersId
 * now pass the teamId.
 */
export async function persistScaffoldedAgents(
	db: WriteExecutor,
	users: OrgUserDirectory,
	teamId: string | null,
	specs: readonly AgentScaffoldSpec[],
	harness?: PrimaryHarnessConfig | TeamHarnessDefault,
): Promise<ScaffoldResult> {
	// Resolve explicit → team-default → builtin internally.
	let resolvedHarness: PrimaryHarnessConfig | undefined;
	if (harness !== undefined) {
		if ("harnessType" in harness) {
			resolvedHarness = harness;
		} else {
			resolvedHarness = resolveHarness(undefined, harness);
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
			teamId: teamId,
			createdAt: now,
		});
		await users.writeAgentRunConfig(db, agentId, {
			systemPrompt: spec.systemPrompt,
			harnessType: resolvedHarness?.harnessType ?? "builtin",
			modelId: resolvedHarness?.modelId ?? "claude-sonnet-4-6",
			modelProvider: resolvedHarness?.modelProvider ?? "anthropic",
			maxConcurrentSessions: spec.role === "builder" ? 3 : 1,
		});

		if (spec.role === "product_manager" && firstProductManagerId === null) {
			firstProductManagerId = agentId;
		}
	}

	leadAgentId = firstProductManagerId ?? agentIds[0] ?? null;
	return { agentIds, leadAgentId };
}
