/**
 * Plugin management HTTP routes.
 *
 * Surface: install, list, enable, disable, remove, restore-contribution.
 * Scope is stored on install and returned on list; scope filtering (factory
 * vs team) bites during session materialisation in BA9b — see @lore in
 * plugin-installer.ts.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { ConfigurationKind } from "@hyperidle/domain-model";
import { CONFIGURATION_KINDS } from "@hyperidle/domain-model";
import {
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
} from "@hyperidle/settings";
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

		const result = await installPlugin(db, { source: pluginSource, scope: pluginScope });
		if (!result.ok) {
			return c.json({ code: "INSTALL_FAILED", error: result.reason }, 422);
		}
		return c.json({ plugin: result.plugin }, 201);
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
		await restorePluginContribution(db, {
			pluginId,
			manifestKey,
			kind: kind as ConfigurationKind,
		});
		return c.json({ ok: true, key: namespacedKey });
	});

	return router;
}
