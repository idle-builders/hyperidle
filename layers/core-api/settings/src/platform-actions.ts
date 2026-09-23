/**
 * The platform action list — `search_plugins` / `edit_plugin`. This Service
 * owns `plugins`, `plugin_contributions` and `plugin_configuration_defaults`
 * (`table-owners.json`), so it declares the runs itself. Replaces
 * `routes/plugins.ts` (984 lines, six routes) whole.
 *
 * `Action`/`ActionContext` below are a local structural mirror of
 * `layers/core-api/src/actions/action.ts`'s own pair, the same reason
 * `@hyperidle/document`/`@hyperidle/task`/`@hyperidle/thread` (and
 * `@hyperidle/run-orchestration`'s `session-actions.ts`) each declare their
 * own: a nested Service may not import the layer's own package.
 *
 * @lore document-module B10 (carried over from `routes/plugins.ts`'s own
 * header): every document read/write goes through the injected
 * `editDocument`/`searchDocuments` runners (`runnerFor` over the composed
 * list `compose.ts` builds), never a document
 * repository function directly. `edit_document` opens its own transaction
 * per call, so the document-touching calls in this file never run inside
 * this module's OWN `ctx.db.transaction(...)` blocks — they run before it
 * opens or after it commits. Install is four phases for that reason, in this
 * order: (1) the agents/routines transaction commits; (2) the document
 * upsert runs, BEFORE the contribution registry claims these ids — a fresh
 * create's `onBodyChanged` hook marks a document detached the moment a
 * `plugin_contributions` row already names its id, and a plugin's own first
 * write must never read as a person's edit; (3) the contribution-registry
 * transaction commits, naming what is current and what is now stale; (4) the
 * stale documents are archived. Enable/disable/remove read the registry
 * first (it already names everything, nothing to (re)record) so they are two
 * phases: the agent/routine transaction, then the document archive loop.
 *
 * `internal: true` is set INSIDE this module's own `run`, on the ctx it
 * hands to `editDocument` — never read off the caller's ctx
 * (`action.ts:37-50`'s own account of why).
 */

