/**
 * AU26 G1 — the sole reader/writer of `agent_run_config` (architecture §D-L).
 *
 * @lore AU26 G1: these fields (six at the time) lived on `users` until AU26. Core administers
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

/**
 * A harness option's value. The four control shapes a harness may declare
 * (select, boolean, number, text) collapse to these three value types.
 */
export type ModelOptionValue = string | number | boolean;

/**
 * The options an agent's model runs with, keyed by the option keys its harness
 * declares for that model.
 *
 * **Sparse.** Only a value the user moved away from the harness's own default is
 * present. An absent key means "whatever the harness does" — never "unset" —
 * which is what keeps an agent that was never configured running exactly as it
 * did before this existed, and stops an agent being frozen to whatever the
 * default happened to be the day someone opened the editor.
 */
export type ModelOptions = Readonly<Record<string, ModelOptionValue>>;

/**
 * Parse the stored JSON text into options.
 *
 * Anything that is not a JSON object of scalar values reads as no options. The
 * column is written only by {@link writeAgentRunConfig}, so a value that fails
 * this is a corrupted or hand-edited row; degrading to "no options" makes such a
 * row behave as an unconfigured agent rather than failing the agent's run.
 */
function parseModelOptions(raw: string | null): ModelOptions {
	if (raw === null) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
		const out: Record<string, ModelOptionValue> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
				out[key] = value;
			}
		}
		return out;
	} catch {
		return {};
	}
}

/** Serialize options for storage. No options is stored as NULL, not as `"{}"`. */
function serializeModelOptions(options: ModelOptions): string | null {
	return Object.keys(options).length === 0 ? null : JSON.stringify(options);
}

/** One agent's run configuration, keyless — the `users.id` is the caller's context. */
export interface AgentRunConfig {
	readonly systemPrompt: string | null;
	readonly harnessType: string | null;
	readonly modelId: string | null;
	readonly modelProvider: string | null;
	readonly maxConcurrentSessions: number;
	readonly modelOptions: ModelOptions;
}

/**
 * The effective config of an agent with no `agent_run_config` row — identical
 * to an all-null row, because `max_concurrent_sessions` is the one column with
 * a NOT NULL DEFAULT 1 (its exact pre-move shape on `users`).
 */
export const DEFAULT_AGENT_RUN_CONFIG: AgentRunConfig = {
	systemPrompt: null,
	harnessType: null,
	modelId: null,
	modelProvider: null,
	maxConcurrentSessions: 1,
	modelOptions: {},
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
	modelId: agentRunConfig.modelId,
	modelProvider: agentRunConfig.modelProvider,
	maxConcurrentSessions: agentRunConfig.maxConcurrentSessions,
	modelOptionsJson: agentRunConfig.modelOptionsJson,
} as const;

/** Map a selected row's columns onto the config shape. */
function rowToConfig(row: {
	systemPrompt: string | null;
	harnessType: string | null;
	modelId: string | null;
	modelProvider: string | null;
	maxConcurrentSessions: number;
	modelOptionsJson: string | null;
}): AgentRunConfig {
	const { modelOptionsJson, ...rest } = row;
	return { ...rest, modelOptions: parseModelOptions(modelOptionsJson) };
}

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
	return row ? rowToConfig(row) : DEFAULT_AGENT_RUN_CONFIG;
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

	for (const { agentUserId, ...row } of rows) {
		result.set(agentUserId, rowToConfig(row));
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
		modelId: patch.modelId ?? DEFAULT_AGENT_RUN_CONFIG.modelId,
		modelProvider: patch.modelProvider ?? DEFAULT_AGENT_RUN_CONFIG.modelProvider,
		maxConcurrentSessions:
			patch.maxConcurrentSessions ?? DEFAULT_AGENT_RUN_CONFIG.maxConcurrentSessions,
		modelOptionsJson: serializeModelOptions(
			patch.modelOptions ?? DEFAULT_AGENT_RUN_CONFIG.modelOptions,
		),
	};

	const updateSet: Partial<NewAgentRunConfigRow> = {};
	if ("systemPrompt" in patch) updateSet.systemPrompt = patch.systemPrompt ?? null;
	if ("harnessType" in patch) updateSet.harnessType = patch.harnessType ?? null;
	if ("modelId" in patch) updateSet.modelId = patch.modelId ?? null;
	if ("modelProvider" in patch) updateSet.modelProvider = patch.modelProvider ?? null;
	if (patch.maxConcurrentSessions !== undefined)
		updateSet.maxConcurrentSessions = patch.maxConcurrentSessions;
	if ("modelOptions" in patch)
		updateSet.modelOptionsJson = serializeModelOptions(patch.modelOptions ?? {});

	const insert = exec.insert(agentRunConfig).values(insertValues);
	if (Object.keys(updateSet).length === 0) {
		await insert.onConflictDoNothing();
		return;
	}
	await insert.onConflictDoUpdate({ target: agentRunConfig.agentUserId, set: updateSet });
}
