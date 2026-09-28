/**
 * Plugin install / manage operations over the `plugins` table, owned by the
 * settings service. What a plugin contributes (agents, subscriptions,
 * documents) is recorded in `plugin_contributions` by `platform-actions.ts`;
 * its MCP servers are never stored — they are read from the install's own
 * folder whenever a session asks (`getPluginMcpContributions`).
 */

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { type HyperIdleDb, type PluginRow, plugins } from "@hyperidle/db";
import type { PluginScopeKind, PluginState } from "@hyperidle/domain-model";
import { and, asc, eq, isNotNull, ne, or } from "drizzle-orm";
import type { FetchedPlugin, PluginSource } from "./plugin-fetch.js";
import { fetchPlugin } from "./plugin-fetch.js";
import type {
	ManifestWarning,
	ParsedPluginAgent,
	ParsedPluginSubscription,
	ParsedSkill,
} from "./plugin-manifest.js";
import { parseMcpJson, parsePluginManifest } from "./plugin-manifest.js";

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
	 * and the path is stored: sessions read the plugin's MCP servers from it and
	 * expand ${PLUGIN_ROOT} against it, and restore reads source files from it.
	 * When absent, the install has no folder, so it brings no MCP servers.
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
			/** Parsed skills — layer handler syncs through document service after install (settings cannot write documents). */
			skills: readonly ParsedSkill[];
			/** Agents — layer handler materializes as users rows (settings cannot write users). */
			agents: readonly ParsedPluginAgent[];
			/** Subscriptions — layer handler materializes as subscriptions rows (settings cannot write subscriptions). */
			subscriptions: readonly ParsedPluginSubscription[];
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

function sha256(data: string): string {
	return createHash("sha256").update(data).digest("hex");
}

/**
 * The `plugins` row id of one install: the manifest name for a factory
 * install, `<name>@<teamId>` for a team install. A manifest name never
 * contains `@`, so the two forms cannot collide.
 */