import { type HyperIdleDb, type NewUser, plugins, type WriteExecutor } from "@hyperidle/db";
import {
	type ActionDeclaration,
	type ActionResult,
	BUILTIN_PLUGIN_ID,
	type ConfigurationKind,
	type PluginScope as DeclaredPluginScope,
	type DocumentParentKind,
	type DocumentRow,
	type DocumentSlot,
	type DocumentView,
	type EditDocumentInput,
	type EditPluginInput,
	type EditPluginSource,
	editPlugin as editPluginDeclaration,
	editPluginInvariants,
	type PluginContributionKind,
	type PluginContributionView,
	type PluginView,
	type Problem,
	type ScopeKind,
	type SearchDocumentsInput,
	type SearchPluginsInput,
	searchPlugins as searchPluginsDeclaration,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { listConfiguration } from "./plugin-configuration.js";
import type { PluginContribution } from "./plugin-contributions.js";
import {
	clearDetached,
	contributedEntityIds,
	forgetContributionsExcept,
	listContributions,
	recordContribution,
} from "./plugin-contributions.js";
import {
	agentItemId,
	disablePlugin,
	enablePlugin,
	getInstalledPlugin,
	type InstalledPlugin,
	type PluginScope as InstallerPluginScope,
	installPlugin,
	listInstalledPlugins,
	type PluginSource,
	removePlugin,
	restorePluginContribution,
	skillItemId,
	subscriptionItemId,
} from "./plugin-installer.js";
import { parsePluginManifest } from "./plugin-manifest.js";

/**
 * Local structural mirror of `layers/core-api/src/actions/action.ts`'s
 * `ActionContext`/`Action` — same idiom `@hyperidle/document`'s
 * `action-types.ts` and `@hyperidle/run-orchestration`'s `session-actions.ts`
 * use and explain at length.
 */
export interface ActionContext {
	readonly actor: string;
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly now: string;
	readonly caller?: {
		readonly sessionId: string;
		readonly taskId: string | null;
		readonly threadId: string | null;
	};
	readonly internal?: boolean;
}

export interface Action<I = unknown, O = unknown> {
	readonly declaration: ActionDeclaration<I, O>;
	readonly run: (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}

/** `search_documents`'s bound `run`, injected — the same shape
 * `routes/plugins.ts`'s own `SearchDocumentsRun` established. */
type SearchDocumentsRunFn = (
	ctx: ActionContext,
	input: SearchDocumentsInput,
) => Promise<ActionResult<readonly DocumentRow[]>>;

/** `edit_document`'s bound `run`, injected the same way. */
type EditDocumentRunFn = (
	ctx: ActionContext,
	input: EditDocumentInput,
) => Promise<ActionResult<DocumentView>>;

/**
 * A plugin's own subscription trigger, as `edit_plugin` writes it: exactly
 * one of `event`/`schedule` (`subscriptions_trigger_ck`, migration 0088).
 */
export interface NewPlatformSubscription {
	readonly id: string;
	readonly userId: string;
	readonly event: string | null;
	readonly schedule: string | null;
	readonly createdAt: string;
}

/**
 * The platform module's outward-facing deps. Everything
 * outside `@hyperidle/settings`'s own three tables arrives here: an agent is
 * a `users` row, a subscription is a `subscriptions` row, a document
 * write/read goes through the composed `edit_document`/`search_documents`
 * runners — this package may import neither `@hyperidle/user` nor the
 * layer's own document composition, so the layer's `compose.ts` binds each
 * to the real function.
 *
 * @lore BC5 T7b: `routines` renamed `subscriptions` — `insertRoutine`'s
 * owner-side `nextRunAt` computation (cron parsing) moves into `compose.ts`'s
 * binding, since this package may not import `@hyperidle/user`'s cron
 * helpers either. `softDelete` becomes `remove` (a hard delete — a
 * subscription has no soft-delete column). `get` answers a display label
 * (`event` or `schedule` — a subscription has no `name` column) rather than
 * a name.
 */
export interface PlatformActionsDeps {
	readonly agents: {
		insertIfAbsent(exec: WriteExecutor, values: NewUser): Promise<void>;
		setStatus(
			exec: WriteExecutor,
			ids: readonly string[],
			status: "active" | "inactive",
		): Promise<void>;
		list(
			exec: WriteExecutor,
			ids: readonly string[],
		): Promise<readonly { readonly id: string; readonly name: string }[]>;
	};
	readonly subscriptions: {
		insert(
			exec: WriteExecutor,
			values: NewPlatformSubscription,
			opts?: { readonly onConflictDoNothing?: boolean },
		): Promise<void>;
		setLive(exec: WriteExecutor, ids: readonly string[], live: boolean): Promise<void>;
		remove(exec: WriteExecutor, ids: readonly string[]): Promise<void>;
		get(exec: WriteExecutor, id: string): Promise<{ readonly label: string } | undefined>;
	};
	readonly editDocument: EditDocumentRunFn;
	readonly searchDocuments: SearchDocumentsRunFn;
	/** BA9d D12: base directory plugin files persist to. Absent → no on-disk
	 * install (URL-based MCP servers still work; restore answers
	 * `no_install_path` for anything that needs a source file). */
	readonly pluginsBaseDir?: string;
}

// ---------------------------------------------------------------------------
// Row -> wire mapping.
// ---------------------------------------------------------------------------

function toDeclaredScope(scope: InstallerPluginScope): DeclaredPluginScope {
	return scope.kind === "team" && scope.teamId
		? { kind: "team", teamId: scope.teamId }
		: { kind: "factory", teamId: null };
}

/** `listInstalledPlugins`/`getInstalledPlugin` already exclude `state:
 * "removed"` — this is the defensive backstop matching `document-actions.ts`'s
 * own "transaction committed without writing a row" idiom: a real divergence
 * fails loudly here, never silently miscasts. */
function toListState(state: InstalledPlugin["state"]): "enabled" | "disabled" {
	if (state === "removed") {
		throw new Error("platform-actions: a removed plugin must never reach the view");
	}
	return state;
}

function toPluginView(
	p: InstalledPlugin,
	contributions: readonly PluginContributionView[],
): PluginView {
	return {
		id: p.id,
		name: p.name,
		version: p.version,
		state: toListState(p.state),
		scope: toDeclaredScope(p.scope),
		installedAt: p.installedAt,
		updatedAt: p.updatedAt,
		disabledAt: p.disabledAt,
		contributions: [...contributions],
	};
}

function internalCtx(ctx: ActionContext, now?: string): ActionContext {
	return { ...ctx, now: now ?? ctx.now, internal: true };
}

function problem(code: string, message: string, path?: string): { ok: false; problems: Problem[] } {
	return { ok: false, problems: [{ code, message, ...(path ? { path } : {}) }] };
}

// ---------------------------------------------------------------------------
// One document a plugin contributes — a skill, an agent's identity, or a
// routine's prompt — before it is written. Verbatim from `routes/plugins.ts`.
// ---------------------------------------------------------------------------

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
 * Make everything a plugin's agents and routines contributed live, or not —
 * the document half is `setContributedDocumentsLive` below, kept separate
 * because it runs through `editDocument` (its own transaction) rather than
 * this one.
 *
 * @lore BA9g (carried over): enable, disable and remove each spelled this
 * out separately, over three different provenance mechanisms, and drifted
 * apart. One function, one outcome, whatever the caller is doing.
 */
async function setNonDocumentContributionsLive(
	deps: PlatformActionsDeps,
	exec: WriteExecutor,
	ids: { readonly agentIds: readonly string[]; readonly subscriptionIds: readonly string[] },
	live: boolean,
): Promise<void> {
	await deps.agents.setStatus(exec, ids.agentIds, live ? "active" : "inactive");
	await deps.subscriptions.setLive(exec, ids.subscriptionIds, live);
}

/**
 * The document half of "make it live, or not" — an archive loop of
 * `edit_document({id, status})`, one edit and one `changes` row per
 * document, each attributed to the requesting person.
 */
async function setContributedDocumentsLive(
	ctx: ActionContext,
	deps: PlatformActionsDeps,
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

async function runEditOrThrow(
	ctx: ActionContext,
	editDocument: EditDocumentRunFn,
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

/**
 * The read-then-edit upsert: `search_documents` finds which of these ids
 * already exist, then `edit_document` writes each — a fresh id gets its
 * title/body/slot/parent (create-only fields); an existing id gets only
 * `scopeKind`/`scopeId`/`status` refreshed. Neither `title` nor `body` is
 * ever in the update set — a reinstall over a person-edited body leaves it
 * alone.
 */
async function upsertContributedDocuments(
	ctx: ActionContext,
	deps: PlatformActionsDeps,
	specs: readonly ContributedDocumentSpec[],
): Promise<void> {
	if (specs.length === 0) return;
	const found = await deps.searchDocuments(ctx, { ids: specs.map((s) => s.id) });
	const existing = new Map((found.ok ? found.data : []).map((d) => [d.id, d]));

	for (const spec of specs) {
		const prev = existing.get(spec.id);
		if (!prev) {
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
			await runEditOrThrow(ctx, deps.editDocument, { id: spec.id, status: "active" });
		}
	}
}

/** What each contributed row is called, asked of the service that owns it. */
async function labelContributions(
	ctx: ActionContext,
	deps: PlatformActionsDeps,
	contributions: readonly PluginContribution[],
): Promise<ReadonlyMap<string, string>> {
	const idsOf = (kind: PluginContributionKind): string[] =>
		contributions.filter((c) => c.kind === kind).map((c) => c.entityId);

	const agentIds = idsOf("agent");
	const subscriptionIds = idsOf("subscription");
	const documentIds = idsOf("document");

	const [agents, subscriptionRows, documentsResult] = await Promise.all([
		agentIds.length > 0 ? deps.agents.list(ctx.db, agentIds) : Promise.resolve([]),
		subscriptionIds.length > 0
			? Promise.all(subscriptionIds.map((id) => deps.subscriptions.get(ctx.db, id)))
			: Promise.resolve([]),
		documentIds.length > 0
			? deps.searchDocuments(ctx, { ids: documentIds })
			: Promise.resolve({ ok: true as const, data: [] as readonly DocumentRow[] }),
	]);

	const labels = new Map<string, string>();
	for (const a of agents) labels.set(a.id, a.name);
	subscriptionIds.forEach((id, i) => {
		const r = subscriptionRows[i];
		if (r) labels.set(id, r.label);
	});
	if (documentsResult.ok) for (const d of documentsResult.data) labels.set(d.id, d.title);
	return labels;
}

/**
 * The plugin's own version of a contributed document, read off disk. See
 * `routes/plugins.ts`'s own header for why every contributed document kind
 * (skill, agent identity, routine prompt) needs its own branch here.
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
		for (const agent of parsed.manifest.agents) {
			if (agent.identity === null) continue;
			const agentDbId = agentItemId(pluginId, agent.id, scopeKind, scopeId);
			if (`ki_af_${agentDbId}` === documentId) return agent.identity;
		}
		for (const subscription of parsed.manifest.subscriptions) {
			const subscriptionDbId = subscriptionItemId(pluginId, subscription.id, scopeKind, scopeId);
			if (`ki_rp_${subscriptionDbId}` === documentId) return subscription.prompt ?? null;
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// The contributions view — the configuration-default half plus the
// registry's half (agents, routines, documents).
// ---------------------------------------------------------------------------

interface ConfigurationItemForPlugin {
	readonly kind: ConfigurationKind;
	readonly key: string;
	readonly valueSource: string;
}

function manifestKeyOf(namespacedKey: string): string {
	const slashIdx = namespacedKey.indexOf("/");
	return slashIdx >= 0 ? namespacedKey.slice(slashIdx + 1) : namespacedKey;
}

async function pluginContributionsView(
	ctx: ActionContext,
	deps: PlatformActionsDeps,
	pluginId: string,
	configItemsForPlugin: readonly ConfigurationItemForPlugin[],
): Promise<PluginContributionView[]> {
	const view: PluginContributionView[] = [];
	for (const item of configItemsForPlugin) {
		const manifestKey = manifestKeyOf(item.key);
		view.push({
			kind: item.kind,
			entityId: item.key,
			label: manifestKey,
			key: item.key,
			manifestKey,
			detached: item.valueSource === "user_override",
		});
	}

	const contributions = await listContributions(ctx.db, pluginId);
	if (contributions.length > 0) {
		const labels = await labelContributions(ctx, deps, contributions);
		for (const c of contributions) {
			if (c.kind === "configuration_default") continue;
			view.push({
				kind: c.kind,
				entityId: c.entityId,
				label: labels.get(c.entityId) ?? c.entityId,
				key: c.entityId,
				manifestKey: c.entityId,
				detached: c.detachedAt !== null,
			});
		}
	}
	return view;
}

async function assemblePluginView(
	ctx: ActionContext,
	deps: PlatformActionsDeps,
	pluginId: string,
): Promise<PluginView> {
	const p = await getInstalledPlugin(ctx.db, pluginId);
	if (!p) {
		throw new Error(
			`platform-actions: expected plugin "${pluginId}" to exist after a successful write`,
		);
	}
	const configItems = (await listConfiguration(ctx.db)).filter(
		(item) => item.origin.pluginId === pluginId,
	);
	const contributions = await pluginContributionsView(ctx, deps, pluginId, configItems);
	return toPluginView(p, contributions);
}

// ---------------------------------------------------------------------------
// lookupPlugin — the not-found ladder every state/remove/restore change
// needs: builtin is always unknown; a genuinely absent id is `unknown_plugin`;
// a plugin that WAS installed and is now `state: "removed"` is `plugin_removed`
// — a clearer answer than folding both into one generic 404 the way
// `routes/plugins.ts` did.
// ---------------------------------------------------------------------------

type LookupResult =
	| { readonly ok: true; readonly plugin: InstalledPlugin }
	| { readonly ok: false; readonly problems: Problem[] };

async function lookupPlugin(ctx: ActionContext, id: string): Promise<LookupResult> {
	if (id === BUILTIN_PLUGIN_ID) {
		return problem("unknown_plugin", `Plugin "${id}" not found.`, "id");
	}
	const existing = await getInstalledPlugin(ctx.db, id);
	if (existing) return { ok: true, plugin: existing };

	const [row] = await ctx.db
		.select({ state: plugins.state })
		.from(plugins)
		.where(eq(plugins.id, id))
		.limit(1);
	if (row?.state === "removed") {
		return problem("plugin_removed", `Plugin "${id}" was removed.`, "id");
	}
	return problem("unknown_plugin", `Plugin "${id}" not found.`, "id");
}

// ---------------------------------------------------------------------------
// edit_plugin's four change branches.
// ---------------------------------------------------------------------------

function toPluginSource(source: EditPluginSource): PluginSource {
	switch (source.kind) {
		case "folder":
			return { kind: "folder", path: source.path };
		case "git":
			return { kind: "git", url: source.url };
		case "zip":
			return { kind: "zip", path: source.path };
	}
}

async function installRun(
	ctx: ActionContext,
	deps: PlatformActionsDeps,
	source: EditPluginSource,
): Promise<ActionResult<PluginView>> {
	const result = await installPlugin(ctx.db, {
		source: toPluginSource(source),
		scope: source.scope,
		now: ctx.now,
		...(deps.pluginsBaseDir ? { pluginsBaseDir: deps.pluginsBaseDir } : {}),
	});
	if (!result.ok) return problem("install_failed", result.reason);

	const { plugin, skills, agents, subscriptions, scopeKind, scopeId, installTs } = result;

	const agentIds: string[] = [];
	const subscriptionIds: string[] = [];
	const documentSpecs: ContributedDocumentSpec[] = [];

	for (const skill of skills) {
		documentSpecs.push({
			id: skillItemId(plugin.id, skill.dirName, scopeKind, scopeId),
			title: skill.dirName,
			body: skill.body,
			slot: "skill",
			parentKind: null,
			parentId: null,
			scopeKind: scopeKind as ScopeKind,
			scopeId,
		});
	}

	for (const agentSpec of agents) {
		const dbId = agentItemId(plugin.id, agentSpec.id, scopeKind, scopeId);
		agentIds.push(dbId);
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

	for (const subscriptionSpec of subscriptions) {
		const subscriptionDbId = subscriptionItemId(plugin.id, subscriptionSpec.id, scopeKind, scopeId);
		subscriptionIds.push(subscriptionDbId);
		if (subscriptionSpec.prompt) {
			documentSpecs.push({
				id: `ki_rp_${subscriptionDbId}`,
				title: `${subscriptionSpec.name || "Subscription"} — prompt`,
				body: subscriptionSpec.prompt,
				slot: "prompt",
				parentKind: "subscription",
				parentId: subscriptionDbId,
				scopeKind: scopeKind as ScopeKind,
				scopeId,
			});
		}
	}

	// Phase 1 — agents and subscriptions materialize, in ONE transaction.
	// Never a document write in here (top-of-file @lore).
	await ctx.db.transaction(async (tx) => {
		for (const agentSpec of agents) {
			const dbId = agentItemId(plugin.id, agentSpec.id, scopeKind, scopeId);
			await deps.agents.insertIfAbsent(tx, {
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

		for (const subscriptionSpec of subscriptions) {
			const subscriptionDbId = subscriptionItemId(
				plugin.id,
				subscriptionSpec.id,
				scopeKind,
				scopeId,
			);
			const agentDbId = agentItemId(plugin.id, subscriptionSpec.agentId, scopeKind, scopeId);
			await deps.subscriptions.insert(
				tx,
				{
					id: subscriptionDbId,
					userId: agentDbId,
					event: subscriptionSpec.event,
					schedule: subscriptionSpec.schedule,
					createdAt: installTs,
				},
				{ onConflictDoNothing: true },
			);
		}

		await setNonDocumentContributionsLive(deps, tx, { agentIds, subscriptionIds }, true);
	});

	// Phase 2 — after that transaction commits: the plugin's documents,
	// through `editDocument`'s read-then-edit upsert. BEFORE the
	// contribution registry records these ids (Phase 3).
	const installCtx = internalCtx(ctx, installTs);
	await upsertContributedDocuments(installCtx, deps, documentSpecs);

	// Phase 3 — the contribution registry.
	let staleDocumentIds: readonly string[] = [];
	const documentIds = documentSpecs.map((d) => d.id);
	await ctx.db.transaction(async (tx) => {
		for (const [kind, ids] of [
			["agent", agentIds],
			["subscription", subscriptionIds],
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
			if (kind === "subscription") await deps.subscriptions.remove(tx, stale);
			if (kind === "agent") await deps.agents.setStatus(tx, stale, "inactive");
		}
	});

	// Phase 4 — the document half of "forget what's stale".
	if (staleDocumentIds.length > 0) {
		await setContributedDocumentsLive(installCtx, deps, staleDocumentIds, false);
	}

	return { ok: true, data: await assemblePluginView(ctx, deps, plugin.id) };
}

async function stateRun(
	ctx: ActionContext,
	deps: PlatformActionsDeps,
	id: string,
	state: "enabled" | "disabled",
): Promise<ActionResult<PluginView>> {
	const found = await lookupPlugin(ctx, id);
	if (!found.ok) return found;

	if (state === "enabled") await enablePlugin(ctx.db, id, ctx.now);
	else await disablePlugin(ctx.db, id, ctx.now);

	const [agentIds, subscriptionIds, documentIds] = await Promise.all([
		contributedEntityIds(ctx.db, id, "agent"),
		contributedEntityIds(ctx.db, id, "subscription"),
		contributedEntityIds(ctx.db, id, "document"),
	]);
	const live = state === "enabled";
	await ctx.db.transaction(async (tx) => {
		await setNonDocumentContributionsLive(deps, tx, { agentIds, subscriptionIds }, live);
	});
	await setContributedDocumentsLive(internalCtx(ctx), deps, documentIds, live);

	return { ok: true, data: await assemblePluginView(ctx, deps, id) };
}

async function removeRun(
	ctx: ActionContext,
	deps: PlatformActionsDeps,
	id: string,
): Promise<ActionResult<PluginView>> {
	const found = await lookupPlugin(ctx, id);
	if (!found.ok) return found;

	// The pre-remove state — `state: "removed"` is not a member of
	// `PluginListState`, so there is no valid view to build AFTER removing;
	// the answer is the row as it stood the moment asked, the same idiom
	// `stop_session` uses for its pre-stop row.
	const preView = await assemblePluginView(ctx, deps, id);

	await removePlugin(ctx.db, id, ctx.now);

	const [agentIds, subscriptionIds, documentIds] = await Promise.all([
		contributedEntityIds(ctx.db, id, "agent"),
		contributedEntityIds(ctx.db, id, "subscription"),
		contributedEntityIds(ctx.db, id, "document"),
	]);
	await ctx.db.transaction(async (tx) => {
		await setNonDocumentContributionsLive(deps, tx, { agentIds, subscriptionIds }, false);
		await deps.subscriptions.remove(tx, subscriptionIds);
	});
	await setContributedDocumentsLive(internalCtx(ctx), deps, documentIds, false);

	return { ok: true, data: preView };
}

async function restoreRun(
	ctx: ActionContext,
	deps: PlatformActionsDeps,
	id: string,
	contributionKey: string,
): Promise<ActionResult<PluginView>> {
	const found = await lookupPlugin(ctx, id);
	if (!found.ok) return found;
	const existing = found.plugin;

	const owned = await listContributions(ctx.db, id);
	const registryMatch = owned.find((c) => c.entityId === contributionKey);
	if (registryMatch) {
		if (registryMatch.kind !== "document") {
			await clearDetached(ctx.db, { kind: registryMatch.kind, entityId: contributionKey });
			return { ok: true, data: await assemblePluginView(ctx, deps, id) };
		}
		if (!existing.installPath) {
			return problem(
				"no_install_path",
				"This plugin has no recorded install path — it was installed before restore was " +
					"supported, or on a server not configured with a plugins directory. Reinstall the " +
					"plugin to enable restore.",
			);
		}
		const sourceBody = readPluginDocumentSource(
			existing.installPath,
			id,
			contributionKey,
			existing.scope.kind,
			existing.scope.teamId,
		);
		if (sourceBody === null) {
			return problem(
				"source_not_found",
				`Source for "${contributionKey}" not found under ${existing.installPath}. The plugin ` +
					"install may be corrupted.",
			);
		}
		const editResult = await deps.editDocument(internalCtx(ctx), {
			id: contributionKey,
			body: sourceBody,
		});
		if (!editResult.ok) {
			return problem("restore_failed", editResult.problems.map((p) => p.message).join("; "));
		}
		await clearDetached(ctx.db, { kind: "document", entityId: contributionKey });
		return { ok: true, data: await assemblePluginView(ctx, deps, id) };
	}

	const configItem = (await listConfiguration(ctx.db)).find((item) => item.key === contributionKey);
	if (!configItem) {
		return problem(
			"unknown_contribution",
			`Plugin "${id}" did not contribute "${contributionKey}".`,
		);
	}
	await restorePluginContribution(ctx.db, {
		pluginId: id,
		manifestKey: manifestKeyOf(configItem.key),
		kind: configItem.kind,
	});
	return { ok: true, data: await assemblePluginView(ctx, deps, id) };
}

// ---------------------------------------------------------------------------
// search_plugins — installed plugins only (founder ruling: nothing
// packages `plugins/` into the desktop bundle, so there is no
// "bundled but not installed" set to list here).
// ---------------------------------------------------------------------------

function matchesSearchFilter(p: InstalledPlugin, input: SearchPluginsInput): boolean {
	if (input.ids && !input.ids.includes(p.id)) return false;
	if (input.state && p.state !== input.state) return false;
	if (input.text) {
		const needle = input.text.toLowerCase();
		if (!(p.id.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)))
			return false;
	}
	return true;
}

export function createPlatformActions(deps: PlatformActionsDeps): readonly Action[] {
	async function searchPluginsRun(
		ctx: ActionContext,
		input: SearchPluginsInput,
	): Promise<ActionResult<PluginView[]>> {
		const installed = await listInstalledPlugins(ctx.db);
		const filtered = installed.filter((p) => matchesSearchFilter(p, input));
		if (filtered.length === 0) return { ok: true, data: [] };

		const allItems = await listConfiguration(ctx.db);
		const itemsByPlugin = new Map<string, ConfigurationItemForPlugin[]>();
		for (const item of allItems) {
			const pid = item.origin.pluginId;
			if (!pid) continue;
			const forPlugin = itemsByPlugin.get(pid) ?? [];
			forPlugin.push({ kind: item.kind, key: item.key, valueSource: item.valueSource });
			itemsByPlugin.set(pid, forPlugin);
		}

		const data: PluginView[] = [];
		for (const p of filtered) {
			const contributions = await pluginContributionsView(
				ctx,
				deps,
				p.id,
				itemsByPlugin.get(p.id) ?? [],
			);
			data.push(toPluginView(p, contributions));
		}
		return { ok: true, data };
	}

	async function editPluginRun(
		ctx: ActionContext,
		input: EditPluginInput,
	): Promise<ActionResult<PluginView>> {
		const pureProblems = editPluginInvariants(input);
		if (pureProblems.length > 0) return { ok: false, problems: pureProblems };

		if (input.source) return installRun(ctx, deps, input.source);

		// `editPluginInvariants`'s `plugin_id_required` already guarantees `id`
		// is present for every branch below.
		const id = input.id;
		if (id === undefined) {
			throw new Error("edit_plugin: editPluginInvariants guarantees id for state/remove/restore");
		}
		if (input.state !== undefined) return stateRun(ctx, deps, id, input.state);
		if (input.remove === true) return removeRun(ctx, deps, id);
		if (input.restore) return restoreRun(ctx, deps, id, input.restore.contribution);

		throw new Error(
			"edit_plugin: editPluginInvariants guarantees one of source/state/remove/restore",
		);
	}

	return [
		{ declaration: searchPluginsDeclaration, run: searchPluginsRun } as Action,
		{ declaration: editPluginDeclaration, run: editPluginRun } as Action,
	];
}
