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
 *
 * @lore BA9a scope-deferral: Scope (factory | team) is stored on the plugin
 * row but the resolver (listConfiguration) does not yet filter by it — it has
 * no team context and returns all enabled plugin contributions globally. The
 * biting point is session materialisation in BA9b/c: when the run-orchestration
 * layer assembles an agent session it will query plugins WHERE scope_kind =
 * 'factory' OR (scope_kind = 'team' AND scope_team_id = currentTeamId). That
 * query lives in layers/agent-orchestration/ and is owned by BA9b. Scope is
 * stored now so BA9b has the data; the UI shows it today so operators can see
 * how each plugin is scoped.
 */

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
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
import { and, asc, eq, ne, notInArray, or } from "drizzle-orm";
import { writeConfigurationOverride } from "./plugin-configuration.js";
import type { PluginSource } from "./plugin-fetch.js";
import { fetchPlugin } from "./plugin-fetch.js";
import type {
	ManifestWarning,
	ParsedContribution,
	ParsedMcpServer,
	ParsedPluginAgent,
	ParsedPluginRoutine,
	ParsedSkill,
} from "./plugin-manifest.js";
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
	/**
	 * Base directory for persistent plugin storage.
	 * When provided, plugin files are copied to {pluginsBaseDir}/{pluginId}/
	 * and the path is stored for ${PLUGIN_ROOT} expansion in MCP servers.
	 * When absent, command-based MCP servers are stored unexpanded.
	 *
	 * @lore BA9b: This is the userDataDir-derived plugins directory from the
	 * desktop app. Without it, only URL-based MCP servers work fully.
	 */
	readonly pluginsBaseDir?: string;
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
	/** Absolute path to the plugin's persistent install directory, or null. */
	readonly installPath: string | null;
}

export type InstallPluginResult =
	| {
			ok: true;
			plugin: InstalledPlugin;
			/**
			 * Parsed skills from the manifest, needed by the core-api layer to sync
			 * skill knowledge items through the knowledge service after install.
			 * @lore BA9b: settings cannot write knowledgeItems (owned by knowledge).
			 * The layer's route handler picks these up and calls knowledge.upsertPluginSkill.
			 */
			skills: readonly ParsedSkill[];
			/**
			 * Agents declared in extensions["io.hyperidle"].agents[].
			 * The core-api route handler materializes them as users rows via insertUserIfAbsent.
			 * @lore BA9d: settings cannot write users (owned by users service).
			 */
			agents: readonly ParsedPluginAgent[];
			/**
			 * Routines declared in extensions["io.hyperidle"].routines[].
			 * The core-api route handler materializes them as routines rows via insertRoutine.
			 * @lore BA9d: settings cannot write routines (owned by routine service).
			 */
			routines: readonly ParsedPluginRoutine[];
			scopeKind: string;
			scopeId: string | null;
			installTs: string;
	  }
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
		installPath: row.installPath ?? null,
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
	// Removes defaults for this plugin whose keys are no longer in the manifest.
	// Called on every install (including first-time) to keep defaults in sync
	// with the current manifest contributions; currentKeys is the full set of
	// namespaced keys that should remain after this operation.
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

/**
 * Deterministic knowledge item ID for a plugin skill.
 * Scoped to pluginId + skill title so reinstalls update the same row.
 * Exported so the core-api layer's route handlers can compute the same IDs
 * when syncing skills through the knowledge service (governance boundary).
 */
export function skillItemId(pluginId: string, dirName: string): string {
	return `ki_${sha256(`plugin-skill\0${pluginId}\0${dirName}`).slice(0, 24)}`;
}

/**
 * Stable DB id for a plugin-declared agent.
 * Deterministic from pluginId + localId + install scope.
 *
 * @lore BA9d: scope is included in the hash so that a factory-scoped install
 * produces exactly ONE global agent row (scopeId is null → hash suffix is
 * constant), while a team-scoped install produces ONE row PER team (different
 * teamId → different hash → different row). This is the entire mechanism that
 * guarantees "global upkeep runs once, not once per team" for factory-scoped
 * plugins like knowledge-management: the scheduler sees one routine row and
 * fires it once. A team-scoped plugin gets one routine per team, which is the
 * correct per-team behaviour. The same id derivation must be used wherever
 * these rows are looked up — the test for two-team installs guards this.
 */
