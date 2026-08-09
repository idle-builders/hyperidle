import { createHash } from "node:crypto";
import {
	type ConfigurationOverrideRow,
	configurationOverrides,
	type HyperIdleDb,
	type PluginConfigurationDefaultRow,
	type PluginRow,
	pluginConfigurationDefaults,
	plugins,
	type ServiceConnectionRow,
} from "@hyperidle/db";
import {
	BUILTIN_PLUGIN_ID,
	BUILTIN_TOOL_CATALOG,
	CONFIGURATION_KINDS,
	type ConfigurationKind,
	type ConfigurationOrigin,
	type PluginState,
	type ResolvedConfigurationItem,
	TriggerRuleValueSchema,
} from "@hyperidle/shared";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { RoutineReader, SettingsUserDirectory } from "./ports.js";

// ---------------------------------------------------------------------------
// Public shared shapes
// ---------------------------------------------------------------------------

export interface PluginConfigurationSource {
	readonly id: string;
	readonly name: string;
	readonly version: string;
}

export interface PluginConfigurationSeed {
	readonly kind: ConfigurationKind;
	readonly key: string;
	readonly value: unknown;
}

/**
 * @lore AU19 Increment 1f: injected `users`/`routines`/`serviceConnections`
 * ports (Mechanism C) — `backfillLegacyConfigurationDefaults` used to import
 * `listUsersByKind` directly from `@hyperidle/users`, `routineService.listRoutines`
 * from the sibling (not-yet-migrated) `routine-service.ts`, and raw-query the
 * foreign `serviceConnections` table directly — all ordinary downward
 * core-api→core-api edges, NOT §10.3 against-grain (see `ports.ts`'s
 * top-level `@lore` for the `serviceConnections` completeness finding). The
 * caller (`server-factory.ts`) passes the real function references unchanged — no
 * behavior change.
 *
 * @lore AU19 Increment 1i: `routine` migrated — `RoutineReader` closes (see
 * `ports.ts`'s top-level `@lore`); `server-factory.ts` now passes
 * `@hyperidle/routine`'s real `listRoutines` export instead of the
 * (now-deleted) sibling `routine-service.ts` reference. No signature change
 * here — `BackfillLegacyConfigurationDeps.routines` still types against the
 * `RoutineReader` port.
 */
export interface BackfillLegacyConfigurationDeps {
	readonly users: Pick<SettingsUserDirectory, "listUsersByKind">;
	readonly routines: Pick<RoutineReader, "listRoutines">;
	readonly serviceConnections: {
		listByAuthSource(db: HyperIdleDb, authSource: string): Promise<ServiceConnectionRow[]>;
	};
	/**
	 * AU26 G1 (architecture §D-L) — the run-config half of each agent's
	 * projected configuration, now that those six fields live in
	 * `agent_run_config` instead of on the `users` row. Injected Mechanism-C
	 * style (`settings` is a Service and may not import
	 * `@hyperidle/agent-run-config` directly); the Layer wires it. Returns one
	 * entry per requested id, defaulting the never-configured to all-null /
	 * `maxConcurrentSessions` 1 — so the projected shape is byte-identical to
	 * what an all-null `users` row projected before.
	 */
	readonly agentRunConfig: {
		readAgentRunConfigs(
			db: HyperIdleDb,
			agentUserIds: readonly string[],
		): Promise<
			Map<
				string,
				{
					readonly systemPrompt: string | null;
					readonly harnessType: string | null;
					readonly modelTierPreference: string | null;
					readonly modelId: string | null;
					readonly modelProvider: string | null;
					readonly maxConcurrentSessions: number;
				}
			>
		>;
	};
}

// ---------------------------------------------------------------------------
// Module-internal input shapes (dropped from public barrel — AU20 Am6)
// ---------------------------------------------------------------------------

interface LoadPluginConfigurationDefaultsInput {
	readonly plugin: PluginConfigurationSource;
	readonly defaults: readonly PluginConfigurationSeed[];
	readonly now?: string;
}

