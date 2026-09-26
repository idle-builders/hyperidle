/**
 * The plugins that ship inside the app: `search_plugins` lists the ones a
 * viewer's team has not installed as available, and `edit_plugin` installs
 * one by name — per team, independently, its agents runnable at once.
 *
 * Built through the layer's own `buildCoreActions`, so the bindings under
 * test are the production ones: the viewer's team (own, else the owner's),
 * the first ready harness off the adapter pool, and the orchestration
 * run-config port the harness is written through. The adapter pool is the
 * one stand-in — a reader answering two descriptors, the first not ready.
 * The bundled folder is the repo's own `plugins/`.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { type HyperIdleDb, plugins, teams, users } from "@hyperidle/db";
import type {
	ActionResult,
	AvailablePluginView,
	EditPluginInput,
	PluginListing,
	PluginView,
	SearchPluginsInput,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { agentItemId } from "@hyperidle/settings";
import { and, eq, like } from "drizzle-orm";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import type { ActionContext } from "../../actions/action.js";
import { buildCoreActions } from "../../actions/compose.js";
import type { HarnessCapabilityReader } from "../../services/harness-capability-reader.js";

const NOW = "2026-09-25T00:00:00.000Z";
const BUNDLED = resolve("plugins");

const MISSING: HarnessCapabilityDescriptor = {
	type: "codex",
	name: "Codex",
	kind: "local",
	authAction: { kind: "native_cli_login", label: "Log in" },
	discovery: { state: "missing" },
	models: [],
	modelProviders: ["openai"],
};

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

const pool: HarnessCapabilityReader = {
	size: 2,
	describe: () => [MISSING, READY],
	refresh: async () => {},
};

const baseDirs: string[] = [];
afterEach(() => {
	for (const dir of baseDirs) rmSync(dir, { recursive: true, force: true });
	baseDirs.length = 0;
});

type Listing = PluginListing;

interface Harness {
	readonly pluginsBaseDir: string;
	search(actor: string, input?: SearchPluginsInput): Promise<Listing[]>;
	edit(actor: string, input: EditPluginInput): Promise<ActionResult<PluginView>>;
}

function actionsFor(
	agentOrchestration: AgentOrchestrationPort,
	db: HyperIdleDb,
	eventBus: EventBus,
): Harness {
	const pluginsBaseDir = join(
		tmpdir(),
		`installed-plugins-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(pluginsBaseDir, { recursive: true });
	baseDirs.push(pluginsBaseDir);
	const actions = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
		pluginsBaseDir,
		bundledPluginsDir: BUNDLED,
		adapterPool: pool,
	});
	const run = (name: string) => {
		const found = actions.find((a) => a.declaration.name === name);
		if (!found) throw new Error(`no ${name}`);
		return found.run;
	};
	const ctx = (actor: string): ActionContext => ({ actor, db, eventBus, now: NOW });
	return {
		pluginsBaseDir,
		search: async (actor, input = {}) => {
			const result = (await run("search_plugins")(ctx(actor), input)) as ActionResult<Listing[]>;
			if (!result.ok) throw new Error(`search_plugins: ${JSON.stringify(result.problems)}`);
			return result.data;
		},
		edit: async (actor, input) =>
			(await run("edit_plugin")(ctx(actor), input)) as ActionResult<PluginView>,
	};
}

/** Two teams, a person in each, and a person-owned agent with no team of its own. */
async function seedPeople(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values([
		{ id: "team-a", name: "Team A", createdAt: NOW },
		{ id: "team-b", name: "Team B", createdAt: NOW },
	]);
	await db.insert(users).values([
		{
			id: "u-ada",
			kind: "human",
			name: "Ada",
			role: "founder",
			status: "active",
			teamId: "team-a",
			createdAt: NOW,
		},
		{
			id: "u-bo",
			kind: "human",
			name: "Bo",
			role: "founder",
			status: "active",
			teamId: "team-b",
			createdAt: NOW,
		},
		{
			id: "u-ada-assistant",
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			ownerUserId: "u-ada",
			createdAt: NOW,
		},
		{
			id: "u-loner",
			kind: "ai",
			name: "Loner",
			role: "assistant",
			status: "active",
			createdAt: NOW,
		},
	]);
}

