/**
 * A fresh install, end to end, through the actions the app and its agents
 * call.
 *
 * Boot writes only the hidden system actor. Two calls — a person, and their own assistant —
 * leave the person, their team and one agent — their assistant, owned, on the
 * picked harness, with one empty subscription per object event — and nothing
 * else: no prompt documents, no documents, tasks or threads. A message to the
 * assistant starts one piece of work, not one per subscription. Every opinion
 * after that arrives from a plugin: the plugins that ship inside the app are
 * listed as available, a team installs one by name and its agents land on
 * that team on the first ready harness, a second team installs the same
 * plugin independently, and a team installs the librarian plugin whose
 * agent lands on that team.
 *
 * People, messages, tasks and agents go through the fixture `app`, whose
 * subscription fire mechanism is the one production registers. The plugin
 * actions go through the layer's own `buildCoreActions` with the production
 * bindings plus the two inputs the fixture app has no slot for: the repo's
 * own `plugins/` as the bundled folder, and the machine's harnesses — the one
 * stand-in, a reader answering a single ready descriptor. Both share the
 * fixture's database and event bus, so a plugin's agents are the same rows
 * the app reads back. All plugins install with team scope — factory scope
 * no longer exists.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	changes,
	documents,
	type HyperIdleDb,
	inbox,
	messages,
	plugins,
	subscriptions,
	tasks,
	threads,
	users,
	userTeams,
} from "@hyperidle/db";
import {
	type ActionResult,
	OBJECT_EVENTS,
	type PluginListing,
	type PluginView,
	type UserRow,
	type UserView,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { listInboxRows } from "@hyperidle/user";
import { eq, or } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import type { ActionContext } from "../actions/action.js";
import { buildCoreActions } from "../actions/compose.js";
import { applyFactoryCoreState } from "../bootstrap/factory-state.js";

const BUNDLED = fileURLToPath(new URL("../../../../plugins", import.meta.url));

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
	readonly problems?: unknown;
}

/** Call an action through the app; the auth layer resolves the person, as the desktop app does. */
async function call<T>(app: Hono, name: string, body: Record<string, unknown>): Promise<T> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const envelope = (await res.json()) as ActionEnvelope<T>;
	if (res.status !== 200 || !envelope.ok) {
		throw new Error(`${name} failed (${res.status}): ${JSON.stringify(envelope)}`);
	}
	return envelope.data as T;
}

