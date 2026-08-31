/**
 * Plugin management HTTP routes.
 *
 * Surface: install, list, enable, disable, remove, restore-contribution.
 * Scope is stored on install and returned on list; scope filtering (factory
 * vs team) bites during session materialisation in BA9b — see @lore in
 * plugin-installer.ts.
 */

import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import type { ConfigurationKind, PluginContributionKind } from "@hyperidle/domain-model";
import { CONFIGURATION_KINDS } from "@hyperidle/domain-model";
import {
	get as getKnowledgeItem,
	restorePluginDocumentBody,
	setKnowledgeStatus,
	type UpsertPluginDocumentInput,
	upsertPluginDocument,
} from "@hyperidle/knowledge";
import { getRoutine, insertRoutine, setRoutinesLive, softDeleteRoutines } from "@hyperidle/routine";
import {
	agentItemId,
	clearDetached,
	contributedEntityIds,
	disablePlugin,
	enablePlugin,
	forgetContributionsExcept,
	getInstalledPlugin,
	type InstalledPlugin,
	installPlugin,
	listConfiguration,
	listContributions,
	listInstalledPlugins,
	type PluginContribution,
	type PluginScope,
	type PluginSource,
	parsePluginManifest,
	pluginContributionKey,
	recordContribution,
	removePlugin,
	restorePluginContribution,
	routineItemId,
	skillItemId,
} from "@hyperidle/settings";
import { insertUserIfAbsent, listUsers, setAgentsStatus } from "@hyperidle/users";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Response shapes (local — no domain-model entry needed for this surface)
// ---------------------------------------------------------------------------

/**
 * One thing a plugin contributed, as the settings view shows it.
 *
 * @lore BA9g: this used to be a `plugin_configuration_defaults` row and nothing
 * else, so the shipped `knowledge-management` plugin — one agent, three
 * routines, three skills, and `"contributions": []` in its manifest — rendered
 * an entirely empty view. The registry knows the agents, routines and knowledge
 * too, so `kind` widened past `ConfigurationKind` and `entityId` names the row.
 */
