/**
 * The plugins that ship inside the app: `search_plugins` lists the ones a
 * viewer's team has not installed as available, and `edit_plugin` installs
 * one by name — per team, independently, its agents active at once.
 *
 * Built through the layer's own `buildCoreActions`. The bundled folder is
 * the repo's own `plugins/`.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type HyperIdleDb, plugins, teams, users, userTeams } from "@hyperidle/db";
import type {
	ActionResult,
	AvailablePluginView,
	EditPluginInput,
	PluginListing,
	PluginView,
	SearchPluginsInput,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { agentItemId } from "@hyperidle/settings";
import { findUser, listUsers } from "@hyperidle/user";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import type { ActionContext } from "../../actions/action.js";
import { buildCoreActions } from "../../actions/compose.js";

const NOW = "2026-09-25T00:00:00.000Z";
const BUNDLED = resolve("plugins");

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

function actionsFor(db: HyperIdleDb, eventBus: EventBus): Harness {
	const pluginsBaseDir = join(
		tmpdir(),
		`installed-plugins-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
			createdAt: NOW,
		},
		{
			id: "u-bo",
			kind: "human",
			name: "Bo",
			role: "founder",
			status: "active",
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
			id: "u-both",
			kind: "human",
			name: "Both",
			role: "member",
			status: "active",
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
	await db.insert(userTeams).values({ userId: "u-ada", teamId: "team-a" });
	await db.insert(userTeams).values({ userId: "u-bo", teamId: "team-b" });
	await db.insert(userTeams).values({ userId: "u-ada-assistant", teamId: "team-a" });
	await db.insert(userTeams).values([
		{ userId: "u-both", teamId: "team-a" },
		{ userId: "u-both", teamId: "team-b" },
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
	const rows = await listUsers(db);
	return rows.filter((r) => r.id.startsWith("pa_") && (r.teamIds[0] ?? null) === teamId);
}

describe("bundled plugins — listed as available per viewer", () => {
	test("a person sees both bundled plugins available, each with its install scope", async ({
		db,
		eventBus,
	}) => {
		await seedPeople(db);
		const { search } = actionsFor(db, eventBus);

		const listing = await search("u-ada");
		expect(available(listing)).toEqual(["document-management", "role-personas"]);
		const byId = new Map(listing.map((p) => [p.id, p]));
		const rolePersonas = byId.get("role-personas") as AvailablePluginView;
		expect(rolePersonas.description).toContain("builder");

		const onlyAvailable = await search("u-ada", { state: "available", text: "role" });
		expect(onlyAvailable.map((p) => p.id)).toEqual(["role-personas"]);
		expect(await search("u-ada", { state: "enabled" })).toEqual([]);
	});

	test("an owned agent judges availability by its own team; a person in two teams until both have it; a no-team viewer sees nothing", async ({
		db,
		eventBus,
	}) => {
		await seedPeople(db);
		const { search, edit } = actionsFor(db, eventBus);
		expect(available(await search("u-ada-assistant"))).toEqual([
			"document-management",
			"role-personas",
		]);
		const done = await edit("u-ada", teamInstall("role-personas", "team-a"));
		if (!done.ok) throw new Error(JSON.stringify(done.problems));

		expect(available(await search("u-ada-assistant"))).toEqual(["document-management"]);
		expect(available(await search("u-bo"))).toEqual(["document-management", "role-personas"]);
		expect(available(await search("u-both"))).toEqual(["document-management", "role-personas"]);
		expect(available(await search("u-loner"))).toEqual([]);
		// Installed rows are only visible to members of the installing team.
		expect(installed(await search("u-bo"))).toEqual([]);
	});
});

describe("bundled plugins — install by name, per team", () => {
	test("a team install lands seven active agents on that team", async ({ db, eventBus }) => {
		await seedPeople(db);
		const { edit, pluginsBaseDir } = actionsFor(db, eventBus);

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
		}
	});

	test("two teams install independently; removing one leaves the other", async ({
		db,
		eventBus,
	}) => {
		await seedPeople(db);
		const { search, edit, pluginsBaseDir } = actionsFor(db, eventBus);

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

	test("installing document-management for a team makes it installed for that team only", async ({
		db,
		eventBus,
	}) => {
		await seedPeople(db);
		const { search, edit } = actionsFor(db, eventBus);

		const result = await edit("u-ada", {
			source: {
				kind: "bundled",
				name: "document-management",
				scope: { kind: "team", teamId: "team-a" },
			},
		});
		if (!result.ok) throw new Error(JSON.stringify(result.problems));
		expect(result.data.id).toBe("document-management@team-a");

		const librarian = agentItemId("document-management", "librarian", "team", "team-a");
		const row = await findUser(db, { id: librarian });
		expect(row?.teamIds).toEqual(["team-a"]);
		expect(row?.status).toBe("active");

		// u-ada (team-a) sees it installed; role-personas is still available.
		const adaListing = await search("u-ada");
		expect(available(adaListing)).toEqual(["role-personas"]);
		expect(installed(adaListing)).toEqual(["document-management@team-a"]);

		// u-bo (team-b) still sees document-management as available.
		const boListing = await search("u-bo");
		expect(available(boListing)).toContain("document-management");
		expect(installed(boListing)).not.toContain("document-management@team-a");
	});

	test("a name that is not one of the bundled folders is install_failed, never a path", async ({
		db,
		eventBus,
	}) => {
		await seedPeople(db);
		const { edit } = actionsFor(db, eventBus);

		for (const name of ["../role-personas", "role-personas/", BUNDLED, "nothing-here"]) {
			const result = await edit("u-ada", teamInstall(name, "team-a"));
			expect(result.ok, name).toBe(false);
			if (!result.ok) expect(result.problems[0]?.code, name).toBe("install_failed");
		}
		expect(await pluginAgents(db, "team-a")).toHaveLength(0);
	});

	test("a folder that does not exist is install_failed, not a crash", async ({ db, eventBus }) => {
		await seedPeople(db);
		const { edit } = actionsFor(db, eventBus);

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
