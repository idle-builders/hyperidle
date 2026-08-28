/**
 * Plugin management HTTP routes.
 *
 * Surface: install, list, enable, disable, remove, restore-contribution.
 * Scope is stored on install and returned on list; scope filtering (factory
 * vs team) bites during session materialisation in BA9b — see @lore in
 * plugin-installer.ts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ConfigurationKind } from "@hyperidle/domain-model";
import { CONFIGURATION_KINDS } from "@hyperidle/domain-model";
import {
	removeByPluginTopic,
	restorePluginSkillBody,
	setPluginSkillsStatus,
	type UpsertPluginSkillInput,
	upsertPluginSkill,
} from "@hyperidle/knowledge";
import {
	insertRoutine,
	setPluginRoutinesActive,
	softDeletePluginRoutines,
} from "@hyperidle/routine";
import {
	agentItemId,
	disablePlugin,
	enablePlugin,
	getInstalledPlugin,
	type InstalledPlugin,
	installPlugin,
	listConfiguration,
	listInstalledPlugins,
	type PluginScope,
	type PluginSource,
	pluginContributionKey,
	removePlugin,
	restorePluginContribution,
	routineItemId,
	skillItemId,
} from "@hyperidle/settings";
import { insertUserIfAbsent, setPluginAgentsStatus } from "@hyperidle/users";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Response shapes (local — no domain-model entry needed for this surface)
// ---------------------------------------------------------------------------

export interface PluginContributionView {
	readonly kind: ConfigurationKind;
	readonly key: string; // namespaced: "pluginId/manifestKey"
	readonly manifestKey: string;
	readonly detached: boolean; // true when valueSource === "user_override"
}

export interface PluginView {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly state: string;
	readonly scope: PluginScope;
	readonly installedAt: string;
	readonly updatedAt: string;
	readonly disabledAt: string | null;
	readonly contributions: PluginContributionView[];
}

export interface PluginListResponse {
	readonly plugins: PluginView[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPluginRoutes(db: HyperIdleDb): Hono {
	const router = new Hono();

	// ── GET /api/plugins ────────────────────────────────────────────────────
	// Lists installed (non-removed) plugins with per-plugin contribution views.
	// Each contribution includes a `detached` flag when the user has overridden
	// the plugin-contributed default (valueSource === "user_override").
	router.get("/", async (c) => {
		const installed = await listInstalledPlugins(db);
		if (installed.length === 0) {
			return c.json({ plugins: [] } satisfies PluginListResponse);
		}

		// Load all configuration items once; group by origin.pluginId.
		const allItems = await listConfiguration(db);
		const contributionsByPlugin = new Map<string, PluginContributionView[]>();
		for (const item of allItems) {
			const pid = item.origin.pluginId;
			if (!pid) continue;
			const existing = contributionsByPlugin.get(pid) ?? [];
			// Derive manifestKey from the namespaced key (format: "pluginId/manifestKey")
			const slashIdx = item.key.indexOf("/");
			const manifestKey = slashIdx >= 0 ? item.key.slice(slashIdx + 1) : item.key;
			existing.push({
				kind: item.kind,
				key: item.key,
				manifestKey,
				detached: item.valueSource === "user_override",
			});
			contributionsByPlugin.set(pid, existing);
		}

		const plugins: PluginView[] = installed.map((p: InstalledPlugin) => ({
			id: p.id,
			name: p.name,
			version: p.version,
			state: p.state,
			scope: p.scope,
			installedAt: p.installedAt,
			updatedAt: p.updatedAt,
			disabledAt: p.disabledAt,
			contributions: contributionsByPlugin.get(p.id) ?? [],
		}));

		return c.json({ plugins } satisfies PluginListResponse);
	});

	// ── POST /api/plugins ───────────────────────────────────────────────────
	// Install a plugin from a git URL, zip path, or local folder path.
	// Body: { source: PluginSource, scope: { kind: "factory"|"team", teamId?: string } }
	router.post("/", async (c) => {
		const body = await c.req.json().catch(() => null);
		if (!body || typeof body !== "object") {
			return c.json({ code: "INVALID_BODY", error: "Expected JSON body." }, 422);
		}
		const { source, scope } = body as { source?: unknown; scope?: unknown };

		// Validate source
		if (!source || typeof source !== "object" || !("type" in (source as object))) {
			return c.json(
				{ code: "INVALID_SOURCE", error: 'source.type must be "git", "zip", or "folder".' },
				422,
			);
		}
		const src = source as Record<string, unknown>;
		if (!["git", "zip", "folder"].includes(src.type as string)) {
			return c.json(
				{
					code: "INVALID_SOURCE",
					error: `Unknown source type: ${JSON.stringify(src.type)}`,
				},
				422,
			);
		}

		let pluginSource: PluginSource;
		if (src.type === "git") {
			if (typeof src.url !== "string" || !src.url) {
				return c.json(
					{ code: "INVALID_SOURCE", error: 'source.url is required for type "git".' },
					422,
				);
			}
			pluginSource = { kind: "git", url: src.url };
		} else if (src.type === "zip") {
			if (typeof src.path !== "string" || !src.path) {
				return c.json(
					{ code: "INVALID_SOURCE", error: 'source.path is required for type "zip".' },
					422,
				);
			}
			pluginSource = { kind: "zip", path: src.path };
		} else {
			// folder
			if (typeof src.path !== "string" || !src.path) {
				return c.json(
					{ code: "INVALID_SOURCE", error: 'source.path is required for type "folder".' },
					422,
				);
			}
			pluginSource = { kind: "folder", path: src.path };
		}

		// Validate scope
		if (!scope || typeof scope !== "object" || !("kind" in (scope as object))) {
			return c.json(
				{ code: "INVALID_SCOPE", error: 'scope.kind must be "factory" or "team".' },
				422,
			);
		}
		const sc = scope as Record<string, unknown>;
		if (!["factory", "team"].includes(sc.kind as string)) {
			return c.json(
				{ code: "INVALID_SCOPE", error: `Unknown scope kind: ${JSON.stringify(sc.kind)}` },
				422,
			);
		}
		if (sc.kind === "team" && (typeof sc.teamId !== "string" || !sc.teamId)) {
			return c.json(
				{ code: "INVALID_SCOPE", error: 'scope.teamId is required for scope kind "team".' },
				422,
			);
		}

		const pluginScope: PluginScope = {
			kind: sc.kind as "factory" | "team",
			teamId: sc.kind === "team" ? (sc.teamId as string) : null,
		};

		// pluginsBaseDir is optional — provided by tests (temp dir) and production
		// config so plugin files are persisted and skills can be restored from disk.
		const pluginsBaseDir =
			typeof (body as Record<string, unknown>).pluginsBaseDir === "string"
				? ((body as Record<string, unknown>).pluginsBaseDir as string)
				: undefined;

		const result = await installPlugin(db, {
			source: pluginSource,
			scope: pluginScope,
			pluginsBaseDir,
		});
		if (!result.ok) {
			return c.json({ code: "INSTALL_FAILED", error: result.reason }, 422);
		}

		// BA9b: sync plugin skills into knowledge items. The installer (settings
		// layer) cannot write knowledge (it doesn't own that table); the layer
		// package routes are the correct cross-service bridge.
		//
		// BA9d: materialize plugin-declared agents (users rows) and routines rows.
		// settings cannot write users or routines — those tables are owned by their
		// respective services. Both uses are idempotent (insertUserIfAbsent /
		// insertRoutine onConflictDoNothing), so reinstalling is safe.
		//
		// Wrapped in a transaction so all cross-service writes are atomic.
		const { plugin, skills, agents, routines, scopeKind, scopeId, installTs } = result;
		await db.transaction(async (tx) => {
			const keepIds: string[] = [];
			for (const skill of skills) {
				const id = skillItemId(plugin.id, skill.dirName);
				keepIds.push(id);
				const input: UpsertPluginSkillInput = {
					id,
					pluginId: plugin.id,
					dirName: skill.dirName,
					body: skill.body,
					scopeKind,
					scopeId,
					topic: `plugin:${plugin.id}`,
					ts: installTs,
				};
				await upsertPluginSkill(tx, input);
			}
			// Remove any stale skill items for this plugin (e.g., renamed skill dirs).
			await removeByPluginTopic(tx, `plugin:${plugin.id}`, keepIds);

			// Materialize declared agents as users rows.
			// @lore BA9d: agentItemId/routineItemId include scope so factory installs
			// produce one global row (teamId=null) while team installs produce one row
			// per team (teamId=scopeId). insertUserIfAbsent makes reinstall idempotent.
			for (const agentSpec of agents) {
				const dbId = agentItemId(plugin.id, agentSpec.id, scopeKind, scopeId);
				await insertUserIfAbsent(tx, {
					id: dbId,
					kind: "ai",
					name: agentSpec.name,
					role: agentSpec.role,
					status: "active",
					agentCategory: agentSpec.agentCategory,
					teamId: scopeKind === "team" ? scopeId : null,
					pluginId: plugin.id,
					createdAt: installTs,
				});
			}

			// Materialize declared routines. insertRoutine onConflictDoNothing makes
			// reinstall safe. Routines reference the materialized agent by DB id.
			for (const routineSpec of routines) {
				const routineDbId = routineItemId(plugin.id, routineSpec.id, scopeKind, scopeId);
				const agentDbId = agentItemId(plugin.id, routineSpec.agentId, scopeKind, scopeId);
				await insertRoutine(
					tx,
					{
						id: routineDbId,
						name: routineSpec.name,
						ownerAgentId: agentDbId,
						triggerType: routineSpec.triggerType,
						triggerConfig: routineSpec.triggerConfig ?? null,
						eventType: routineSpec.eventType ?? null,
						prompt: routineSpec.prompt ?? null,
						pluginId: plugin.id,
						createdAt: installTs,
					},
					{ onConflictDoNothing: true },
				);
			}
		});

		return c.json({ plugin }, 201);
	});

	// ── POST /api/plugins/:id/enable ────────────────────────────────────────
	router.post("/:id/enable", async (c) => {
		const id = c.req.param("id");
		const existing = await getInstalledPlugin(db, id);
		if (!existing) {
			return c.json({ code: "NOT_FOUND", error: `Plugin "${id}" not found.` }, 404);
		}
		try {
			await enablePlugin(db, id);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return c.json({ code: "FORBIDDEN", error: msg }, 400);
		}
		// @lore BA9d: reactivate materialised rows so routines fire again,
		// agent runs again, and skills reach sessions. disablePlugin() only flips
		// plugins.state — the domain-row cleanup lives here (governance boundary:
		// settings cannot write routines/users/knowledge). Service functions own
		// each table write; they accept WriteExecutor so this is one transaction.
		try {
			await db.transaction(async (tx) => {
				await setPluginRoutinesActive(tx, id, true);
				await setPluginAgentsStatus(tx, id, "active");
				await setPluginSkillsStatus(tx, id, "active");
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return c.json({ code: "ENABLE_CLEANUP_FAILED", error: msg }, 500);
		}
		return c.json({ ok: true });
	});

	// ── POST /api/plugins/:id/disable ───────────────────────────────────────
	router.post("/:id/disable", async (c) => {
		const id = c.req.param("id");
		const existing = await getInstalledPlugin(db, id);
		if (!existing) {
			return c.json({ code: "NOT_FOUND", error: `Plugin "${id}" not found.` }, 404);
		}
		try {
			await disablePlugin(db, id);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return c.json({ code: "FORBIDDEN", error: msg }, 400);
		}
		// @lore BA9d: deactivate materialised rows so routines stop firing,
		// agent stops running, and skills stop reaching sessions. disablePlugin()
		// only flips plugins.state — the domain-row cleanup lives here
		// (governance boundary: settings cannot write routines/users/knowledge).
		// Service functions own each table write; they accept WriteExecutor so
		// this is one transaction.
		try {
			await db.transaction(async (tx) => {
				await setPluginRoutinesActive(tx, id, false);
				await setPluginAgentsStatus(tx, id, "inactive");
				await setPluginSkillsStatus(tx, id, "archived");
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return c.json({ code: "DISABLE_CLEANUP_FAILED", error: msg }, 500);
		}
		return c.json({ ok: true });
	});

	// ── DELETE /api/plugins/:id ─────────────────────────────────────────────
	router.delete("/:id", async (c) => {
		const id = c.req.param("id");
		const existing = await getInstalledPlugin(db, id);
		if (!existing) {
			return c.json({ code: "NOT_FOUND", error: `Plugin "${id}" not found.` }, 404);
		}
		try {
			await removePlugin(db, id);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return c.json({ code: "FORBIDDEN", error: msg }, 400);
		}
		// @lore BA9d: clean up all materialised rows inside a transaction.
		// Routines soft-deleted (not hard-deleted) because routine_runs has RESTRICT FK.
		// Agents deactivated (not hard-deleted) because many tables have RESTRICT FK on users.id.
		// Skills archived because knowledge audit-log tables have RESTRICT FK on knowledge_items.id.
		// Service functions own each table write; they accept WriteExecutor so this is one transaction.
		try {
			await db.transaction(async (tx) => {
				await softDeletePluginRoutines(tx, id);
				await setPluginAgentsStatus(tx, id, "inactive");
				await removeByPluginTopic(tx, `plugin:${id}`, []);
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return c.json({ code: "REMOVE_CLEANUP_FAILED", error: msg }, 500);
		}
		return c.json({ ok: true });
	});

	// ── POST /api/plugins/:id/contributions/restore ─────────────────────────
	// Restores a single contribution to its plugin-contributed default by
	// clearing the user override. Body: { kind, manifestKey }
	router.post("/:id/contributions/restore", async (c) => {
		const pluginId = c.req.param("id");
		const existing = await getInstalledPlugin(db, pluginId);
		if (!existing) {
			return c.json({ code: "NOT_FOUND", error: `Plugin "${pluginId}" not found.` }, 404);
		}
		const body = await c.req.json().catch(() => null);
		if (!body || typeof body !== "object") {
			return c.json({ code: "INVALID_BODY", error: "Expected JSON body." }, 422);
		}
		const { kind, manifestKey } = body as { kind?: unknown; manifestKey?: unknown };

		if (typeof kind !== "string" || !CONFIGURATION_KINDS.includes(kind as ConfigurationKind)) {
			return c.json(
				{
					code: "INVALID_KIND",
					error: `kind must be one of: ${CONFIGURATION_KINDS.join(", ")}`,
				},
				422,
			);
		}
		if (typeof manifestKey !== "string" || !manifestKey) {
			return c.json({ code: "INVALID_KEY", error: "manifestKey must be a non-empty string." }, 422);
		}

		const namespacedKey = pluginContributionKey(pluginId, manifestKey);

		// Skills are stored as knowledge_items and are not in plugin_configuration_defaults,
		// so restoring them means re-reading the SKILL.md from the plugin's install_path.
		// @lore BA9d D12: the plugin IS the canonical version; restore = re-import from disk.
		if (kind === "skill") {
			if (!existing.installPath) {
				return c.json(
					{
						code: "NO_INSTALL_PATH",
						error:
							"Plugin was installed without a pluginsBaseDir — skill body cannot be restored from disk.",
					},
					422,
				);
			}
			const skillFilePath = join(existing.installPath, "skills", manifestKey, "SKILL.md");
			let body: string;
			try {
				body = readFileSync(skillFilePath, "utf-8");
			} catch {
				return c.json(
					{
						code: "SKILL_SOURCE_NOT_FOUND",
						error: `Skill source not found at ${skillFilePath}. The plugin install may be corrupted.`,
					},
					422,
				);
			}
			const skillId = skillItemId(pluginId, manifestKey);
			await restorePluginSkillBody(db, skillId, body, pluginId);
			return c.json({ ok: true, key: namespacedKey });
		}

		await restorePluginContribution(db, {
			pluginId,
			manifestKey,
			kind: kind as ConfigurationKind,
		});
		return c.json({ ok: true, key: namespacedKey });
	});

	return router;
}
