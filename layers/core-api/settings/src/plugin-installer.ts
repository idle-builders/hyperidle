/**
 * Plugin install / manage operations.
 *
 * The installer writes to the three plugin-related tables owned by the
 * settings service (plugins, plugin_configuration_defaults, configuration_overrides).
 *
 * @lore BA9a: Key namespacing — every contribution from plugin P with manifest
 * key K is stored as key "P/K" in the DB. This guarantees that the global unique
 * constraint on configuration_overrides(kind, key) is never violated by two
 * plugins declaring the same manifest key.
 *
 * @lore BA9a: Remove sequence — hard-delete defaults first (cascade sets
 * defaultId=null on any overrides), then set plugins.state='removed'. The
 * onDelete:restrict constraint on pluginConfigurationDefaults.pluginId is
 * satisfied because defaults are gone before we touch the plugin row.
 */

import { createHash } from "node:crypto";
import {
	type HyperIdleDb,
	type PluginRow,
	pluginConfigurationDefaults,
	plugins,
} from "@hyperidle/db";
import {
	BUILTIN_PLUGIN_ID,
	type ConfigurationKind,
	type PluginScopeKind,
	type PluginState,
} from "@hyperidle/domain-model";
import { and, asc, eq, ne, notInArray } from "drizzle-orm";
import { writeConfigurationOverride } from "./plugin-configuration.js";
import type { PluginSource } from "./plugin-fetch.js";
import { fetchPlugin } from "./plugin-fetch.js";
import type { ManifestWarning, ParsedContribution } from "./plugin-manifest.js";
import { parsePluginManifest } from "./plugin-manifest.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type { PluginSource };

export interface PluginScope {
	readonly kind: PluginScopeKind;
	readonly teamId: string | null;
}

export interface InstallPluginInput {
	readonly source: PluginSource;
	readonly scope: PluginScope;
	/** Override current timestamp — for deterministic tests only. */
	readonly now?: string;
}

export interface InstalledPlugin {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly state: PluginState;
	readonly scope: PluginScope;
	readonly installedAt: string;
	readonly updatedAt: string;
	readonly disabledAt: string | null;
	readonly warnings: ManifestWarning[];
}

export type InstallPluginResult =
	| { ok: true; plugin: InstalledPlugin }
	| { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(override?: string): string {
	return override ?? new Date().toISOString();
}

function stableJson(value: unknown): string {
	return JSON.stringify(sortForJson(value));
}

function sortForJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortForJson);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => [k, sortForJson(v)]),
	);
}

function sha256(data: string): string {
	return createHash("sha256").update(data).digest("hex");
}

function defaultId(pluginId: string, kind: ConfigurationKind, namespacedKey: string): string {
	return `pcd_${sha256(`${pluginId}\0${kind}\0${namespacedKey}`).slice(0, 24)}`;
}

/**
 * Namespace a manifest key by plugin ID.
 * Stored key = "<pluginId>/<manifestKey>".
 */
function namespacedKey(pluginId: string, manifestKey: string): string {
	return `${pluginId}/${manifestKey}`;
}

function scopeFromRow(row: PluginRow): PluginScope {
	return {
		kind: row.scopeKind as PluginScopeKind,
		teamId: row.scopeTeamId ?? null,
	};
}

function pluginFromRow(row: PluginRow, warnings: ManifestWarning[] = []): InstalledPlugin {
	return {
		id: row.id,
		name: row.name,
		version: row.version,
		state: row.state as PluginState,
		scope: scopeFromRow(row),
		installedAt: row.installedAt,
		updatedAt: row.updatedAt,
		disabledAt: row.disabledAt ?? null,
		warnings,
	};
}

// ---------------------------------------------------------------------------
// Core install logic
// ---------------------------------------------------------------------------