function available(listing: readonly Listing[]): string[] {
	return listing
		.filter((p) => p.state === "available")
		.map((p) => p.id)
		.sort();
}

function installed(listing: readonly Listing[]): string[] {
	return listing
		.filter((p) => p.state !== "available")
		.map((p) => p.id)
		.sort();
}

function teamInstall(name: string, teamId: string): EditPluginInput {
	return { source: { kind: "bundled", name, scope: { kind: "team", teamId } } };
}

async function pluginAgents(db: HyperIdleDb, teamId: string | null) {
	const rows = await db.select().from(users).where(like(users.id, "pa_%"));
	return rows.filter((r) => r.teamId === teamId);
}

describe("bundled plugins — listed as available per viewer", () => {
	test("a person sees both bundled plugins available, each with its install scope", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { search } = actionsFor(agentOrchestration, db, eventBus);

		const listing = await search("u-ada");
		expect(available(listing)).toEqual(["document-management", "role-personas"]);
		const byId = new Map(listing.map((p) => [p.id, p]));
		const rolePersonas = byId.get("role-personas") as AvailablePluginView;
		expect(rolePersonas.installScope).toBe("team");
		expect(rolePersonas.description).toContain("builder");
		expect((byId.get("document-management") as AvailablePluginView).installScope).toBe("factory");

		const onlyAvailable = await search("u-ada", { state: "available", text: "role" });
		expect(onlyAvailable.map((p) => p.id)).toEqual(["role-personas"]);
		expect(await search("u-ada", { state: "enabled" })).toEqual([]);
	});

	test("an owned agent judges availability by its owner's team; a no-team viewer only by factory", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { search, edit } = actionsFor(agentOrchestration, db, eventBus);
		expect(available(await search("u-ada-assistant"))).toEqual([
			"document-management",
			"role-personas",
		]);
		const done = await edit("u-ada", teamInstall("role-personas", "team-a"));
		if (!done.ok) throw new Error(JSON.stringify(done.problems));

		expect(available(await search("u-ada-assistant"))).toEqual(["document-management"]);
		expect(available(await search("u-bo"))).toEqual(["document-management", "role-personas"]);
		expect(available(await search("u-loner"))).toEqual(["document-management"]);
		// Installed rows are everyone's to see; the row's scope says whose.
		expect(installed(await search("u-bo"))).toEqual(["role-personas@team-a"]);
	});
});

