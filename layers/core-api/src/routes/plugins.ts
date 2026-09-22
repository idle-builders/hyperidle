/**
 * Plugin management HTTP routes.
 *
 * Surface: install, list, enable, disable, remove, restore-contribution.
 * Scope is stored on install and returned on list; scope filtering (factory
 * vs team) bites during session materialisation in BA9b — see @lore in
 * plugin-installer.ts.
 *
 * @lore document-module B10: every document read/write goes through the
 * composed `search_documents`/`edit_document` actions (injected, `runnerFor`
 * over the SAME composed list `app.ts` builds for everyone else — architecture.md
 * §8.2), never `@hyperidle/document`'s repository functions. The actor is the
 * requesting person (`c.get("userId")`), so every document a plugin lifecycle
 * touches gets a real `changes` row.
 *
 * `edit_document` opens its own transaction per call (architecture.md §3.5) —
 * "a module reaches another only through its actions, never inside a shared
 * transaction" (`document-actions.ts`'s own `openParent` comment). So the
 * document-touching calls in this file never run inside this route's OWN
 * `db.transaction(...)` blocks; they run before it opens or after it commits.
 * Install is four phases for that reason, in this order: (1) the agents/
 * routines transaction commits; (2) the document upsert runs, BEFORE the
 * contribution registry claims these ids — a fresh create's `onBodyChanged`
 * hook (O1) marks a document detached the moment a `plugin_contributions` row
 * already names its id, and a plugin's own first write must never read as a
 * person's edit; (3) the contribution-registry transaction commits, naming
 * what is current and what is now stale; (4) the stale documents are
 * archived. Enable/disable/remove read the registry first (it already names
 * everything, nothing to (re)record) so they are two phases: the
 * agent/routine transaction, then the document archive loop.
 */

import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import type {
	ActionResult,
	ConfigurationKind,
	DocumentParentKind,
	DocumentRow,
	DocumentSlot,
	DocumentView,
	EditDocumentInput,
	PluginContributionKind,
	ScopeKind,
	SearchDocumentsInput,
} from "@hyperidle/domain-model";
import { CONFIGURATION_KINDS } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
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
import type { Context } from "hono";
import { Hono } from "hono";
import type { ActionContext } from "../actions/action.js";

/** `search_documents`'s bound `run`, injected from the composed action list
 * (architecture.md §8.2) — the same shape `SendMessageRunFn` already
 * establishes for `send_message` in `teams-routes.ts`. */
type SearchDocumentsRun = (
	ctx: ActionContext,
	input: SearchDocumentsInput,
) => Promise<ActionResult<readonly DocumentRow[]>>;

/** `edit_document`'s bound `run`, injected the same way. */
type EditDocumentRun = (
	ctx: ActionContext,
	input: EditDocumentInput,
) => Promise<ActionResult<DocumentView>>;

// ---------------------------------------------------------------------------
// Response shapes (local — no domain-model entry needed for this surface)
// ---------------------------------------------------------------------------

/**
 * One thing a plugin contributed, as the settings view shows it.
 *
 * @lore BA9g: this used to be a `plugin_configuration_defaults` row and nothing
 * else, so the shipped `document-management` plugin — one agent, three
 * routines, three skills, and `"contributions": []` in its manifest — rendered
 * an entirely empty view. The registry knows the agents, routines and documents
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
// Helpers
// ---------------------------------------------------------------------------

/** The `ActionContext` every document action call in this file shares — the
 * requesting person is the actor, in-process, same as every other Action. */
function ctxFor(
	c: Context<HyperIdleEnv>,
	db: HyperIdleDb,
	eventBus: EventBus,
	now?: string,
): ActionContext {
	return { actor: c.get("userId"), db, eventBus, now: now ?? new Date().toISOString() };
}

