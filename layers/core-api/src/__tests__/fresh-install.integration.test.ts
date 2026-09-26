/**
 * A fresh install, end to end, through the actions the app and its agents
 * call.
 *
 * Boot writes only the hidden system actor. The welcome screen's two calls
 * leave the person, their team and one agent — their assistant, owned, on the
 * picked harness, with one empty subscription per object event — and nothing
 * else: no prompt documents, no documents, tasks or threads. A message to the
 * assistant starts one piece of work, not one per subscription. Every opinion
 * after that arrives from a plugin: the plugins that ship inside the app are
 * listed as available, a team installs one by name and its agents land on
 * that team on the first ready harness, a second team installs the same
 * plugin independently, and the librarian's plugin installs once for
 * everyone with its agent on no team.
 *
 * People, messages, tasks and agents go through the fixture `app`, whose
 * subscription fire mechanism is the one production registers. The plugin
 * actions go through the layer's own `buildCoreActions` with the production
 * bindings plus the two inputs the fixture app has no slot for: the repo's
 * own `plugins/` as the bundled folder, and the machine's harnesses — the one
 * stand-in, a reader answering a single ready descriptor. Both share the
 * fixture's database and event bus, so a plugin's agents are the same rows
 * the app reads back.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type AgentOrchestrationPort,
	CORE_API_ACTOR_OVERRIDE_HEADER,
} from "@hyperidle/api-contract";
import {
	agentWorkIntents,
	documents,
	type HyperIdleDb,
	plugins,
	subscriptions,
	tasks,
	threads,
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
import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import type { Hono } from "hono";
import { afterEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import type { ActionContext } from "../actions/action.js";
import { buildCoreActions } from "../actions/compose.js";
import { applyFactoryCoreState } from "../bootstrap/factory-state.js";
import type { HarnessCapabilityReader } from "../services/harness-capability-reader.js";

const BUNDLED = fileURLToPath(new URL("../../../../plugins", import.meta.url));

const READY: HarnessCapabilityDescriptor = {
	type: "claude-code",
	name: "Claude Code",
	kind: "local",
	authAction: { kind: "none", label: "Ready" },
	discovery: { state: "ready" },
	models: [
		{ id: "claude-sonnet", label: "Sonnet", provider: "anthropic", selectable: true, options: [] },
	],
	modelProviders: ["anthropic"],
};

const machineHarnesses: HarnessCapabilityReader = {
	size: 1,
	describe: () => [READY],
	refresh: async () => {},
};

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
	readonly problems?: unknown;
}

/** Call an action through the app; without an actor the auth layer resolves the person, as the desktop app does. */
async function call<T>(
	app: Hono,
	name: string,
	body: Record<string, unknown>,
	actor?: string,
): Promise<T> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(actor ? { [CORE_API_ACTOR_OVERRIDE_HEADER]: actor } : {}),
		},
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