function pluginInstallId(name: string, scope: PluginScope): string {
	return scope.kind === "team" && scope.teamId ? `${name}@${scope.teamId}` : name;
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

export function skillItemId(
	pluginId: string,
	dirName: string,
	scopeKind: string,
	scopeId: string | null,
): string {
	const suffix = scopeKind === "team" ? `\0${scopeKind}\0${scopeId ?? ""}` : "";
	// @lore: `ki_` prefix baked into every minted id; changing it would break reinstall id match and create duplicates
	return `ki_${sha256(`plugin-skill\0${pluginId}\0${dirName}${suffix}`).slice(0, 24)}`;
}

// Stable DB id for a plugin-declared agent. Deterministic from pluginId + localId + scope.
export function agentItemId(
	pluginId: string,
	localId: string,
	scopeKind: string,
	scopeId: string | null,
): string {
	return `pa_${sha256(`plugin-agent\0${pluginId}\0${localId}\0${scopeKind}\0${scopeId ?? ""}`).slice(0, 24)}`;
}

// Stable DB id for a plugin-declared subscription. Same scope guarantee as agentItemId.
// @lore: hash input literal stays "plugin-routine\0..." unchanged — an existing install's id must not churn on reinstall
export function subscriptionItemId(
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

/** One MCP server a plugin brings: key `<plugin name>/<server name>`, the
 * server object as JSON, and the install folder `${PLUGIN_ROOT}` expands to. */
export interface PluginMcpContributionRow {
	key: string;
	defaultValueJson: string;
	installPath: string;
}

/**
 * The MCP servers of every enabled plugin in scope for the given team (factory
 * installs always, a team install only for its own team), read from each
 * install's `mcp.json` at the moment a session is provisioned.
 */
//
export async function getPluginMcpContributions(
	db: HyperIdleDb,
	teamId: string | null,
): Promise<readonly PluginMcpContributionRow[]> {
	const scopeFilter = teamId
		? or(
				eq(plugins.scopeKind, "factory"),
				and(eq(plugins.scopeKind, "team"), eq(plugins.scopeTeamId, teamId)),
			)
		: eq(plugins.scopeKind, "factory");

	const installs = await db
		.select({ name: plugins.name, installPath: plugins.installPath })
		.from(plugins)
		.where(and(eq(plugins.state, "enabled"), isNotNull(plugins.installPath), scopeFilter))
		.orderBy(asc(plugins.installedAt));

	const rows: PluginMcpContributionRow[] = [];
	for (const { name, installPath } of installs) {
		if (!installPath) continue;
		for (const server of parseMcpJson(installPath)) {
			rows.push({
				key: `${name}/${server.name}`,
				defaultValueJson: JSON.stringify(server.config),
				installPath,
			});
		}
	}
	return rows;
}

/**
 * Copy plugin files to this install's own folder, `<pluginsBaseDir>/<installId>`.
 * Returns the destination path.
 */
// @lore: rmSync removes only this install's folder — another team's restore is safe; source==dest is left alone to avoid deleting the only copy
function persistPlugin(sourceDir: string, pluginsBaseDir: string, installId: string): string {
	const dest = join(pluginsBaseDir, installId);
	if (resolve(sourceDir) === resolve(dest)) return dest;
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
 * Idempotent: reinstalling the same plugin updates its row and folder in place.
 */
export async function installPlugin(
	db: HyperIdleDb,
	input: InstallPluginInput,
): Promise<InstallPluginResult> {
	// A source that cannot be fetched (no such folder, a failed clone, a zip
	// without plugin.json) is an answer, never a thrown error.
	let fetched: FetchedPlugin;
	try {
		fetched = fetchPlugin(input.source);
	} catch (err) {
		return { ok: false, reason: err instanceof Error ? err.message : String(err) };
	}
	try {
		const parseResult = parsePluginManifest(fetched.rootDir);
		if (!parseResult.ok) {
			return { ok: false, reason: parseResult.reason };
		}

		const { manifest } = parseResult;
		const ts = nowIso(input.now);

		// Check scope consistency
		if (input.scope.kind === "team" && !input.scope.teamId) {
			return { ok: false, reason: 'scope.kind is "team" but scope.teamId is missing' };
		}
		// One row per install: each team's install of this plugin is its own.
		const pluginId = pluginInstallId(manifest.name, input.scope);

		// Persist plugin files whenever we have somewhere to put them.
		//
		let installPath: string | null = null;
		if (input.pluginsBaseDir) {
			try {
				installPath = persistPlugin(fetched.rootDir, input.pluginsBaseDir, pluginId);
			} catch {
				// Non-fatal: the install stands without a folder — skills are stored as
				// document bodies — it just brings no MCP servers and cannot restore.
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

		// Skill documents are synced by the core-api layer's route handler
		// after installPlugin returns, using the document service (governance boundary:
		// settings cannot write to documents — owned by document).

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
			subscriptions: manifest.subscriptions,
			scopeKind: input.scope.kind,
			scopeId: input.scope.teamId ?? null,
			installTs: ts,
		};
	} finally {
		fetched.cleanup();
	}
}

/** List installed plugins — every row but a removed one. */
export async function listInstalledPlugins(db: HyperIdleDb): Promise<InstalledPlugin[]> {
	const rows = await db
		.select()
		.from(plugins)
		.where(ne(plugins.state, "removed"))
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
	const rows = await db
		.select()
		.from(plugins)
		.where(and(eq(plugins.id, pluginId), ne(plugins.state, "removed")))
		.limit(1);
	const row = rows[0];
	return row ? pluginFromRow(row) : null;
}

/**
 * Disable a plugin — its MCP servers stop reaching sessions at once.
 */
export async function disablePlugin(
	db: HyperIdleDb,
	pluginId: string,
	now?: string,
): Promise<void> {
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
	const ts = nowIso(now);
	await db
		.update(plugins)
		.set({ state: "enabled", disabledAt: null, updatedAt: ts })
		.where(eq(plugins.id, pluginId));
}

/** Remove a plugin: its row stays as a `removed` tombstone. */
export async function removePlugin(db: HyperIdleDb, pluginId: string, now?: string): Promise<void> {
	const ts = nowIso(now);
	await db
		.update(plugins)
		.set({ state: "removed", removedAt: ts, updatedAt: ts })
		.where(eq(plugins.id, pluginId));
}