/**
 * Make everything a plugin's agents and routines contributed live, or not —
 * the document half is `setContributedDocumentsLive` below, kept separate
 * because it runs through `edit_document` (its own transaction) rather than
 * this one.
 *
 * @lore BA9g: enable, disable and remove each spelled this out separately, over
 * three different provenance mechanisms, and drifted apart — disable wrote a
 * routine's `active` but not its `state`; remove set `deletedAt` that nothing
 * ever cleared; install revived skills but not agents or routines, so
 * reinstalling a disabled plugin produced one that reported `enabled` with a
 * dead agent. One function, one outcome, whatever the caller is doing.
 */
async function setNonDocumentContributionsLive(
	exec: WriteExecutor,
	ids: { readonly agentIds: readonly string[]; readonly routineIds: readonly string[] },
	live: boolean,
): Promise<void> {
	await setAgentsStatus(exec, ids.agentIds, live ? "active" : "inactive");
	await setRoutinesLive(exec, ids.routineIds, live);
}

/**
 * The document half of "make it live, or not" — an archive loop of
 * `edit_document({id, status})`, one edit and one `changes` row per document,
 * each attributed to the requesting person (architecture.md §8.3).
 *
 * @lore document-module B10 follow-up: `plugin_contributions` has no scope
 * column, so its registry cannot tell "no longer declared by a reinstall of
 * THIS scope" apart from "belongs to a DIFFERENT team's independent install
 * of the same plugin id" — the `plugins` row is a singleton, but two teams
 * can each hold their own scope-derived materialized rows (agentItemId /
 * routineItemId / skillItemId all fold scope into the hash). A document id
 * that turns out to belong to another scope fails `edit_document`'s
 * visibility check (architecture.md §5.1) — filtered out here BEFORE the
 * write, so one team's install can never crash trying to archive a row it
 * cannot see, and never touches it either. This is a narrow, local guard,
 * not a fix for the registry's missing scope column — a plugin_contributions
 * row for another team's document can still be dropped from THIS plugin's
 * registry by `forgetContributionsExcept` (settings/src/plugin-contributions.ts)
 * even though the underlying document is left alone; that only matters if a
 * later enable/disable/remove needs to find it again through the registry,
 * which is the residual gap this guard does not close.
 */
async function setContributedDocumentsLive(
	ctx: ActionContext,
	deps: { readonly searchDocuments: SearchDocumentsRun; readonly editDocument: EditDocumentRun },
	documentIds: readonly string[],
	live: boolean,
): Promise<void> {
	if (documentIds.length === 0) return;
	const found = await deps.searchDocuments(ctx, { ids: [...documentIds] });
	const visibleIds = new Set((found.ok ? found.data : []).map((d) => d.id));
	for (const id of documentIds) {
		if (!visibleIds.has(id)) continue;
		const result = await deps.editDocument(ctx, { id, status: live ? "active" : "archived" });
		if (!result.ok) {
			throw new Error(
				`plugin document ${live ? "activate" : "archive"} failed for "${id}": ` +
					result.problems.map((p) => p.code).join(", "),
			);
		}
	}
}

/** One document a plugin contributes — a skill, an agent's identity, or a
 * routine's prompt — before it is written. Scope is per-spec, not shared: a
 * skill or a routine's prompt takes the plugin's own install scope, but an
 * agent's identity is private to that agent (`scopeKind: "user"`,
 * `scopeId: <agent id>`) — the same binding session assembly reads. */
interface ContributedDocumentSpec {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly slot: DocumentSlot;
	readonly parentKind: DocumentParentKind | null;
	readonly parentId: string | null;
	readonly scopeKind: ScopeKind;
	readonly scopeId: string | null;
}

/**
 * The read-then-edit upsert architecture.md §8.3 names: `search_documents`
 * finds which of these ids already exist, then `edit_document` writes each —
 * a fresh id gets its title/body/slot/parent (create-only fields, §3.5); an
 * existing id gets only `scopeKind`/`scopeId`/`status` refreshed. Neither
 * `title` nor `body` is ever in the update set — a reinstall over a
 * person-edited body (or a person-renamed title) leaves it alone, exactly as
 * the legacy `upsertKnowledgeDocument`'s `onConflictDoUpdate` did.
 *
 * `slot`/`parent` are likewise never sent on an edit: I9/I10
 * (`framework/domain-model/src/actions/document.ts`) fix a slotted document's
 * slot and parent at create — a locked invariant this block does not own —
 * so an existing row's binding cannot be "repaired" through this door even
 * when it predates the parent column. Nothing in this module writes such a
 * row going forward: every create passes its parent.
 */
