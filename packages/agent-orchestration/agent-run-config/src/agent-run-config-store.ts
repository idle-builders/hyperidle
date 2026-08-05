/**
 * AU26 G1 — the sole reader/writer of `agent_run_config` (architecture §D-L).
 *
 * @lore AU26 G1: these six fields lived on `users` until AU26. Core administers
 * them (Settings → Agents writes them, the agent profile renders them) but
 * never operationally consumes them for its own purpose — only an agent's
 * session does. So the columns relocated into an `agent-orchestration`-owned
 * table and `users` stayed the single human + agent identity record.
 *
 * @lore AU26 G1: **absent row ≡ all-null row.** `readAgentRunConfig` returns
 * `DEFAULT_AGENT_RUN_CONFIG` rather than `undefined` when an agent has no row.
 * That is the §D-L backfill invariant restated for the steady state: the
 * effective defaults live in the resolvers (provisioning's `"workhorse"` tier
 * fallback, adapter selection's "null harness ⇒ any adapter eligible"), never
 * in the columns — so an agent with no row must resolve exactly what an agent
 * with an all-null row resolves. Callers must NOT treat a missing row as
 * "agent does not exist": existence is a `users` question, and mixing the two
 * would turn a never-configured agent into a fail-closed one.
 */

import {
	agentRunConfig,
	type HyperIdleDb,
	type NewAgentRunConfigRow,
	type WriteExecutor,
} from "@hyperidle/db";
import { eq, inArray } from "drizzle-orm";

/** One agent's run configuration, keyless — the `users.id` is the caller's context. */
export interface AgentRunConfig {
	readonly systemPrompt: string | null;
	readonly harnessType: string | null;
	readonly modelTierPreference: string | null;
	readonly modelId: string | null;
	readonly modelProvider: string | null;
	readonly maxConcurrentSessions: number;
}

/**
 * The effective config of an agent with no `agent_run_config` row — identical
 * to an all-null row, because `max_concurrent_sessions` is the one column with
 * a NOT NULL DEFAULT 1 (its exact pre-move shape on `users`).
 */
export const DEFAULT_AGENT_RUN_CONFIG: AgentRunConfig = {
	systemPrompt: null,
	harnessType: null,
	modelTierPreference: null,
	modelId: null,
	modelProvider: null,
	maxConcurrentSessions: 1,
};

/**
 * A partial run-config write. A present key is written (including an explicit
 * `null`); an absent key is left alone.
 *
 * Deliberately NOT `Partial<AgentRunConfig>`: that inherits `readonly` on every
 * field, so a caller assembling a patch field-by-field (which is exactly what
 * `PATCH /api/agents/:id`'s `"field" in body` walk does) could not build one.
 */
export type AgentRunConfigPatch = {
	-readonly [K in keyof AgentRunConfig]?: AgentRunConfig[K];
};

const CONFIG_COLUMNS = {
	systemPrompt: agentRunConfig.systemPrompt,
	harnessType: agentRunConfig.harnessType,
	modelTierPreference: agentRunConfig.modelTierPreference,
	modelId: agentRunConfig.modelId,
	modelProvider: agentRunConfig.modelProvider,
	maxConcurrentSessions: agentRunConfig.maxConcurrentSessions,
} as const;

/** Read one agent's effective run config. Never `undefined` — see this module's `@lore`. */
export async function readAgentRunConfig(
	exec: HyperIdleDb,
	agentUserId: string,
): Promise<AgentRunConfig> {
	const [row] = await exec
		.select(CONFIG_COLUMNS)
		.from(agentRunConfig)
		.where(eq(agentRunConfig.agentUserId, agentUserId))
		.limit(1);
	return row ?? DEFAULT_AGENT_RUN_CONFIG;
}

/**
 * Read many agents' effective run configs in one query.
 *
 * Every requested id is present in the returned map — an agent with no row maps
 * to `DEFAULT_AGENT_RUN_CONFIG`, same rule as {@link readAgentRunConfig}. An
 * empty `agentUserIds` returns an empty map without querying.
 */
export async function readAgentRunConfigs(
	exec: HyperIdleDb,
	agentUserIds: readonly string[],
): Promise<Map<string, AgentRunConfig>> {
	const result = new Map<string, AgentRunConfig>();
	for (const id of agentUserIds) result.set(id, DEFAULT_AGENT_RUN_CONFIG);
	if (agentUserIds.length === 0) return result;

	const rows = await exec
		.select({ agentUserId: agentRunConfig.agentUserId, ...CONFIG_COLUMNS })
		.from(agentRunConfig)
		.where(inArray(agentRunConfig.agentUserId, [...agentUserIds]));

	for (const { agentUserId, ...config } of rows) {
		result.set(agentUserId, config);
	}
	return result;
}

/**
 * Upsert one agent's run config.
 *
 * Insert path: absent fields take `DEFAULT_AGENT_RUN_CONFIG`'s value. Update
 * path: only the patch's own keys are written, so a single-field edit never
 * silently resets a sibling field — the `"field" in body` semantics
 * `PATCH /api/agents/:id` has always had.
 */
export async function writeAgentRunConfig(
	exec: WriteExecutor,
	agentUserId: string,
	patch: AgentRunConfigPatch,
): Promise<void> {
	const insertValues: NewAgentRunConfigRow = {
		agentUserId,
		systemPrompt: patch.systemPrompt ?? DEFAULT_AGENT_RUN_CONFIG.systemPrompt,
		harnessType: patch.harnessType ?? DEFAULT_AGENT_RUN_CONFIG.harnessType,
		modelTierPreference: patch.modelTierPreference ?? DEFAULT_AGENT_RUN_CONFIG.modelTierPreference,
		modelId: patch.modelId ?? DEFAULT_AGENT_RUN_CONFIG.modelId,
		modelProvider: patch.modelProvider ?? DEFAULT_AGENT_RUN_CONFIG.modelProvider,
		maxConcurrentSessions:
			patch.maxConcurrentSessions ?? DEFAULT_AGENT_RUN_CONFIG.maxConcurrentSessions,
	};

	const updateSet: Partial<NewAgentRunConfigRow> = {};
	if ("systemPrompt" in patch) updateSet.systemPrompt = patch.systemPrompt ?? null;
	if ("harnessType" in patch) updateSet.harnessType = patch.harnessType ?? null;
	if ("modelTierPreference" in patch)
		updateSet.modelTierPreference = patch.modelTierPreference ?? null;
	if ("modelId" in patch) updateSet.modelId = patch.modelId ?? null;
	if ("modelProvider" in patch) updateSet.modelProvider = patch.modelProvider ?? null;
	if (patch.maxConcurrentSessions !== undefined)
		updateSet.maxConcurrentSessions = patch.maxConcurrentSessions;

	const insert = exec.insert(agentRunConfig).values(insertValues);
	if (Object.keys(updateSet).length === 0) {
		await insert.onConflictDoNothing();
		return;
	}
	await insert.onConflictDoUpdate({ target: agentRunConfig.agentUserId, set: updateSet });
}
