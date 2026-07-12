import { createHash } from "node:crypto";
import {
	type ConfigurationOverrideRow,
	configurationOverrides,
	type HyperIdleDb,
	type PluginConfigurationDefaultRow,
	type PluginRow,
	pluginConfigurationDefaults,
	plugins,
	serviceConnections,
	userSkills,
	users,
} from "@hyperidle/db";
import {
	BUILTIN_PLUGIN_ID,
	CONFIGURATION_KINDS,
	type ConfigurationKind,
	type ConfigurationOrigin,
	type PluginState,
	type ResolvedConfigurationItem,
	TriggerRuleValueSchema,
} from "@hyperidle/shared";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { BUILTIN_TOOL_CATALOG } from "../config/builtin-tool-catalog.js";
import * as routineService from "../routine-service.js";

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

export interface LoadPluginConfigurationDefaultsInput {
	readonly plugin: PluginConfigurationSource;
	readonly defaults: readonly PluginConfigurationSeed[];
	readonly now?: string;
}

export interface LoadBuiltInConfigurationDefaultsInput {
	readonly defaults: readonly PluginConfigurationSeed[];
	readonly now?: string;
}

export interface SetConfigurationOverrideInput {
	readonly kind: ConfigurationKind;
	readonly key: string;
	readonly value: unknown;
	readonly createdByUserId?: string | null;
	readonly now?: string;
}

export interface ClearConfigurationOverrideInput {
	readonly kind: ConfigurationKind;
	readonly key: string;
	readonly now?: string;
}

export interface PluginStateOptions {
	readonly now?: string;
}

export interface BackfillLegacyConfigurationOptions {
	readonly now?: string;
}

export const BUILTIN_PLUGIN_SOURCE: PluginConfigurationSource = {
	id: BUILTIN_PLUGIN_ID,
	name: "HyperIdle Built-in",
	version: "builtin",
};

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

export async function loadPluginConfigurationDefaults(
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

export async function loadBuiltInConfigurationDefaults(
	db: HyperIdleDb,
	input: LoadBuiltInConfigurationDefaultsInput,
): Promise<void> {
	await loadPluginConfigurationDefaults(db, {
		plugin: BUILTIN_PLUGIN_SOURCE,
		defaults: input.defaults,
		now: input.now,
	});
}

export async function setConfigurationOverride(
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

export async function clearConfigurationOverride(
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

export async function setPluginConfigurationState(
	db: HyperIdleDb,
	pluginId: string,
	state: PluginState,
	options: PluginStateOptions = {},
): Promise<void> {
	const ts = nowIso(options.now);
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

export async function listResolvedConfiguration(
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

export async function getResolvedConfiguration(
	db: HyperIdleDb,
	kind: ConfigurationKind,
	key: string,
): Promise<ResolvedConfigurationItem | null> {
	const entries = await listResolvedConfiguration(db, kind);
	return entries.find((entry) => entry.key === key) ?? null;
}

export async function backfillLegacyConfigurationDefaults(
	db: HyperIdleDb,
	options: BackfillLegacyConfigurationOptions = {},
): Promise<void> {
	const seeds: PluginConfigurationSeed[] = [];

	const agentRows = await db.select().from(users).where(eq(users.kind, "ai"));
	for (const agent of agentRows) {
		seeds.push({
			kind: "agent",
			key: `agent.${agent.id}`,
			value: {
				id: agent.id,
				name: agent.name,
				role: agent.role,
				teamId: agent.teamId,
				status: agent.status,
				systemPrompt: agent.systemPrompt,
				harnessType: agent.harnessType,
				modelTierPreference: agent.modelTierPreference,
				modelId: agent.modelId,
				modelProvider: agent.modelProvider,
				maxConcurrentSessions: agent.maxConcurrentSessions,
			},
		});
		if (agent.harnessType) {
			seeds.push({
				kind: "harness_descriptor",
				key: `harness_descriptor.${agent.harnessType}`,
				value: {
					type: agent.harnessType,
					name: agent.harnessType === "builtin" ? "Built-in Harness" : agent.harnessType,
					source: "legacy_agent_harness",
				},
			});
		}
	}

	const routineRows = await routineService.listRoutines(db, { includeDeleted: true });
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

	const skillRows = await db.select().from(userSkills);
	for (const skill of skillRows) {
		seeds.push({
			kind: "skill",
			key: `skill.${skill.userId}.${skill.skillId}`,
			value: {
				userId: skill.userId,
				skillId: skill.skillId,
				autonomyLevel: skill.autonomyLevel,
				successCount: skill.successCount,
				failureCount: skill.failureCount,
				lastUsedAt: skill.lastUsedAt,
				promotedAt: skill.promotedAt,
			},
		});
	}

	const mcpRows = await db
		.select()
		.from(serviceConnections)
		.where(eq(serviceConnections.authSource, "mcp"));
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

	await loadBuiltInConfigurationDefaults(db, {
		defaults: dedupeSeeds(seeds),
		now: options.now,
	});
}

export async function projectProductionConfigurationDefaults(
	db: HyperIdleDb,
	options: BackfillLegacyConfigurationOptions = {},
): Promise<void> {
	await backfillLegacyConfigurationDefaults(db, options);
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