async function runEditOrThrow(
	ctx: ActionContext,
	editDocument: EditDocumentRun,
	input: EditDocumentInput,
): Promise<void> {
	const result = await editDocument(ctx, input);
	if (!result.ok) {
		throw new Error(
			`plugin document upsert failed for "${input.id}": ` +
				result.problems.map((p) => p.code).join(", "),
		);
	}
}

async function upsertContributedDocuments(
	ctx: ActionContext,
	deps: { readonly searchDocuments: SearchDocumentsRun; readonly editDocument: EditDocumentRun },
	specs: readonly ContributedDocumentSpec[],
): Promise<void> {
	if (specs.length === 0) return;
	const found = await deps.searchDocuments(ctx, { ids: specs.map((s) => s.id) });
	const existing = new Map((found.ok ? found.data : []).map((d) => [d.id, d]));

	for (const spec of specs) {
		const prev = existing.get(spec.id);
		if (!prev) {
			// Create: every create-only field, architecture.md §3.5.
			await runEditOrThrow(ctx, deps.editDocument, {
				id: spec.id,
				status: "active",
				scopeKind: spec.scopeKind,
				scopeId: spec.scopeId,
				title: spec.title,
				body: spec.body,
				slot: spec.slot,
				parent: spec.parentKind ? { kind: spec.parentKind, id: spec.parentId as string } : null,
			});
			continue;
		}

		// I12 (`status_from_archived`): an archived row refuses any OTHER field
		// in the same edit — "reopen it before changing anything else on it" —
		// so a reinstall over a disabled plugin's document reopens alone first.
		if (prev.status === "archived") {
			await runEditOrThrow(ctx, deps.editDocument, { id: spec.id, status: "active" });
		}
		const scopeChanged = prev.scopeKind !== spec.scopeKind || prev.scopeId !== spec.scopeId;
		if (scopeChanged) {
			await runEditOrThrow(ctx, deps.editDocument, {
				id: spec.id,
				scopeKind: spec.scopeKind,
				scopeId: spec.scopeId,
			});
		} else if (prev.status !== "active" && prev.status !== "archived") {
			// `proposed`/`stale` — installing is a deliberate act; make it active
			// even when scope did not change.
			await runEditOrThrow(ctx, deps.editDocument, { id: spec.id, status: "active" });
		}
	}
}

/**
 * What each contributed row is called, asked of the service that owns it.
 *
 * An id is not a name, and the contributions view is a list of what a plugin
 * brought — so each row says what the thing is called.
 */
async function labelContributions(
	ctx: ActionContext,
	searchDocuments: SearchDocumentsRun,
	db: HyperIdleDb,
	contributions: readonly PluginContribution[],
): Promise<ReadonlyMap<string, string>> {
	const idsOf = (kind: PluginContributionKind): string[] =>
		contributions.filter((c) => c.kind === kind).map((c) => c.entityId);

	const agentIds = idsOf("agent");
	const routineIds = idsOf("routine");
	const documentIds = idsOf("document");

	const [agents, routines, documentsResult] = await Promise.all([
		agentIds.length > 0 ? listUsers(db, { ids: agentIds }) : Promise.resolve([]),
		routineIds.length > 0
			? Promise.all(routineIds.map((id) => getRoutine(db, id)))
			: Promise.resolve([]),
		// Batched, one call for every contributed document — never a per-id
		// loop (the same N+1 guard architecture.md §8.3 applies elsewhere).
		documentIds.length > 0
			? searchDocuments(ctx, { ids: documentIds })
			: Promise.resolve({ ok: true as const, data: [] as readonly DocumentRow[] }),
	]);

	const labels = new Map<string, string>();
	for (const a of agents) labels.set(a.id, a.name);
	for (const r of routines) if (r) labels.set(r.id, r.name);
	if (documentsResult.ok) for (const d of documentsResult.data) labels.set(d.id, d.title);
	return labels;
}