export interface PluginContributionView {
	readonly kind: ConfigurationKind | PluginContributionKind;
	/** The contributed row's id, or the namespaced configuration key. */
	readonly entityId: string;
	/** What a person calls it: an agent's name, a routine's name, a document's title. */
	readonly label: string;
	readonly key: string; // namespaced: "pluginId/manifestKey"
	readonly manifestKey: string;
	/** A person has edited it, so a reinstall leaves their version alone. */
	readonly detached: boolean;
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

/**
 * Make everything a plugin contributed live, or not live.
 *
 * @lore BA9g: enable, disable and remove each spelled this out separately, over
 * three different provenance mechanisms, and drifted apart — disable wrote a
 * routine's `active` but not its `state`; remove set `deletedAt` that nothing
 * ever cleared; install revived skills but not agents or routines, so
 * reinstalling a disabled plugin produced one that reported `enabled` with a
 * dead agent. One function, one outcome, whatever the caller is doing.
 *
 * The plugin service names the rows; the service owning each table writes them.
 */
async function setContributionsLive(
	exec: WriteExecutor,
	pluginId: string,
	live: boolean,
): Promise<void> {
	const [agentIds, routineIds, knowledgeIds] = await Promise.all([
		contributedEntityIds(exec, pluginId, "agent"),
		contributedEntityIds(exec, pluginId, "routine"),
		contributedEntityIds(exec, pluginId, "knowledge"),
	]);
	await setAgentsStatus(exec, agentIds, live ? "active" : "inactive");
	await setRoutinesLive(exec, routineIds, live);
	await setKnowledgeStatus(exec, knowledgeIds, live ? "active" : "archived");
}

/**
 * What each contributed row is called, asked of the service that owns it.
 *
 * An id is not a name, and the contributions view is a list of what a plugin
 * brought — so each row says what the thing is called.
 */
async function labelContributions(
	db: HyperIdleDb,
	contributions: readonly PluginContribution[],
): Promise<ReadonlyMap<string, string>> {
	const idsOf = (kind: PluginContributionKind): string[] =>
		contributions.filter((c) => c.kind === kind).map((c) => c.entityId);

	const agentIds = idsOf("agent");
	const routineIds = idsOf("routine");
	const knowledgeIds = idsOf("knowledge");

	const [agents, routines, documents] = await Promise.all([
		agentIds.length > 0 ? listUsers(db, { ids: agentIds }) : Promise.resolve([]),
		routineIds.length > 0
			? Promise.all(routineIds.map((id) => getRoutine(db, id)))
			: Promise.resolve([]),
		knowledgeIds.length > 0
			? Promise.all(knowledgeIds.map((id) => getKnowledgeItem(db, id)))
			: Promise.resolve([]),
	]);

	const labels = new Map<string, string>();
	for (const a of agents) labels.set(a.id, a.name);
	for (const r of routines) if (r) labels.set(r.id, r.name);
	for (const d of documents) if (d) labels.set(d.id, d.title);
	return labels;
}

/**
 * The plugin's own version of a contributed document, read off disk.
 *
 * A skill document's id is `skillItemId(pluginId, dirName)` — a one-way hash —
 * so there is no way back from the id to the directory. Enumerating the
 * plugin's skill directories and hashing each one inverts it, and keeps the id
 * derivation as the single source of truth rather than storing the mapping
 * twice.
 *
 * Returns null when nothing on disk produces this id: a corrupt install, or a
 * document whose source is the manifest rather than a file.
 */
function readPluginDocumentSource(
	installPath: string,
	pluginId: string,
	documentId: string,
): string | null {
	const parsed = parsePluginManifest(installPath);
	if (parsed.ok) {
		for (const skill of parsed.manifest.skills) {
			if (skillItemId(pluginId, skill.dirName) === documentId) return skill.body;
		}
		// An agent's identity is a document too, and its source is the file the
		// manifest's `identity` names. Without this branch, restoring a persona —
		// the whole point of the `role-personas` plugin — answered 422.
		for (const agent of parsed.manifest.agents) {
			if (agent.identity === null) continue;
			const agentDbId = agentItemId(pluginId, agent.id, "factory", null);
			if (`ki_af_${agentDbId}` === documentId) return agent.identity;
		}

		// A routine's prompt is a document too, and its source is the manifest
		// rather than a file. Only the factory shape is derivable here — a
		// team-scoped install's ids carry the team, which this function is not
		// told; those fall through to null and the caller answers 422.
		for (const routine of parsed.manifest.routines) {
			const routineDbId = routineItemId(pluginId, routine.id, "factory", null);
			if (`ki_rp_${routineDbId}` === documentId) return routine.prompt ?? null;
		}
	}
	return null;
}

export function createPluginRoutes(db: HyperIdleDb, pluginsBaseDir?: string): Hono {
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
				entityId: item.key,
				label: manifestKey,
				key: item.key,
				manifestKey,
				detached: item.valueSource === "user_override",
			});
			contributionsByPlugin.set(pid, existing);
		}

		// The registry's half: agents, routines and knowledge documents, which are
		// rows in three other services' tables and were invisible here.
		for (const p of installed) {
			const contributions = await listContributions(db, p.id);
			if (contributions.length === 0) continue;
			const labels = await labelContributions(db, contributions);
			const existing = contributionsByPlugin.get(p.id) ?? [];
			for (const contribution of contributions) {
				if (contribution.kind === "configuration_default") continue;
				existing.push({
					kind: contribution.kind,
					entityId: contribution.entityId,
					label: labels.get(contribution.entityId) ?? contribution.entityId,
					key: contribution.entityId,
					manifestKey: contribution.entityId,
					detached: contribution.detachedAt !== null,
				});
			}
			contributionsByPlugin.set(p.id, existing);
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
			const knowledgeIds: string[] = [];
			const agentIds: string[] = [];
			const routineIds: string[] = [];
			for (const skill of skills) {
				const id = skillItemId(plugin.id, skill.dirName);
				knowledgeIds.push(id);
				const input: UpsertPluginDocumentInput = {
					id,
					pluginId: plugin.id,
					title: skill.dirName,
					body: skill.body,
					scopeKind,
					scopeId,
					// No `plugin:<id>` topic. The registry records who contributed
					// this; the topic is a person's field.
					topic: null,
					ts: installTs,
				};
				await upsertPluginDocument(tx, input);
			}

			// Materialize declared agents as users rows.
			// @lore BA9d: agentItemId/routineItemId include scope so factory installs
			// produce one global row (teamId=null) while team installs produce one row
			// per team (teamId=scopeId). insertUserIfAbsent makes reinstall idempotent.
			for (const agentSpec of agents) {
				const dbId = agentItemId(plugin.id, agentSpec.id, scopeKind, scopeId);
				agentIds.push(dbId);
				await insertUserIfAbsent(tx, {
					id: dbId,
					kind: "ai",
					name: agentSpec.name,
					role: agentSpec.role,
					status: "active",
					agentCategory: agentSpec.agentCategory,
					teamId: scopeKind === "team" ? scopeId : null,
					createdAt: installTs,
				});

				// Who the agent is. A plugin contributing an agent contributes its
				// identity — the gap BA9f named, closed now that an identity is a
				// knowledge document. Deterministic id so a reinstall updates the same
				// document instead of orphaning it, and `upsertPluginDocument` leaves
				// the body alone on conflict so a person's edit survives.
				if (agentSpec.identity) {
					const identityId = `ki_af_${dbId}`;
					knowledgeIds.push(identityId);
					await upsertPluginDocument(tx, {
						id: identityId,
						pluginId: plugin.id,
						title: `${agentSpec.name} — identity`,
						scopeKind: "user",
						scopeId: dbId,
						topic: null,
						body: agentSpec.identity,
						ts: installTs,
						role: "agent_file",
					});
				}
			}

			// Materialize declared routines. insertRoutine onConflictDoNothing makes
			// reinstall safe. Routines reference the materialized agent by DB id.
			for (const routineSpec of routines) {
				const routineDbId = routineItemId(plugin.id, routineSpec.id, scopeKind, scopeId);
				const agentDbId = agentItemId(plugin.id, routineSpec.agentId, scopeKind, scopeId);
				// A routine's instruction is a knowledge document, so a plugin
				// contributing a routine contributes its prompt as one — the thing the
				// old column made impossible. Deterministic id so a reinstall updates
				// the same document rather than orphaning it.
				let routinePromptDocId: string | null = null;
				if (routineSpec.prompt) {
					routinePromptDocId = `ki_rp_${routineDbId}`;
					knowledgeIds.push(routinePromptDocId);
					await upsertPluginDocument(tx, {
						id: routinePromptDocId,
						pluginId: plugin.id,
						title: `${routineSpec.name || "Routine"} — prompt`,
						scopeKind: "factory",
						scopeId: null,
						topic: null,
						body: routineSpec.prompt,
						ts: installTs,
						role: "ordinary",
					});
				}
				await insertRoutine(
					tx,
					{
						id: routineDbId,
						name: routineSpec.name,
						ownerAgentId: agentDbId,
						triggerType: routineSpec.triggerType,
						triggerConfig: routineSpec.triggerConfig ?? null,
						eventType: routineSpec.eventType ?? null,
						promptKnowledgeId: routinePromptDocId,
						createdAt: installTs,
					},
					{ onConflictDoNothing: true },
				);
				routineIds.push(routineDbId);
			}

			// Record what this install contributed, and forget what it no longer
			// declares — a renamed skill directory, a dropped routine. The stale
			// rows are archived; nothing is hard-deleted, because the audit tables
			// hold RESTRICT FKs on them.
			for (const [kind, ids] of [
				["agent", agentIds],
				["routine", routineIds],
				["knowledge", knowledgeIds],
			] as const) {
				for (const entityId of ids) {
					await recordContribution(tx, { pluginId: plugin.id, kind, entityId, ts: installTs });
				}
				const stale = await forgetContributionsExcept(tx, {
					pluginId: plugin.id,
					kind,
					keepEntityIds: ids,
				});
				if (kind === "knowledge") await setKnowledgeStatus(tx, stale, "archived");
				if (kind === "routine") await softDeleteRoutines(tx, stale);
				if (kind === "agent") await setAgentsStatus(tx, stale, "inactive");
			}

			// Installing is a deliberate act: everything this plugin contributes is
			// live afterwards, whatever a previous disable or remove left behind.
			await setContributionsLive(tx, plugin.id, true);
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
				await setContributionsLive(tx, id, true);
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
				await setContributionsLive(tx, id, false);
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
				await setContributionsLive(tx, id, false);
				// Remove goes one step further than disable: the routines are
				// soft-deleted, not just paused. A reinstall clears `deletedAt`.
				await softDeleteRoutines(tx, await contributedEntityIds(tx, id, "routine"));
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
		const { kind, manifestKey, entityId } = body as {
			kind?: unknown;
			manifestKey?: unknown;
			entityId?: unknown;
		};

		// @lore BA9g: a registry-backed contribution — an agent, a routine, a
		// knowledge document — is named by the row it points at, not by a manifest
		// key. Those rows are not `plugin_configuration_defaults` entries, which is
		// why they never appeared in the view and this branch was unreachable.
		if (typeof entityId === "string" && entityId) {
			const owned = await listContributions(db, pluginId);
			const contribution = owned.find((cont) => cont.entityId === entityId);
			if (!contribution) {
				return c.json(
					{
						code: "NOT_FOUND",
						error: `Plugin "${pluginId}" did not contribute "${entityId}".`,
					},
					404,
				);
			}
			if (contribution.kind !== "knowledge") {
				// An agent or a routine has no shipped body to re-import — what a
				// person edits on those is their own configuration. Handing it back
				// means clearing the claim, nothing more.
				await clearDetached(db, { kind: contribution.kind, entityId });
				return c.json({ ok: true, entityId });
			}
			if (!existing.installPath) {
				return c.json(
					{
						code: "NO_INSTALL_PATH",
						error:
							"This plugin has no recorded install path — it was installed before restore was supported, or on a server not configured with a plugins directory. Reinstall the plugin to enable restore.",
					},
					422,
				);
			}
			const sourceBody = readPluginDocumentSource(existing.installPath, pluginId, entityId);
			if (sourceBody === null) {
				return c.json(
					{
						code: "SKILL_SOURCE_NOT_FOUND",
						error: `Source for "${entityId}" not found under ${existing.installPath}. The plugin install may be corrupted.`,
					},
					422,
				);
			}
			await db.transaction(async (tx) => {
				await restorePluginDocumentBody(tx, entityId, sourceBody, `plugin:${pluginId}`);
				await clearDetached(tx, { kind: "knowledge", entityId });
			});
			return c.json({ ok: true, entityId });
		}

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
