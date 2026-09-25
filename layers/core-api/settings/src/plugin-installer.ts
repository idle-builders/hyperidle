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
	 *
	 * @lore BA9b: This is the plugins directory beside the database that each
	 * application passes.
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
			 * skill documents through the document service after install.
			 * @lore BA9b: settings cannot write documents (owned by document).
			 * The layer's route handler picks these up and calls document.upsertPluginSkill.
			 */
			skills: readonly ParsedSkill[];
			/**
			 * Agents declared in extensions["io.hyperidle"].agents[].
			 * The core-api route handler materializes them as users rows via insertUserIfAbsent.
			 * @lore BA9d: settings cannot write users (owned by users service).
			 */
			agents: readonly ParsedPluginAgent[];
			/**
			 * Subscriptions declared in extensions["io.hyperidle"].subscriptions[].
			 * The core-api route handler materializes them as subscriptions rows.
			 * @lore BA9d: settings cannot write subscriptions (owned by the user module).
			 */
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

/**
 * Deterministic document ID for a plugin skill.
 * Scoped to pluginId + skill title so reinstalls update the same row.
 * Exported so the core-api layer's route handlers can compute the same IDs
 * when syncing skills through the document service (governance boundary).
 *
 * @lore document-module B10 follow-up: `scopeKind`/`scopeId` join the hash the
 * same way `agentItemId`/`subscriptionItemId` already fold them in — a factory
 * install's suffix is empty, so its id is byte-identical to before this
 * change (there is no pre-existing factory-scoped id to migrate); a
 * team-scoped install's id now carries the team, so two teams installing the
 * same plugin never share one skill document. Before this, both teams
 * resolved the SAME id — the visibility rule (architecture.md §5.1) then
 * correctly refused the second team's install with `not_found`, because it
 * cannot see a row scoped to a team it is not, which is how the collision
 * surfaced rather than a silent overwrite.
 */
export function skillItemId(
	pluginId: string,
	dirName: string,
	scopeKind: string,
	scopeId: string | null,
): string {
	const suffix = scopeKind === "team" ? `\0${scopeKind}\0${scopeId ?? ""}` : "";
	// @lore document-module: the `ki_` prefix stays despite the table rename
	// (`knowledge_items` -> `documents`) — it is baked into every id this
	// function has ever minted, including every existing factory-scoped
	// install's row. Changing it would change the id a reinstall computes,
	// so a reinstall would stop finding its own row and create a duplicate
	// instead of updating in place. The factory id must stay byte-identical
	// forever; only NEW callers ever see the prefix, and none of them read
	// meaning into it.
	return `ki_${sha256(`plugin-skill\0${pluginId}\0${dirName}${suffix}`).slice(0, 24)}`;
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
 * plugins like document-management: the subscription clock sees one
 * subscription row and fires it once. A team-scoped plugin gets one
 * subscription per team, which is the correct per-team behaviour. The same
 * id derivation must be used wherever
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
 * Stable DB id for a plugin-declared subscription.
 * Deterministic from pluginId + localId + install scope.
 * See @lore on agentItemId — same scope guarantee applies.
 *
 * @lore BC5 T7b: renamed from `routineItemId` — the hash input literal
 * ("plugin-routine\0...") stays byte-for-byte unchanged on purpose, so an
 * already-installed plugin's subscription id does not churn on reinstall
 * (migration 0089 converts its routine row to a subscription under this
 * SAME id).
 */
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
 *
 * @lore The install folder is the only copy: nothing is written to the database
 * at install time, so an edit to the installed `mcp.json` reaches the next
 * session, and an install without a folder (no plugins directory configured)
 * brings no servers — there is no `${PLUGIN_ROOT}` to expand for it anyway.
 *
 * @lore The provisioner (run-orchestration, a different layer) cannot read
 * `plugins` — settings owns it. This is the settings-service door, wrapped by
 * the core-api layer in a boot capability the application hands to
 * orchestration as its plugin MCP port.
 */
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
 *
 * @lore One folder per install: the `rmSync` below only ever removes this
 * install's own copy, so a second team's install never deletes the folder a
 * first team's restore reads. And a source that already IS the destination
 * is left alone — removing it first would delete the only copy (a bundled
 * folder or a folder install pointed at the install directory itself).
 */
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
 *
 * @lore BA9d: This function only flips plugins.state. The real disable work —
 * deactivating materialised subscriptions, agents, and skills that the
 * plugin created — lives in `platform-actions.ts`. Settings cannot write to
 * subscriptions, users, or documents (governance boundary). Both must
 * succeed or the plugin is in a split state; `platform-actions.ts` runs this
 * call first and the row-cleanup second, inside a try/catch.
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
	// @lore BA9d: All domain-row cleanup (subscriptions, agents, skills)
	// happens in `platform-actions.ts` after this call — settings cannot
	// write to those tables (governance boundary). `platform-actions.ts`
	// wraps both calls; if this succeeds but the row cleanup fails, the
	// plugin is in state='removed' with its rows still live. It catches that
	// and returns REMOVE_CLEANUP_FAILED rather than silently leaving a split
	// state.
	await db
		.update(plugins)
		.set({ state: "removed", removedAt: ts, updatedAt: ts })
		.where(eq(plugins.id, pluginId));
}