/**
 * The plugin's own version of a contributed document, read off disk.
 *
 * A skill document's id is `skillItemId(pluginId, dirName, scopeKind,
 * scopeId)` — a one-way hash — so there is no way back from the id to the
 * directory. Enumerating the plugin's skill directories and hashing each one
 * inverts it, and keeps the id derivation as the single source of truth
 * rather than storing the mapping twice. `scopeKind`/`scopeId` are the
 * plugin's OWN install scope (`existing.scope`, the caller's) — every id this
 * function re-derives must use the same scope the install did, or the hashes
 * never line up for a team-scoped install.
 *
 * Returns null when nothing on disk produces this id: a corrupt install, or a
 * document whose source is the manifest rather than a file.
 */
function readPluginDocumentSource(
	installPath: string,
	pluginId: string,
	documentId: string,
	scopeKind: string,
	scopeId: string | null,
): string | null {
	const parsed = parsePluginManifest(installPath);
	if (parsed.ok) {
		for (const skill of parsed.manifest.skills) {
			if (skillItemId(pluginId, skill.dirName, scopeKind, scopeId) === documentId)
				return skill.body;
		}
		// An agent's identity is a document too, and its source is the file the
		// manifest's `identity` names. Without this branch, restoring a persona —
		// the whole point of the `role-personas` plugin — answered 422.
		for (const agent of parsed.manifest.agents) {
			if (agent.identity === null) continue;
			const agentDbId = agentItemId(pluginId, agent.id, scopeKind, scopeId);
			if (`ki_af_${agentDbId}` === documentId) return agent.identity;
		}

		// A routine's prompt is a document too, and its source is the manifest
		// rather than a file.
		for (const routine of parsed.manifest.routines) {
			const routineDbId = routineItemId(pluginId, routine.id, scopeKind, scopeId);
			if (`ki_rp_${routineDbId}` === documentId) return routine.prompt ?? null;
		}
	}
	return null;
}