interface SetConfigurationOverrideInput {
	readonly kind: ConfigurationKind;
	readonly key: string;
	readonly value: unknown;
	readonly createdByUserId?: string | null;
	readonly now?: string;
}

interface ClearConfigurationOverrideInput {
	readonly kind: ConfigurationKind;
	readonly key: string;
	readonly now?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUILTIN_PLUGIN_SOURCE: PluginConfigurationSource = {
	id: BUILTIN_PLUGIN_ID,
	name: "HyperIdle Built-in",
	version: "builtin",
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function nowIso(now?: string): string {
	return now ?? new Date().toISOString();
}

function isConfigurationKind(value: string): value is ConfigurationKind {
	return CONFIGURATION_KINDS.includes(value as ConfigurationKind);
}

function stableJson(value: unknown): string {
	return JSON.stringify(sortForJson(value));
}

function sortForJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortForJson);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, nested]) => [key, sortForJson(nested)]),
	);
}

function hash(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function defaultId(pluginId: string, kind: ConfigurationKind, key: string): string {
	return `pcd_${hash(`${pluginId}\0${kind}\0${key}`).slice(0, 24)}`;
}

function overrideId(kind: ConfigurationKind, key: string): string {
	return `co_${hash(`${kind}\0${key}`).slice(0, 24)}`;
}

function defaultVersionHash(value: unknown): string {
	return hash(stableJson(value));
}

function parseStoredJson(value: string): unknown {
	return JSON.parse(value) as unknown;
}

function configKey(kind: ConfigurationKind, key: string): string {
	return `${kind}\0${key}`;
}

const SECRET_FIELD_NAMES = new Set([
	"token",
	"secret",
	"credential",
	"password",
	"apikey",
	"env",
	"command",
]);

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
	z.union([
		z.string(),
		z.number().finite(),
		z.boolean(),
		z.null(),
		z.array(JsonValueSchema),
		z.record(z.string(), JsonValueSchema),
	]),
);

const ConfigurationObjectSchema = z.record(z.string(), JsonValueSchema);

const McpServerConfigurationSchema = ConfigurationObjectSchema.superRefine((value, context) => {
	const serverUrl = value.serverUrl;
	if (serverUrl === undefined || serverUrl === null) return;
	if (typeof serverUrl !== "string") {
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["serverUrl"],
			message: "mcp_server serverUrl must be an http/https URL when present",
		});
		return;
	}

	try {
		const parsed = new URL(serverUrl);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") return;
	} catch {
		// handled below
	}

	context.addIssue({
		code: z.ZodIssueCode.custom,
		path: ["serverUrl"],
		message: "mcp_server serverUrl must be an http/https URL when present",
	});
});

const ConfigurationValueSchemas = {
	agent: ConfigurationObjectSchema,
	skill: ConfigurationObjectSchema,
	routine: ConfigurationObjectSchema,
	trigger: TriggerRuleValueSchema,
	tool: ConfigurationObjectSchema,
	mcp_server: McpServerConfigurationSchema,
	harness_descriptor: ConfigurationObjectSchema,
} satisfies Record<ConfigurationKind, z.ZodType<unknown>>;

function validateConfigurationValue(kind: ConfigurationKind, key: string, value: unknown): void {
	const secretPath = findSecretBearingFieldPath(value);
	if (secretPath) {
		throw new Error(`Configuration ${kind}/${key} contains secret-bearing field: ${secretPath}`);
	}

	const result = ConfigurationValueSchemas[kind].safeParse(value);
	if (!result.success) {
		const details = z.prettifyError(result.error);
		throw new Error(`Invalid configuration value for ${kind}/${key}: ${details}`);
	}
}

function findSecretBearingFieldPath(value: unknown, path: readonly string[] = []): string | null {
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			const nestedPath = findSecretBearingFieldPath(value[index], [...path, String(index)]);
			if (nestedPath) return nestedPath;
		}
		return null;
	}
	if (!value || typeof value !== "object") return null;

	for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
		const nextPath = [...path, key];
		if (SECRET_FIELD_NAMES.has(key.toLowerCase())) return nextPath.join(".");
		const nestedPath = findSecretBearingFieldPath(nested, nextPath);
		if (nestedPath) return nestedPath;
	}
	return null;
}