export function agentItemId(
	pluginId: string,
	localId: string,
	scopeKind: string,
	scopeId: string | null,
): string {
	return `pa_${sha256(`plugin-agent\0${pluginId}\0${localId}\0${scopeKind}\0${scopeId ?? ""}`).slice(0, 24)}`;
}

/**
 * Stable DB id for a plugin-declared routine.
 * Deterministic from pluginId + localId + install scope.
 * See @lore on agentItemId — same scope guarantee applies.
 */
export function routineItemId(
	pluginId: string,
	localId: string,
	scopeKind: string,
	scopeId: string | null,
): string {
	return `pr_${sha256(`plugin-routine\0${pluginId}\0${localId}\0${scopeKind}\0${scopeId ?? ""}`).slice(0, 24)}`;
}

// ---------------------------------------------------------------------------
// Cross-layer read: plugin MCP contributions for session provisioning
// ---------------------------------------------------------------------------

export interface PluginMcpContributionRow {
	key: string;
	defaultValueJson: string;
	installPath: string | null;
}

/**
 * Return MCP server contributions for all plugins in scope for the given team.
 *
 * @lore BA9b: The provisioner (run-orchestration, a different layer) cannot
 * query plugins/pluginConfigurationDefaults directly — those tables are owned
 * by settings. This function is the settings-service door: exposed from
 * @hyperidle/settings, imported by @hyperidle/core-api (the layer), which
 * wraps it in a CoreApiBoot capability the application hands to bootAgentOrchestration.
 */
export async function getPluginMcpContributions(
	db: HyperIdleDb,
	teamId: string | null,
): Promise<readonly PluginMcpContributionRow[]> {
	const scopeFilter = teamId
		? or(
				and(eq(plugins.scopeKind, "factory")),
				and(eq(plugins.scopeKind, "team"), eq(plugins.scopeTeamId, teamId)),
			)
		: eq(plugins.scopeKind, "factory");

	return db
		.select({
			defaultValueJson: pluginConfigurationDefaults.defaultValueJson,
			key: pluginConfigurationDefaults.key,
			installPath: plugins.installPath,
		})
		.from(pluginConfigurationDefaults)
		.innerJoin(plugins, eq(pluginConfigurationDefaults.pluginId, plugins.id))
		.where(
			and(
				eq(pluginConfigurationDefaults.kind, "mcp_server"),
				eq(plugins.state, "enabled"),
				scopeFilter,
			),
		);
}

/**
 * Write MCP server entries from mcp.json as plugin_configuration_defaults.
 * Each server is stored as kind='mcp_server' with key '<pluginId>/<serverName>'.
 *
 * Written directly (not through writePluginDefaults) so the namespaced key is
 * explicit at this call site rather than being derived inside writePluginDefaults.
 * Two plugins with the same server name get distinct keys: pluginA/bridge vs
 * pluginB/bridge — no collision on the mcp_server (kind, key) unique constraint.
 */
