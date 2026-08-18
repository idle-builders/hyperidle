import { createHash } from "node:crypto";
import {
	type ConfigurationOverrideRow,
	configurationOverrides,
	type HyperIdleDb,
	type PluginConfigurationDefaultRow,
	type PluginRow,
	pluginConfigurationDefaults,
	plugins,
} from "@hyperidle/db";
import {
	BUILTIN_PLUGIN_ID,
	CONFIGURATION_KINDS,
	type ConfigurationKind,
	type ConfigurationOrigin,
	type PluginState,
	type ResolvedConfigurationItem,
	TriggerRuleValueSchema,
} from "@hyperidle/domain-model";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Module-internal input shapes
// ---------------------------------------------------------------------------

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
// Helpers
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

function overrideId(kind: ConfigurationKind, key: string): string {
	return `co_${hash(`${kind}\0${key}`).slice(0, 24)}`;
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
 * Used internally by setConfigurationOverride after writing.
 */
async function getResolvedConfiguration(
	db: HyperIdleDb,
	kind: ConfigurationKind,
	key: string,
): Promise<ResolvedConfigurationItem | null> {
	const entries = await listResolvedConfiguration(db, kind);
	return entries.find((entry) => entry.key === key) ?? null;
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

// ---------------------------------------------------------------------------
// Public API
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