async function upsertPlugin(
	db: HyperIdleDb,
	source: PluginConfigurationSource,
	state: PluginState,
	ts: string,
): Promise<void> {
	await db
		.insert(plugins)
		.values({
			id: source.id,
			name: source.name,
			version: source.version,
			state,
			installedAt: ts,
			updatedAt: ts,
			disabledAt: null,
			removedAt: null,
		})
		.onConflictDoUpdate({
			target: plugins.id,
			set: {
				name: source.name,
				version: source.version,
				state,
				updatedAt: ts,
				disabledAt: null,
				removedAt: null,
			},
		});
}

async function upsertDefault(
	db: HyperIdleDb,
	pluginId: string,
	seed: PluginConfigurationSeed,
	ts: string,
): Promise<void> {
	await db
		.insert(pluginConfigurationDefaults)
		.values({
			id: defaultId(pluginId, seed.kind, seed.key),
			pluginId,
			kind: seed.kind,
			key: seed.key,
			defaultValueJson: stableJson(seed.value),
			defaultVersionHash: defaultVersionHash(seed.value),
			createdAt: ts,
			updatedAt: ts,
		})
		.onConflictDoUpdate({
			target: [
				pluginConfigurationDefaults.pluginId,
				pluginConfigurationDefaults.kind,
				pluginConfigurationDefaults.key,
			],
			set: {
				defaultValueJson: stableJson(seed.value),
				defaultVersionHash: defaultVersionHash(seed.value),
				updatedAt: ts,
			},
		});
}

async function findDefault(
	db: HyperIdleDb,
	kind: ConfigurationKind,
	key: string,
): Promise<PluginConfigurationDefaultRow | null> {
	const rows = await db
		.select()
		.from(pluginConfigurationDefaults)
		.where(
			and(eq(pluginConfigurationDefaults.kind, kind), eq(pluginConfigurationDefaults.key, key)),
		)
		.limit(1);
	return rows[0] ?? null;
}

function resolveDefaultBackedRow(
	defaultRow: PluginConfigurationDefaultRow,
	plugin: PluginRow,
	override: ConfigurationOverrideRow | null,
): ResolvedConfigurationItem | null {
	if (!isConfigurationKind(defaultRow.kind)) return null;
	const defaultValue = parseStoredJson(defaultRow.defaultValueJson);
	const userValue = override ? parseStoredJson(override.userValueJson) : null;
	const hasOverride = userValue !== null;
	return {
		kind: defaultRow.kind,
		key: defaultRow.key,
		activeValue: hasOverride ? userValue : defaultValue,
		defaultValue,
		userValue,
		valueSource: hasOverride ? "user_override" : "default",
		origin: originFor(plugin, defaultRow.defaultVersionHash),
		active: hasOverride || plugin.state === "enabled",
	};
}

function resolveUserOwnedOverride(override: ConfigurationOverrideRow): ResolvedConfigurationItem {
	const value = parseStoredJson(override.userValueJson);
	return {
		kind: override.kind as ConfigurationKind,
		key: override.key,
		activeValue: value,
		defaultValue: null,
		userValue: value,
		valueSource: "user_owned",
		origin: {
			type: "user",
			pluginId: null,
			pluginName: null,
			pluginState: null,
			defaultVersionHash: null,
		},
		active: true,
	};
}

function originFor(plugin: PluginRow, versionHash: string): ConfigurationOrigin {
	return {
		type: plugin.id === BUILTIN_PLUGIN_ID ? "builtin" : "plugin",
		pluginId: plugin.id,
		pluginName: plugin.name,
		pluginState: plugin.state as PluginState,
		defaultVersionHash: versionHash,
	};
}

function parseNullableJson(value: string | null): unknown {
	if (value === null) return null;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return value;
	}
}