export function createPluginRoutes(
	db: HyperIdleDb,
	eventBus: EventBus,
	editDocument: EditDocumentRun,
	searchDocuments: SearchDocumentsRun,
	pluginsBaseDir?: string,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// ── GET /api/plugins ────────────────────────────────────────────────────
	// Lists installed (non-removed) plugins with per-plugin contribution views.
	// Each contribution includes a `detached` flag when the user has overridden
	// the plugin-contributed default (valueSource === "user_override").
	router.get("/", async (c) => {
		const installed = await listInstalledPlugins(db);
		if (installed.length === 0) {
			return c.json({ plugins: [] } satisfies PluginListResponse);
		}
		const ctx = ctxFor(c, db, eventBus);

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

		// The registry's half: agents, routines and documents, which are rows in
		// three other services' tables and were invisible here.
		for (const p of installed) {
			const contributions = await listContributions(db, p.id);
			if (contributions.length === 0) continue;
			const labels = await labelContributions(ctx, searchDocuments, db, contributions);
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

		// BA9b: sync plugin skills into documents. The installer (settings
		// layer) cannot write documents (it doesn't own that table); this route
		// is the correct cross-service bridge, through `edit_document`.
		//
		// BA9d: materialize plugin-declared agents (users rows) and routines rows.
		// settings cannot write users or routines — those tables are owned by their
		// respective services. Both uses are idempotent (insertUserIfAbsent /
		// insertRoutine onConflictDoNothing), so reinstalling is safe.
		const { plugin, skills, agents, routines, scopeKind, scopeId, installTs } = result;

		const agentIds: string[] = [];
		const routineIds: string[] = [];
		const documentSpecs: ContributedDocumentSpec[] = [];

		for (const skill of skills) {
			documentSpecs.push({
				id: skillItemId(plugin.id, skill.dirName, scopeKind, scopeId),
				title: skill.dirName,
				body: skill.body,
				slot: "skill",
				// A skill has no parent — it is a capability document,
				// reached from its own list, not hung off any entity.
				parentKind: null,
				parentId: null,
				scopeKind: scopeKind as ScopeKind,
				scopeId,
			});
		}

		for (const agentSpec of agents) {
			const dbId = agentItemId(plugin.id, agentSpec.id, scopeKind, scopeId);
			agentIds.push(dbId);
			// Who the agent is. A plugin contributing an agent contributes its
			// identity — the gap BA9f named, closed now that an identity is a
			// document. Deterministic id so a reinstall updates the same
			// document instead of orphaning it. Private to the agent — the same
			// `scopeKind: "user", scopeId: <agent id>` binding session assembly
			// reads — never the plugin's own install scope.
			if (agentSpec.identity) {
				documentSpecs.push({
					id: `ki_af_${dbId}`,
					title: `${agentSpec.name} — identity`,
					body: agentSpec.identity,
					slot: "agent_file",
					parentKind: "agent",
					parentId: dbId,
					scopeKind: "user",
					scopeId: dbId,
				});
			}
		}

		// Routines reference the materialized agent by DB id.
		for (const routineSpec of routines) {
			const routineDbId = routineItemId(plugin.id, routineSpec.id, scopeKind, scopeId);
			routineIds.push(routineDbId);
			// A routine's instruction is a document too, so a plugin contributing
			// a routine contributes its prompt as one. Deterministic id so a
			// reinstall updates the same document rather than orphaning it.
			if (routineSpec.prompt) {
				documentSpecs.push({
					id: `ki_rp_${routineDbId}`,
					title: `${routineSpec.name || "Routine"} — prompt`,
					body: routineSpec.prompt,
					slot: "prompt",
					parentKind: "routine",
					parentId: routineDbId,
					scopeKind: scopeKind as ScopeKind,
					scopeId,
				});
			}
		}

		// Phase 1 — agents and routines materialize, in ONE transaction. Never a
		// document write in here: `edit_document` opens its own transaction per
		// call, and this route's transaction may not share one with it
		// (top-of-file @lore).
		await db.transaction(async (tx) => {
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
					createdAt: installTs,
				});
			}

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
						createdAt: installTs,
					},
					{ onConflictDoNothing: true },
				);
			}

			// Installing is a deliberate act: every agent and routine this plugin
			// contributes is live afterwards, whatever a previous disable left
			// behind. The document half of "live" is the upsert below — every
			// contributed id is written with `status: "active"`.
			await setNonDocumentContributionsLive(tx, { agentIds, routineIds }, true);
		});

		// Phase 2 — after that transaction commits: the plugin's documents,
		// through `edit_document`'s read-then-edit upsert. BEFORE the
		// contribution registry records these ids (Phase 3) — a fresh create's
		// `onBodyChanged` hook (O1) marks a document detached the moment a
		// `plugin_contributions` row already claims its id, and a plugin's own
		// first write must never read as a person's edit.
		const ctx = ctxFor(c, db, eventBus, installTs);
		await upsertContributedDocuments(ctx, { searchDocuments, editDocument }, documentSpecs);

		// Phase 3 — the contribution registry: record what this install
		// contributed, and forget what it no longer declares (a renamed skill
		// directory, a dropped routine). The stale rows are archived; nothing is
		// hard-deleted, because the audit tables hold RESTRICT FKs on them.
		let staleDocumentIds: readonly string[] = [];
		const documentIds = documentSpecs.map((d) => d.id);
		await db.transaction(async (tx) => {
			for (const [kind, ids] of [
				["agent", agentIds],
				["routine", routineIds],
				["document", documentIds],
			] as const) {
				for (const entityId of ids) {
					await recordContribution(tx, { pluginId: plugin.id, kind, entityId, ts: installTs });
				}
				const stale = await forgetContributionsExcept(tx, {
					pluginId: plugin.id,
					kind,
					keepEntityIds: ids,
				});
				if (kind === "document") staleDocumentIds = stale;
				if (kind === "routine") await softDeleteRoutines(tx, stale);
				if (kind === "agent") await setAgentsStatus(tx, stale, "inactive");
			}
		});

		// Phase 4 — the document half of "forget what's stale": an archive loop,
		// same reasoning as Phase 2 for why it is outside the Phase 3 transaction.
		if (staleDocumentIds.length > 0) {
			await setContributedDocumentsLive(
				ctx,
				{ searchDocuments, editDocument },
				staleDocumentIds,
				false,
			);
		}

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
		// settings cannot write routines/users/documents). Service functions own
		// each table write.
		const [agentIds, routineIds, documentIds] = await Promise.all([
			contributedEntityIds(db, id, "agent"),
			contributedEntityIds(db, id, "routine"),
			contributedEntityIds(db, id, "document"),
		]);
		try {
			await db.transaction(async (tx) => {
				await setNonDocumentContributionsLive(tx, { agentIds, routineIds }, true);
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return c.json({ code: "ENABLE_CLEANUP_FAILED", error: msg }, 500);
		}
		try {
			await setContributedDocumentsLive(
				ctxFor(c, db, eventBus),
				{ searchDocuments, editDocument },
				documentIds,
				true,
			);
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
		// (governance boundary: settings cannot write routines/users/documents).
		const [agentIds, routineIds, documentIds] = await Promise.all([
			contributedEntityIds(db, id, "agent"),
			contributedEntityIds(db, id, "routine"),
			contributedEntityIds(db, id, "document"),
		]);
		try {
			await db.transaction(async (tx) => {
				await setNonDocumentContributionsLive(tx, { agentIds, routineIds }, false);
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return c.json({ code: "DISABLE_CLEANUP_FAILED", error: msg }, 500);
		}
		try {
			await setContributedDocumentsLive(
				ctxFor(c, db, eventBus),
				{ searchDocuments, editDocument },
				documentIds,
				false,
			);
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
		// @lore BA9d: clean up all materialised rows. Routines soft-deleted (not
		// hard-deleted) because routine_runs has RESTRICT FK. Agents deactivated
		// (not hard-deleted) because many tables have RESTRICT FK on users.id.
		// Documents archived because `changes` has a RESTRICT FK on documents.id
		// via its own history, same reasoning.
		const [agentIds, routineIds, documentIds] = await Promise.all([
			contributedEntityIds(db, id, "agent"),
			contributedEntityIds(db, id, "routine"),
			contributedEntityIds(db, id, "document"),
		]);
		try {
			await db.transaction(async (tx) => {
				await setNonDocumentContributionsLive(tx, { agentIds, routineIds }, false);
				// Remove goes one step further than disable: the routines are
				// soft-deleted, not just paused. A reinstall clears `deletedAt`.
				await softDeleteRoutines(tx, routineIds);
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return c.json({ code: "REMOVE_CLEANUP_FAILED", error: msg }, 500);
		}
		try {
			await setContributedDocumentsLive(
				ctxFor(c, db, eventBus),
				{ searchDocuments, editDocument },
				documentIds,
				false,
			);
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
		// document — is named by the row it points at, not by a manifest key.
		// Those rows are not `plugin_configuration_defaults` entries, which is
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
			if (contribution.kind !== "document") {
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
			const sourceBody = readPluginDocumentSource(
				existing.installPath,
				pluginId,
				entityId,
				existing.scope.kind,
				existing.scope.teamId,
			);
			if (sourceBody === null) {
				return c.json(
					{
						code: "SKILL_SOURCE_NOT_FOUND",
						error: `Source for "${entityId}" not found under ${existing.installPath}. The plugin install may be corrupted.`,
					},
					422,
				);
			}
			// The one body-carrying edit this route ever makes — the plugin's
			// original content wins over whatever a person wrote.
			const editResult = await editDocument(ctxFor(c, db, eventBus), {
				id: entityId,
				body: sourceBody,
			});
			if (!editResult.ok) {
				return c.json(
					{
						code: "RESTORE_FAILED",
						error: editResult.problems.map((p) => p.message).join("; "),
					},
					500,
				);
			}
			await clearDetached(db, { kind: "document", entityId });
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