const baseDirs: string[] = [];
afterEach(() => {
	for (const dir of baseDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface PluginActions {
	readonly pluginsBaseDir: string;
	search(actor: string, input?: Record<string, unknown>): Promise<PluginListing[]>;
	edit(actor: string, input: Record<string, unknown>): Promise<ActionResult<PluginView>>;
}

function pluginActions(db: HyperIdleDb, eventBus: EventBus): PluginActions {
	const pluginsBaseDir = join(
		tmpdir(),
		`fresh-install-plugins-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(pluginsBaseDir, { recursive: true });
	baseDirs.push(pluginsBaseDir);
	const actions = buildCoreActions({
		pluginsBaseDir,
		bundledPluginsDir: BUNDLED,
	});
	const run = (name: string) => {
		const found = actions.find((a) => a.declaration.name === name);
		if (!found) throw new Error(`no ${name}`);
		return found.run;
	};
	const ctx = (actor: string): ActionContext => ({
		actor,
		db,
		eventBus,
		now: new Date().toISOString(),
	});
	return {
		pluginsBaseDir,
		search: async (actor, input = {}) => {
			const result = (await run("search_plugins")(ctx(actor), input)) as ActionResult<
				PluginListing[]
			>;
			if (!result.ok) throw new Error(`search_plugins: ${JSON.stringify(result.problems)}`);
			return result.data;
		},
		edit: async (actor, input) =>
			(await run("edit_plugin")(ctx(actor), input)) as ActionResult<PluginView>,
	};
}

async function installed(result: Promise<ActionResult<PluginView>>): Promise<PluginView> {
	const done = await result;
	if (!done.ok) throw new Error(`edit_plugin: ${JSON.stringify(done.problems)}`);
	return done.data;
}

function availableIn(listing: readonly PluginListing[]): string[] {
	return listing
		.filter((p) => p.state === "available")
		.map((p) => p.id)
		.sort();
}

function installsIn(listing: readonly PluginListing[]): string[] {
	return listing
		.filter((p) => p.state !== "available")
		.map((p) => p.id)
		.sort();
}

function bundled(name: string, teamId: string): Record<string, unknown> {
	return {
		source: {
			kind: "bundled",
			name,
			scope: { kind: "team", teamId },
		},
	};
}

describe("a fresh install, end to end", () => {
	test("a person and their assistant leave one agent; plugins bring every other agent, per team", async ({
		db,
		app,
		eventBus,
		asPerson,
	}) => {
		await applyFactoryCoreState(db);
		const { search, edit, pluginsBaseDir } = pluginActions(db, eventBus);

		// A person, and their own assistant.
		// First start makes the person in-process as nobody (`routes/start.ts`); the HTTP door refuses nobody.
		const bootstrapEditUser = buildCoreActions({}).find((a) => a.declaration.name === "edit_user");
		if (!bootstrapEditUser) throw new Error("edit_user not found");
		const adaResult = await bootstrapEditUser.run(
			{ actor: "", db, eventBus, now: new Date().toISOString() },
			{ kind: "human", name: "Ada", teams: ["Ada's Team"] },
		);
		if (!adaResult.ok) throw new Error(`edit_user failed: ${JSON.stringify(adaResult)}`);
		const ada = adaResult.data as UserView;
		const adaId = ada.user?.id ?? "";
		const teamA = (ada.user?.teams.find((t) => !t.isGlobal) ?? ada.user?.teams[0])?.id ?? "";
		expect(adaId).not.toBe("");
		expect(teamA).not.toBe("");
		await asPerson(adaId);

		await call<UserView>(app, "edit_user", {
			kind: "ai",
			name: "Ada's Assistant",
			role: "assistant",
			agentCategory: "individual",
			ownerUserId: adaId,
			teams: ["Ada's Team"],
			subscriptions: { add: OBJECT_EVENTS.map((event) => ({ event })) },
		});

		// One agent: the person's assistant, on the picked harness, nine empty subscriptions.
		const agents = await call<UserRow[]>(app, "search_users", { kind: "ai" });
		expect(agents).toHaveLength(1);
		const assistantId = agents[0]?.id ?? "";
		expect(agents[0]?.ownerUserId).toBe(adaId);
		const assistant = await call<UserView>(app, "open_user", { id: assistantId });
		expect(assistant.subscriptions.map((s) => s.event).sort()).toEqual([...OBJECT_EVENTS].sort());
		expect(assistant.subscriptions.every((s) => s.documentId === null && !s.paused)).toBe(true);
		expect(assistant.documentIds).toEqual([]);
		expect(
			(await db.select().from(subscriptions)).filter((r) => r.userId === assistantId),
		).toHaveLength(OBJECT_EVENTS.length);

		// Empty lists: no prompt documents, no documents, tasks or threads.
		expect(await db.select().from(documents)).toEqual([]);
		expect(await db.select().from(tasks)).toEqual([]);
		expect(await db.select().from(threads)).toEqual([]);

		// A message to the assistant starts its thread turn and nothing else.
		// A subscription only counts a change strictly after the
		// subscription's own `createdAt` — spin until the clock ticks past the
		// millisecond the subscribe-on-create call above landed in, a real
		// (deterministic) tick rather than a guessed sleep duration.
		const beforeMessageMs = Date.now();
		while (Date.now() === beforeMessageMs) {
			// intentionally empty: waiting for Date.now() to advance
		}
		// The assistant's own thread.created/thread.message subscriptions ALSO
		// match the very thread its direct wake just fired on (it can read its
		// own DM) — a real duplicate that lands after the first intent is seen
		// would otherwise go unnoticed. A DM only its two members can read, and
		// a 2-member thread auto-wakes its other party directly (never via a
		// subscription), so the sentinel needs its OWN 3-member thread, where
		// nobody is auto-woken and only its subscription reaches it.
		await db.insert(users).values({
			id: "sentinel-once-install",
			kind: "ai",
			name: "Sentinel",
			role: "assistant",
			status: "active",
			agentCategory: "individual",
			ownerUserId: adaId,
			createdAt: new Date().toISOString(),
		});
		await db.insert(userTeams).values({ userId: "sentinel-once-install", teamId: teamA });
		await db.insert(subscriptions).values({
			id: "sub-sentinel-once-install",
			userId: "sentinel-once-install",
			event: "thread.message",
			schedule: null,
			paused: false,
			nextRunAt: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		await db.insert(users).values({
			id: "third-party-once-install",
			kind: "human",
			name: "Third party",
			role: "member",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		await db.insert(userTeams).values({ userId: "third-party-once-install", teamId: teamA });
		const sentinelThreadId = "sentinel-thread-once-install";
		await db.insert(threads).values({
			id: sentinelThreadId,
			hostKind: "user",
			hostId: adaId,
			initiatorId: adaId,
			participants: JSON.stringify([adaId, "sentinel-once-install", "third-party-once-install"]),
			lastActiveAt: new Date().toISOString(),
			createdAt: new Date().toISOString(),
		});

		await call(app, "send_message", { recipients: [assistantId], text: "Hello" });
		await call(app, "send_message", { threadId: sentinelThreadId, text: "sentinel ping" });

		await vi.waitFor(async () => {
			const sentinelRows = await listInboxRows(db, { userId: "sentinel-once-install" });
			expect(sentinelRows.map((r) => r.reason)).toEqual(["subscription"]);
		});
		const assistantRows = await listInboxRows(db, { userId: assistantId });
		expect(assistantRows.map((r) => r.reason)).toEqual(["message"]);

		// The sentinel was scaffolding for the completion signal above, not a
		// fixture this end-to-end test's later agent-count assertions expect —
		// remove it and everything it touched, FK-dependent rows first.
		await db.delete(inbox).where(eq(inbox.userId, "sentinel-once-install"));
		await db.delete(messages).where(eq(messages.threadId, sentinelThreadId));
		await db.delete(changes).where(eq(changes.objectId, sentinelThreadId));
		await db.delete(threads).where(eq(threads.id, sentinelThreadId));
		await db.delete(subscriptions).where(eq(subscriptions.id, "sub-sentinel-once-install"));
		await db
			.delete(users)
			.where(or(eq(users.id, "sentinel-once-install"), eq(users.id, "third-party-once-install")));

		// The subscriptions are live: a change the assistant did not start does wake it.
		await call(app, "edit_task", { teamId: teamA, title: "Plan the week" });
		await vi.waitFor(async () => {
			const afterTask = await listInboxRows(db, { userId: assistantId });
			expect(afterTask.some((r) => r.reason === "subscription")).toBe(true);
		});

		// A second person on a second team.
		const bo = await call<UserView>(app, "edit_user", {
			kind: "human",
			name: "Bo",
			teams: ["Bo's Team"],
		});
		const boId = bo.user?.id ?? "";
		const teamB = (bo.user?.teams.find((t) => !t.isGlobal) ?? bo.user?.teams[0])?.id ?? "";
		expect(teamB).not.toBe("");
		expect(teamB).not.toBe(teamA);

		// Both bundled plugins are available to both people.
		expect(availableIn(await search(adaId))).toEqual(["document-management", "role-personas"]);
		expect(availableIn(await search(boId))).toEqual(["document-management", "role-personas"]);

		// Team A installs role-personas by name; team B still sees it available.
		const installA = await installed(edit(adaId, bundled("role-personas", teamA)));
		expect(installA.id).toBe(`role-personas@${teamA}`);
		expect(availableIn(await search(adaId))).toEqual(["document-management"]);
		expect(availableIn(await search(boId))).toEqual(["document-management", "role-personas"]);

		const installB = await installed(edit(boId, bundled("role-personas", teamB)));
		expect(installB.id).toBe(`role-personas@${teamB}`);

		// Fourteen agents, seven per team, each on the ready harness.
		const teamAgents = async (teamId: string) =>
			(await call<UserRow[]>(app, "search_users", { kind: "ai", teamId, status: "active" })).filter(
				(a) => a.id !== assistantId,
			);
		const onA = await teamAgents(teamA);
		const onB = await teamAgents(teamB);
		expect(onA).toHaveLength(7);
		expect(onB).toHaveLength(7);
		const everyAgent = await call<UserRow[]>(app, "search_users", { kind: "ai", status: "active" });
		expect(everyAgent.filter((a) => a.id !== assistantId)).toHaveLength(14);
		for (const agent of [...onA, ...onB]) {
			const opened = await call<UserView>(app, "open_user", { id: agent.id });
			expect(opened.user?.id, agent.name).toBe(agent.id);
		}

		// Two rows, two install folders.
		const rows = await db.select().from(plugins);
		expect(
			rows
				.filter((r) => r.name === "role-personas")
				.map((r) => `${r.id} ${r.state}`)
				.sort(),
		).toEqual([`role-personas@${teamA} enabled`, `role-personas@${teamB} enabled`].sort());
		expect(existsSync(join(pluginsBaseDir, `role-personas@${teamA}`, "plugin.json"))).toBe(true);
		expect(existsSync(join(pluginsBaseDir, `role-personas@${teamB}`, "plugin.json"))).toBe(true);

		// A name that is not one of the bundled plugins is refused, never read as a path.
		const outside = await edit(adaId, bundled("../role-personas", teamA));
		expect(outside.ok).toBe(false);
		if (!outside.ok) expect(outside.problems[0]?.code).toBe("install_failed");

		// Removing team A's install leaves team B's.
		await installed(edit(adaId, { id: `role-personas@${teamA}`, remove: true }));
		expect(await teamAgents(teamA)).toHaveLength(0);
		expect(await teamAgents(teamB)).toHaveLength(7);
		expect(installsIn(await search(boId, { state: "enabled" }))).toEqual([
			`role-personas@${teamB}`,
		]);
		// Both see role-personas available: Ada's team (global) no longer has it;
		// Bo's own team has it installed but the global team is now in viewerTeamIds
		// and doesn't have it — so it's available to install on the global team.
		expect(availableIn(await search(adaId))).toContain("role-personas");
		expect(availableIn(await search(boId))).toContain("role-personas");

		// Ada's team installs document-management; its librarian lands on that team.
		const dmInstall = await installed(edit(adaId, bundled("document-management", teamA)));
		expect(dmInstall.id).toBe(`document-management@${teamA}`);
		// Ada sees it as installed; Bo still sees it as available (Bo's team hasn't installed it).
		expect(installsIn(await search(adaId))).toContain(`document-management@${teamA}`);
		expect(availableIn(await search(boId))).toContain("document-management");
		const librarians = await call<UserRow[]>(app, "search_users", {
			kind: "ai",
			name: "Document Librarian",
		});
		expect(librarians).toHaveLength(1);
		expect(librarians[0]?.status).toBe("active");
		expect(librarians[0]?.teams[0]?.id).toBe(teamA);
		const librarian = await call<UserView>(app, "open_user", { id: librarians[0]?.id });
		expect(librarian.user?.id).toBe(librarians[0]?.id);
	});
});