function dedupeSeeds(seeds: readonly PluginConfigurationSeed[]): PluginConfigurationSeed[] {
	const byKey = new Map<string, PluginConfigurationSeed>();
	for (const seed of seeds) {
		byKey.set(configKey(seed.kind, seed.key), seed);
	}
	return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Internal pre-collapse implementations (module-private)
// ---------------------------------------------------------------------------

async function loadPluginConfigurationDefaults(
	db: HyperIdleDb,
	input: LoadPluginConfigurationDefaultsInput,
): Promise<void> {
	const ts = nowIso(input.now);
	for (const seed of input.defaults) {
		validateConfigurationValue(seed.kind, seed.key, seed.value);
	}
	await upsertPlugin(db, input.plugin, "enabled", ts);

	for (const seed of input.defaults) {
		await upsertDefault(db, input.plugin.id, seed, ts);
	}
}

async function setConfigurationOverride(
	db: HyperIdleDb,
	input: SetConfigurationOverrideInput,
): Promise<ResolvedConfigurationItem> {
	const ts = nowIso(input.now);
	validateConfigurationValue(input.kind, input.key, input.value);
	const existingDefault = await findDefault(db, input.kind, input.key);
	await db
		.insert(configurationOverrides)
		.values({
			id: overrideId(input.kind, input.key),
			defaultId: existingDefault?.id ?? null,
			kind: input.kind,
			key: input.key,
			userValueJson: stableJson(input.value),
			state: "active",
			createdByUserId: input.createdByUserId ?? null,
			createdAt: ts,
			updatedAt: ts,
		})
		.onConflictDoUpdate({
			target: [configurationOverrides.kind, configurationOverrides.key],
			set: {
				defaultId: existingDefault?.id ?? null,
				userValueJson: stableJson(input.value),
				state: "active",
				createdByUserId: input.createdByUserId ?? null,
				updatedAt: ts,
			},
		});
	const resolved = await getResolvedConfiguration(db, input.kind, input.key);
	if (!resolved)
		throw new Error(`Configuration override was not resolvable: ${input.kind}/${input.key}`);
	return resolved;
}

async function clearConfigurationOverride(
	db: HyperIdleDb,
	input: ClearConfigurationOverrideInput,
): Promise<void> {
	await db
		.update(configurationOverrides)
		.set({
			state: "deleted",
			updatedAt: nowIso(input.now),
		})
		.where(
			and(eq(configurationOverrides.kind, input.kind), eq(configurationOverrides.key, input.key)),
		);
}

/**
 * Plugin enabled/disabled/removed state transition.
 * Kept as a distinct state machine — not expressible as a config override.
 *
 * @lore AU20 Am6: promoted from private setPluginConfigurationState; direct
 * export, wrapper removed.
 */
export async function setPluginState(
	db: HyperIdleDb,
	pluginId: string,
	state: PluginState,
	now?: string,
): Promise<void> {
	const ts = nowIso(now);
	await db
		.update(plugins)
		.set({
			state,
			updatedAt: ts,
			disabledAt: state === "disabled" ? ts : null,
			removedAt: state === "removed" ? ts : null,
		})
		.where(eq(plugins.id, pluginId));
}

async function listResolvedConfiguration(
	db: HyperIdleDb,
	kind?: ConfigurationKind,
): Promise<ResolvedConfigurationItem[]> {
	const defaultRows = await db
		.select({
			defaultRow: pluginConfigurationDefaults,
			plugin: plugins,
			override: configurationOverrides,
		})
		.from(pluginConfigurationDefaults)
		.innerJoin(plugins, eq(pluginConfigurationDefaults.pluginId, plugins.id))
		.leftJoin(
			configurationOverrides,
			and(
				eq(configurationOverrides.kind, pluginConfigurationDefaults.kind),
				eq(configurationOverrides.key, pluginConfigurationDefaults.key),
				eq(configurationOverrides.state, "active"),
			),
		)
		.orderBy(asc(pluginConfigurationDefaults.kind), asc(pluginConfigurationDefaults.key));

	const entries = new Map<string, ResolvedConfigurationItem>();
	for (const row of defaultRows) {
		const entry = resolveDefaultBackedRow(row.defaultRow, row.plugin, row.override);
		if (!entry) continue;
		if (kind && entry.kind !== kind) continue;
		entries.set(configKey(entry.kind, entry.key), entry);
	}

	const overrideRows = await db
		.select()
		.from(configurationOverrides)
		.where(eq(configurationOverrides.state, "active"))
		.orderBy(asc(configurationOverrides.kind), asc(configurationOverrides.key));
	for (const override of overrideRows) {
		if (!isConfigurationKind(override.kind)) continue;
		const key = configKey(override.kind, override.key);
		if (entries.has(key)) continue;
		if (kind && override.kind !== kind) continue;
		entries.set(key, resolveUserOwnedOverride(override));
	}

	return [...entries.values()].sort((left, right) => {
		const byKind = left.kind.localeCompare(right.kind);
		return byKind === 0 ? left.key.localeCompare(right.key) : byKind;
	});
}

/**
 * Get a single resolved configuration item by kind + key.
 * Exported for use by internal consumers (agent-behavior-config.ts,
 * unit tests via direct import) — not re-exported from the barrel.
 * @lore AU20 Am6: dropped from barrel in favour of listConfiguration filter;
 * kept here so agent-behavior-config.ts can import directly without routing
 * through the barrel.
 */
async function getResolvedConfiguration(
	db: HyperIdleDb,
	kind: ConfigurationKind,
	key: string,
): Promise<ResolvedConfigurationItem | null> {
	const entries = await listResolvedConfiguration(db, kind);
	return entries.find((entry) => entry.key === key) ?? null;
}

// ---------------------------------------------------------------------------
// Public API (AU20 Am6 collapsed surface — ~5 functions + constants/types)
// ---------------------------------------------------------------------------

/**
 * General filter-parameterised read. Replaces the `listResolvedConfiguration`
 * (kind filter) + `getResolvedConfiguration` (kind+key → single) pair.
 *
 * - `listConfiguration(db)` → all items
 * - `listConfiguration(db, { kind })` → all items for a kind
 * - `listConfiguration(db, { kind, key })` → the single matching item (0 or 1 elements)
 *
 * @lore AU20 Am6: collapses list/find pair; one filter-parameterized read.
 */
export async function listConfiguration(
	db: HyperIdleDb,
	filter?: { kind?: ConfigurationKind; key?: string },
): Promise<ResolvedConfigurationItem[]> {
	const entries = await listResolvedConfiguration(db, filter?.kind);
	if (filter?.key !== undefined) {
		return entries.filter((entry) => entry.key === filter.key);
	}
	return entries;
}

/**
 * Unified override write. `value: null` clears (soft-deletes) the override;
 * any non-null value sets it.
 *
 * Returns the resolved item after setting, or null after clearing.
 *
 * @lore AU20 Am6: collapses setConfigurationOverride + clearConfigurationOverride.
 * Set vs clear are the same write parameterised by value presence.
 */
export async function writeConfigurationOverride(
	db: HyperIdleDb,
	input: {
		kind: ConfigurationKind;
		key: string;
		value: unknown;
		createdByUserId?: string | null;
		now?: string;
	},
): Promise<ResolvedConfigurationItem | null> {
	if (input.value === null) {
		await clearConfigurationOverride(db, { kind: input.kind, key: input.key, now: input.now });
		return null;
	}
	return setConfigurationOverride(db, {
		kind: input.kind,
		key: input.key,
		value: input.value,
		createdByUserId: input.createdByUserId,
		now: input.now,
	});
}

/**
 * Seed plugin (or built-in) configuration defaults.
 * Omit `source` for built-in defaults; provide it only for plugin defaults.
 *
 * @lore AU20 Am6: collapses loadPluginConfigurationDefaults +
 * loadBuiltInConfigurationDefaults. An omitted source selects the internal built-in source.
 */
export async function seedConfigurationDefaults(
	db: HyperIdleDb,
	input: {
		source?: PluginConfigurationSource;
		defaults: readonly PluginConfigurationSeed[];
		now?: string;
	},
): Promise<void> {
	await loadPluginConfigurationDefaults(db, {
		plugin: input.source ?? BUILTIN_PLUGIN_SOURCE,
		defaults: input.defaults,
		now: input.now,
	});
}

/**
 * Boot-time projection: gather live agents/routines/connections/skills/tools
 * into the built-in seed set.
 *
 * @lore AU20 Am6: collapses backfillLegacyConfigurationDefaults +
 * projectProductionConfigurationDefaults (pure alias). `now` param inlined
 * directly (BackfillLegacyConfigurationOptions wrapper type dropped).
 */
export async function backfillConfigurationDefaults(
	db: HyperIdleDb,
	deps: BackfillLegacyConfigurationDeps,
	now?: string,
): Promise<void> {
	const seeds: PluginConfigurationSeed[] = [];

	const agentRows = await deps.users.listUsersByKind(db, "ai");
	// AU26 G1: one batched run-config read for the whole roster.
	const runConfigs = await deps.agentRunConfig.readAgentRunConfigs(
		db,
		agentRows.map((a) => a.id),
	);
	for (const agent of agentRows) {
		const runConfig = runConfigs.get(agent.id);
		seeds.push({
			kind: "agent",
			key: `agent.${agent.id}`,
			value: {
				id: agent.id,
				name: agent.name,
				role: agent.role,
				teamId: agent.teamId,
				status: agent.status,
				systemPrompt: runConfig?.systemPrompt ?? null,
				harnessType: runConfig?.harnessType ?? null,
				modelTierPreference: runConfig?.modelTierPreference ?? null,
				modelId: runConfig?.modelId ?? null,
				modelProvider: runConfig?.modelProvider ?? null,
				maxConcurrentSessions: runConfig?.maxConcurrentSessions ?? 1,
			},
		});
		const harnessType = runConfig?.harnessType ?? null;
		if (harnessType) {
			seeds.push({
				kind: "harness_descriptor",
				key: `harness_descriptor.${harnessType}`,
				value: {
					type: harnessType,
					name: harnessType === "builtin" ? "Built-in Harness" : harnessType,
					source: "legacy_agent_harness",
				},
			});
		}
	}

	const routineRows = await deps.routines.listRoutines(db, { includeDeleted: true });
	for (const routine of routineRows) {
		seeds.push({
			kind: "routine",
			key: `routine.${routine.id}`,
			value: {
				id: routine.id,
				name: routine.name,
				description: routine.description,
				ownerAgentId: routine.ownerAgentId,
				teamId: routine.teamId,
				triggerType: routine.triggerType,
				triggerConfig: parseNullableJson(routine.triggerConfig),
				skillId: routine.skillId,
				state: routine.state,
				active: routine.active,
			},
		});
		seeds.push({
			kind: "trigger",
			key: `trigger.${routine.id}`,
			value: {
				eventType: "routine.fire",
				sourceKind: "routine",
				scope: {
					sourceId: routine.id,
					teamId: routine.teamId,
				},
				agentId: routine.ownerAgentId,
			},
		});
	}

	const mcpRows = await deps.serviceConnections.listByAuthSource(db, "mcp");
	for (const connection of mcpRows) {
		seeds.push({
			kind: "mcp_server",
			key: `mcp_server.${connection.userId}.${connection.service}`,
			value: {
				id: connection.id,
				userId: connection.userId,
				service: connection.service,
				authSource: connection.authSource,
				serverUrl: connection.serverUrl,
				health: connection.health,
				lastValidatedAt: connection.lastValidatedAt,
			},
		});
	}

	for (const tool of BUILTIN_TOOL_CATALOG) {
		seeds.push({
			kind: "tool",
			key: `tool.${tool.name}`,
			value: {
				name: tool.name,
				description: tool.description,
				roles: tool.roles ?? null,
				reversibility: tool.reversibility ?? null,
			},
		});
	}

	seeds.push({
		kind: "harness_descriptor",
		key: "harness_descriptor.builtin",
		value: {
			type: "builtin",
			name: "Built-in Harness",
			source: "builtin_harness",
		},
	});

	await loadPluginConfigurationDefaults(db, {
		plugin: BUILTIN_PLUGIN_SOURCE,
		defaults: dedupeSeeds(seeds),
		now,
	});
}