function pluginActions(
	agentOrchestration: AgentOrchestrationPort,
	db: HyperIdleDb,
	eventBus: EventBus,
): PluginActions {
	const pluginsBaseDir = join(
		tmpdir(),
		`fresh-install-plugins-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(pluginsBaseDir, { recursive: true });
	baseDirs.push(pluginsBaseDir);
	const actions = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
		pluginsBaseDir,
		bundledPluginsDir: BUNDLED,
		adapterPool: machineHarnesses,
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

function bundled(name: string, teamId: string | null): Record<string, unknown> {
	return {
		source: {
			kind: "bundled",
			name,
			scope: teamId ? { kind: "team", teamId } : { kind: "factory", teamId: null },
		},
	};
}

describe("a fresh install, end to end", () => {
	test("the welcome screen leaves one assistant; plugins bring every other agent, per team", async ({
		db,
		app,
		eventBus,
		agentOrchestration,
	}) => {
		await applyFactoryCoreState(db);
		const { search, edit, pluginsBaseDir } = pluginActions(agentOrchestration, db, eventBus);

		// The welcome screen's two calls.
		const ada = await call<UserView>(app, "edit_user", {
			kind: "human",
			name: "Ada",
			team: { name: "Ada's Team" },
		});
		const adaId = ada.user?.id ?? "";
		const teamA = ada.user?.team?.id ?? "";
		expect(adaId).not.toBe("");
		expect(teamA).not.toBe("");
		await call<UserView>(app, "edit_user", {
			kind: "ai",
			name: "Ada's Assistant",
			role: "assistant",
			agentCategory: "individual",
			ownerUserId: adaId,
			runConfig: { harnessType: "claude-code" },
			subscriptions: { add: OBJECT_EVENTS.map((event) => ({ event })) },
		});

		// One agent: the person's assistant, on the picked harness, nine empty subscriptions.
		const agents = await call<UserRow[]>(app, "search_users", { kind: "ai" });
		expect(agents).toHaveLength(1);
		const assistantId = agents[0]?.id ?? "";
		expect(agents[0]?.ownerUserId).toBe(adaId);
		const assistant = await call<UserView>(app, "open_user", { id: assistantId });
		expect(assistant.runConfig?.harnessType).toBe("claude-code");
		expect(assistant.subscriptions.map((s) => s.event).sort()).toEqual([...OBJECT_EVENTS].sort());
		expect(assistant.subscriptions.every((s) => s.documentId === null && !s.paused)).toBe(true);
		expect(assistant.documentIds).toEqual([]);
		expect(await db.select().from(subscriptions)).toHaveLength(OBJECT_EVENTS.length);

		// Empty lists: no prompt documents, no documents, tasks or threads.
		expect(await db.select().from(documents)).toEqual([]);
		expect(await db.select().from(tasks)).toEqual([]);
		expect(await db.select().from(threads)).toEqual([]);

		// A message to the assistant starts its thread turn and nothing else.
		// The subscription-wake rule only counts a change strictly after the
		// subscription's own `createdAt` — spin until the clock ticks past the
		// millisecond the subscribe-on-create call above landed in, a real
		// (deterministic) tick rather than a guessed sleep duration.
		const beforeMessageMs = Date.now();
		while (Date.now() === beforeMessageMs) {
			// intentionally empty: waiting for Date.now() to advance
		}
		await call(app, "send_message", { recipients: [assistantId], text: "Hello" });
		await vi.waitFor(async () => {
			const afterMessage = await db.select().from(agentWorkIntents);
			expect(afterMessage.map((i) => i.kind)).toEqual(["thread_turn"]);
		});

		// The subscriptions are live: a change the assistant did not start does wake it.
		await call(app, "edit_task", { teamId: teamA, title: "Plan the week" }, adaId);
		await vi.waitFor(async () => {
			const afterTask = await db.select().from(agentWorkIntents);
			expect(afterTask.some((i) => i.kind === "subscription_run")).toBe(true);
		});

		// A second person on a second team.
		const bo = await call<UserView>(app, "edit_user", {
			kind: "human",
			name: "Bo",
			team: { name: "Bo's Team" },
		});
		const boId = bo.user?.id ?? "";
		const teamB = bo.user?.team?.id ?? "";
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
			expect(opened.runConfig?.harnessType, agent.name).toBe("claude-code");
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
		expect(availableIn(await search(adaId))).toContain("role-personas");
		expect(availableIn(await search(boId))).not.toContain("role-personas");

		// document-management installs once, for everyone; its librarian has no team.
		const factory = await installed(edit(adaId, bundled("document-management", null)));
		expect(factory.id).toBe("document-management");
		for (const viewer of [adaId, boId]) {
			const listing = await search(viewer);
			expect(installsIn(listing), viewer).toContain("document-management");
			expect(availableIn(listing), viewer).not.toContain("document-management");
		}
		const librarians = await call<UserRow[]>(app, "search_users", {
			kind: "ai",
			name: "Document Librarian",
		});
		expect(librarians).toHaveLength(1);
		expect(librarians[0]?.status).toBe("active");
		expect(librarians[0]?.team).toBeNull();
		const librarian = await call<UserView>(app, "open_user", { id: librarians[0]?.id });
		expect(librarian.runConfig?.harnessType).toBe("claude-code");
	});
});