async function writePluginDefaults(
	db: HyperIdleDb,
	pluginId: string,
	contributions: ParsedContribution[],
	ts: string,
): Promise<void> {
	if (contributions.length === 0) return;

	for (const contribution of contributions) {
		const key = namespacedKey(pluginId, contribution.key);
		const valueJson = stableJson(contribution.value);
		const versionHash = sha256(valueJson);
		const id = defaultId(pluginId, contribution.kind, key);

		await db
			.insert(pluginConfigurationDefaults)
			.values({
				id,
				pluginId,
				kind: contribution.kind,
				key,
				defaultValueJson: valueJson,
				defaultVersionHash: versionHash,
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
					defaultValueJson: valueJson,
					defaultVersionHash: versionHash,
					updatedAt: ts,
				},
			});
	}
}

async function removeStaleDefaults(
	db: HyperIdleDb,
	pluginId: string,
	currentKeys: string[],
): Promise<void> {
	// Delete defaults for this plugin whose keys are no longer in the manifest.
	// Only called during reinstall; currentKeys is the set of namespaced keys
	// that should remain.
	if (currentKeys.length === 0) {
		// Remove all defaults
		await db
			.delete(pluginConfigurationDefaults)
			.where(eq(pluginConfigurationDefaults.pluginId, pluginId));
		return;
	}
	await db
		.delete(pluginConfigurationDefaults)
		.where(
			and(
				eq(pluginConfigurationDefaults.pluginId, pluginId),
				notInArray(pluginConfigurationDefaults.key, currentKeys),
			),
		);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Install a plugin from a source (folder, git URL, or zip).
 *
 * Idempotent: reinstalling the same plugin ID updates the defaults without
 * touching user overrides (detached items stay detached per D5 / AC10).
 *
 * AC9: plugin ID "builtin" is reserved and always rejected.
 */
export async function installPlugin(
	db: HyperIdleDb,
	input: InstallPluginInput,
): Promise<InstallPluginResult> {
	const fetched = fetchPlugin(input.source);
	try {
		const parseResult = parsePluginManifest(fetched.rootDir);
		if (!parseResult.ok) {
			return { ok: false, reason: parseResult.reason };
		}

		const { manifest } = parseResult;
		const pluginId = manifest.name;
		const ts = nowIso(input.now);

		// Check scope consistency
		if (input.scope.kind === "team" && !input.scope.teamId) {
			return { ok: false, reason: 'scope.kind is "team" but scope.teamId is missing' };
		}

		// Upsert the plugins row
		await db
			.insert(plugins)
			.values({
				id: pluginId,
				name: manifest.name,
				version: manifest.version,
				state: "enabled",
				scopeKind: input.scope.kind,
				scopeTeamId: input.scope.teamId ?? null,
				installedAt: ts,
				updatedAt: ts,
				disabledAt: null,
				removedAt: null,
			})
			.onConflictDoUpdate({
				target: [plugins.id],
				set: {
					name: manifest.name,
					version: manifest.version,
					state: "enabled",
					scopeKind: input.scope.kind,
					scopeTeamId: input.scope.teamId ?? null,
					updatedAt: ts,
					disabledAt: null,
					removedAt: null,
				},
			});

		// Compute the set of current namespaced keys
		const currentKeys = manifest.contributions.map((c) => namespacedKey(pluginId, c.key));

		// Remove defaults for keys that no longer exist in the manifest
		await removeStaleDefaults(db, pluginId, currentKeys);

		// Write/update defaults for current contributions
		await writePluginDefaults(db, pluginId, manifest.contributions, ts);

		const rows = await db.select().from(plugins).where(eq(plugins.id, pluginId)).limit(1);
		const row = rows[0];
		if (!row) {
			return { ok: false, reason: `Plugin row not found after insert: ${pluginId}` };
		}

		return { ok: true, plugin: pluginFromRow(row, manifest.warnings) };
	} finally {
		fetched.cleanup();
	}
}

/**
 * List installed plugins — excludes 'builtin' and state='removed'.
 *
 * AC9: builtin is never listed.
 */
export async function listInstalledPlugins(db: HyperIdleDb): Promise<InstalledPlugin[]> {
	const rows = await db
		.select()
		.from(plugins)
		.where(and(ne(plugins.id, BUILTIN_PLUGIN_ID), ne(plugins.state, "removed")))
		.orderBy(asc(plugins.installedAt));
	return rows.map((row) => pluginFromRow(row));
}

/**
 * Disable a plugin — its contributions stop applying (active=false for
 * non-overridden items). User-edited (detached) items remain active.
 *
 * AC7: the resolver's `active: hasOverride || plugin.state === 'enabled'`
 * handles this automatically.
 */
export async function disablePlugin(
	db: HyperIdleDb,
	pluginId: string,
	now?: string,
): Promise<void> {
	if (pluginId === BUILTIN_PLUGIN_ID) {
		throw new Error(`Cannot disable the reserved plugin "${BUILTIN_PLUGIN_ID}"`);
	}
	const ts = nowIso(now);
	await db
		.update(plugins)
		.set({ state: "disabled", disabledAt: ts, updatedAt: ts })
		.where(eq(plugins.id, pluginId));
}

/**
 * Enable a previously disabled plugin.
 */
export async function enablePlugin(db: HyperIdleDb, pluginId: string, now?: string): Promise<void> {
	if (pluginId === BUILTIN_PLUGIN_ID) {
		throw new Error(`Cannot enable/disable the reserved plugin "${BUILTIN_PLUGIN_ID}"`);
	}
	const ts = nowIso(now);
	await db
		.update(plugins)
		.set({ state: "enabled", disabledAt: null, updatedAt: ts })
		.where(eq(plugins.id, pluginId));
}

/**
 * Remove a plugin.
 *
 * AC7 + design notes: hard-delete defaults first (sets defaultId=null on overrides
 * via FK cascade), then mark plugin as removed. The onDelete:restrict constraint is
 * satisfied because defaults are deleted before the plugin state changes.
 */
export async function removePlugin(db: HyperIdleDb, pluginId: string, now?: string): Promise<void> {
	if (pluginId === BUILTIN_PLUGIN_ID) {
		throw new Error(`Cannot remove the reserved plugin "${BUILTIN_PLUGIN_ID}"`);
	}
	const ts = nowIso(now);
	// Step 1: delete all defaults (cascade sets defaultId=null on overrides)
	await db
		.delete(pluginConfigurationDefaults)
		.where(eq(pluginConfigurationDefaults.pluginId, pluginId));
	// Step 2: mark plugin as removed (restrict constraint now satisfied)
	await db
		.update(plugins)
		.set({ state: "removed", removedAt: ts, updatedAt: ts })
		.where(eq(plugins.id, pluginId));
}

/**
 * Restore a plugin contribution to its plugin default value by clearing
 * the user's override.
 *
 * AC6: After restore, the item is no longer detached (valueSource='default').
 *
 * @param pluginId - The plugin whose contribution to restore.
 * @param manifestKey - The ORIGINAL (non-namespaced) key from the manifest.
 * @param kind - The configuration kind.
 */
export async function restorePluginContribution(
	db: HyperIdleDb,
	input: {
		readonly pluginId: string;
		readonly manifestKey: string;
		readonly kind: ConfigurationKind;
		readonly now?: string;
	},
): Promise<void> {
	const key = namespacedKey(input.pluginId, input.manifestKey);
	await writeConfigurationOverride(db, {
		kind: input.kind,
		key,
		value: null,
		now: input.now,
	});
}

/**
 * Returns the stored (namespaced) key for a plugin contribution.
 * Exported for tests and BA9b to build on.
 */
export function pluginContributionKey(pluginId: string, manifestKey: string): string {
	return namespacedKey(pluginId, manifestKey);
}