async function writeMcpServerDefaults(
	db: HyperIdleDb,
	pluginId: string,
	mcpServers: ParsedMcpServer[],
	ts: string,
): Promise<void> {
	if (mcpServers.length === 0) return;
	for (const server of mcpServers) {
		const key = namespacedKey(pluginId, server.name);
		const valueJson = stableJson(server.config);
		const versionHash = sha256(valueJson);
		const id = defaultId(pluginId, "mcp_server", key);
		await db
			.insert(pluginConfigurationDefaults)
			.values({
				id,
				pluginId,
				kind: "mcp_server",
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

/**
 * Copy plugin files to a persistent location.
 * Returns the destination path.
 */
function persistPlugin(sourceDir: string, pluginsBaseDir: string, pluginId: string): string {
	const dest = join(pluginsBaseDir, pluginId);
	// Remove any existing install first (full reinstall)
	if (existsSync(dest)) {
		rmSync(dest, { recursive: true, force: true });
	}
	mkdirSync(dest, { recursive: true });
	cpSync(sourceDir, dest, { recursive: true });
	return dest;
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

		// Persist plugin files whenever we have somewhere to put them.
		//
		// @lore BA9g: this used to require `skills.length > 0 || mcpServers.length
		// > 0`, on the reasoning that only those two need files on disk. That became
		// wrong the moment an agent could carry an `identity` file: the shipped
		// `role-personas` plugin has seven agents, no skills and no MCP servers, so
		// it got NO install_path — and restore answered NO_INSTALL_PATH forever for
		// the one plugin the batch added. Restore reads the plugin's files for any
		// contributed document, so the condition is simply "can we persist".
		let installPath: string | null = null;
		if (input.pluginsBaseDir) {
			try {
				installPath = persistPlugin(fetched.rootDir, input.pluginsBaseDir, pluginId);
			} catch {
				// Non-fatal: URL-based MCP servers still work without persistent storage.
				// Skills are stored as knowledge item bodies (no disk path needed).
			}
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
				installPath,
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
					installPath,
					updatedAt: ts,
					disabledAt: null,
					removedAt: null,
				},
			});

		// Compute the set of current namespaced keys from manifest contributions.
		const manifestContribKeys = manifest.contributions.map((c) => namespacedKey(pluginId, c.key));
		// MCP server contributions are stored alongside manifest contributions.
		const mcpContribKeys = manifest.mcpServers.map((s) => namespacedKey(pluginId, s.name));
		const currentKeys = [...manifestContribKeys, ...mcpContribKeys];

		// Remove defaults for keys that no longer exist.
		await removeStaleDefaults(db, pluginId, currentKeys);

		// Write/update manifest contributions.
		await writePluginDefaults(db, pluginId, manifest.contributions, ts);

		// Write/update MCP server contributions from mcp.json.
		await writeMcpServerDefaults(db, pluginId, manifest.mcpServers, ts);

		// Skill knowledge items are synced by the core-api layer's route handler
		// after installPlugin returns, using the knowledge service (governance boundary:
		// settings cannot write to knowledgeItems — owned by knowledge).

		const rows = await db.select().from(plugins).where(eq(plugins.id, pluginId)).limit(1);
		const row = rows[0];
		if (!row) {
			return { ok: false, reason: `Plugin row not found after insert: ${pluginId}` };
		}

		return {
			ok: true,
			plugin: pluginFromRow(row, manifest.warnings),
			skills: manifest.skills,
			agents: manifest.agents,
			routines: manifest.routines,
			scopeKind: input.scope.kind,
			scopeId: input.scope.teamId ?? null,
			installTs: ts,
		};
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
 * Get a single installed plugin by ID, or null if it does not exist or is removed.
 * Used by HTTP routes to distinguish "not found" (404) from operation errors.
 */
export async function getInstalledPlugin(
	db: HyperIdleDb,
	pluginId: string,
): Promise<InstalledPlugin | null> {
	if (pluginId === BUILTIN_PLUGIN_ID) return null;
	const rows = await db
		.select()
		.from(plugins)
		.where(and(eq(plugins.id, pluginId), ne(plugins.state, "removed")))
		.limit(1);
	const row = rows[0];
	return row ? pluginFromRow(row) : null;
}

/**
 * Disable a plugin — its contributions stop applying (active=false for
 * non-overridden items). User-edited (detached) items remain active.
 *
 * AC7: the resolver's `active: hasOverride || plugin.state === 'enabled'`
 * handles this automatically.
 *
 * @lore BA9d: This function only flips plugins.state. The real disable work —
 * deactivating materialised routines, agents, and skills that the plugin
 * created — lives in the route handler (layers/core-api/src/routes/plugins.ts).
 * Settings cannot write to routines, users, or knowledge_items (governance
 * boundary). Both must succeed or the plugin is in a split state; the route
 * runs this call first and the row-cleanup second, inside a try/catch.
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
	// @lore BA9d: All domain-row cleanup (routines, agents, skills) happens
	// in the route handler after this call — settings cannot write to those
	// tables (governance boundary). The route wraps both calls; if this
	// succeeds but the row cleanup fails, the plugin is in state='removed'
	// with its rows still live. The route catches that and returns
	// REMOVE_CLEANUP_FAILED rather than silently leaving a split state.
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