describe("bundled plugins — install by name, per team", () => {
	test("a team install lands seven active agents on that team, each on the first ready harness", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { edit, pluginsBaseDir } = actionsFor(agentOrchestration, db, eventBus);

		const result = await edit("u-ada", teamInstall("role-personas", "team-a"));
		if (!result.ok) throw new Error(JSON.stringify(result.problems));
		expect(result.data.id).toBe("role-personas@team-a");
		expect(result.data.name).toBe("role-personas");
		expect(result.data.scope).toEqual({ kind: "team", teamId: "team-a" });
		expect(existsSync(join(pluginsBaseDir, "role-personas@team-a", "plugin.json"))).toBe(true);
		expect(existsSync(join(BUNDLED, "role-personas", "plugin.json"))).toBe(true);

		const agents = await pluginAgents(db, "team-a");
		expect(agents).toHaveLength(7);
		for (const agent of agents) {
			expect(agent.status).toBe("active");
			const runConfig = await agentOrchestration.runConfig.read(agent.id);
			expect(runConfig.harnessType, agent.name).toBe("claude-code");
			expect(runConfig.modelId, agent.name).toBe("claude-sonnet");
		}
	});

	test("a reinstall never overwrites a harness a person chose since", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { edit } = actionsFor(agentOrchestration, db, eventBus);
		await edit("u-ada", teamInstall("role-personas", "team-a"));
		const builder = agentItemId("role-personas", "builder", "team", "team-a");
		await agentOrchestration.runConfig.write(builder, { harnessType: "opencode", modelId: null });

		const again = await edit("u-ada", teamInstall("role-personas", "team-a"));
		if (!again.ok) throw new Error(JSON.stringify(again.problems));
		expect((await agentOrchestration.runConfig.read(builder)).harnessType).toBe("opencode");
	});

	test("two teams install independently; removing one leaves the other", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { search, edit, pluginsBaseDir } = actionsFor(agentOrchestration, db, eventBus);

		await edit("u-ada", teamInstall("role-personas", "team-a"));
		expect(available(await search("u-bo"))).toContain("role-personas");
		const second = await edit("u-bo", teamInstall("role-personas", "team-b"));
		if (!second.ok) throw new Error(JSON.stringify(second.problems));

		expect(await pluginAgents(db, "team-a")).toHaveLength(7);
		expect(await pluginAgents(db, "team-b")).toHaveLength(7);
		const rows = await db.select().from(plugins).where(eq(plugins.name, "role-personas"));
		expect(rows.map((r) => [r.id, r.state]).sort()).toEqual([
			["role-personas@team-a", "enabled"],
			["role-personas@team-b", "enabled"],
		]);
		expect(existsSync(join(pluginsBaseDir, "role-personas@team-a"))).toBe(true);
		expect(existsSync(join(pluginsBaseDir, "role-personas@team-b"))).toBe(true);

		const removed = await edit("u-ada", { id: "role-personas@team-a", remove: true });
		if (!removed.ok) throw new Error(JSON.stringify(removed.problems));

		const teamA = await pluginAgents(db, "team-a");
		const teamB = await pluginAgents(db, "team-b");
		expect(teamA.every((a) => a.status === "inactive")).toBe(true);
		expect(teamB.filter((a) => a.status === "active")).toHaveLength(7);
		const [teamBRow] = await db
			.select()
			.from(plugins)
			.where(and(eq(plugins.name, "role-personas"), eq(plugins.scopeTeamId, "team-b")));
		expect(teamBRow?.state).toBe("enabled");
		// A removed bundled plugin is available to that team again.
		expect(available(await search("u-ada"))).toContain("role-personas");
		expect(available(await search("u-bo"))).not.toContain("role-personas");
	});

	test("the librarian's plugin installs factory-wide: no team, installed for every viewer", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { search, edit } = actionsFor(agentOrchestration, db, eventBus);

		const result = await edit("u-ada", {
			source: {
				kind: "bundled",
				name: "document-management",
				scope: { kind: "factory", teamId: null },
			},
		});
		if (!result.ok) throw new Error(JSON.stringify(result.problems));
		expect(result.data.id).toBe("document-management");

		const librarian = agentItemId("document-management", "librarian", "factory", null);
		const [row] = await db.select().from(users).where(eq(users.id, librarian));
		expect(row?.teamId).toBeNull();
		expect(row?.status).toBe("active");
		expect((await agentOrchestration.runConfig.read(librarian)).harnessType).toBe("claude-code");

		for (const viewer of ["u-ada", "u-bo"]) {
			const listing = await search(viewer);
			expect(available(listing)).toEqual(["role-personas"]);
			expect(installed(listing)).toEqual(["document-management"]);
		}
	});

	test("a name that is not one of the bundled folders is install_failed, never a path", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { edit } = actionsFor(agentOrchestration, db, eventBus);

		for (const name of ["../role-personas", "role-personas/", BUNDLED, "nothing-here"]) {
			const result = await edit("u-ada", teamInstall(name, "team-a"));
			expect(result.ok, name).toBe(false);
			if (!result.ok) expect(result.problems[0]?.code, name).toBe("install_failed");
		}
		expect(await pluginAgents(db, "team-a")).toHaveLength(0);
	});

	test("a folder that does not exist is install_failed, not a crash", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { edit } = actionsFor(agentOrchestration, db, eventBus);

		const result = await edit("u-ada", {
			source: {
				kind: "folder",
				path: join(tmpdir(), "no-such-plugin-folder"),
				scope: { kind: "team", teamId: "team-a" },
			},
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.problems[0]?.code).toBe("install_failed");
	});
});
