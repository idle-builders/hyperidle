/**
 * Editing a plugin's contribution makes it yours; restoring hands it back.
 *
 * A plugin ships a skill. You edit it. A reinstall must not overwrite your
 * version — "your edit wins" — and the view must say the row is yours now, so
 * you can see which of a plugin's contributions you have taken over. Restore
 * re-imports the plugin's version and hands ownership back.
 *
 * Detachment is a registry column, read by the view and by the restore route,
 * driven through `POST /api/actions/edit_plugin` / `search_plugins`.
 */

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { documents, type HyperIdleDb, subscriptions, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-detach";
const PLUGIN_ROOT = resolve("plugins/document-management");
const PLUGIN_ID = "document-management";
const FOUNDER = "u-founder";

function auth(): Record<string, string> {
	return { "X-API-Key": API_KEY, "Content-Type": "application/json", "X-Identity": FOUNDER };
}

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {}
	}
	tempDirs.length = 0;
	vi.unstubAllEnvs();
});

beforeEach(() => {
	vi.stubEnv("HYPERIDLE_API_KEY", API_KEY);
});

async function editPlugin(app: Hono, body: unknown): Promise<Response> {
	return app.request("/api/actions/edit_plugin", {
		method: "POST",
		headers: auth(),
		body: JSON.stringify(body),
	});
}

async function install(app: Hono): Promise<string> {
	const dir = join(tmpdir(), `detach-restore-${Date.now()}-${Math.round(performance.now())}`);
	mkdirSync(dir, { recursive: true });
	cpSync(PLUGIN_ROOT, dir, { recursive: true });
	tempDirs.push(dir);

	const res = await editPlugin(app, {
		source: { kind: "folder", path: dir, scope: { kind: "factory", teamId: null } },
	});
	if (res.status !== 200) {
		throw new Error(`Install failed: ${JSON.stringify(await res.json())}`);
	}
	return dir;
}

async function seedFounder(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: FOUNDER,
		name: "Founder",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: new Date().toISOString(),
	});
}

interface ContributionRow {
	readonly kind: string;
	readonly entityId: string;
	readonly label: string;
	readonly detachedAt: string | null;
	readonly detachedBy: string | null;
}

interface PluginRow {
	readonly id: string;
	readonly description: string | null;
	readonly source: { readonly kind: string; readonly address: string };
	readonly installedBy: string | null;
	readonly contributions: ContributionRow[];
}

async function pluginOf(app: Hono): Promise<PluginRow | undefined> {
	const res = await app.request("/api/actions/search_plugins", {
		method: "POST",
		headers: auth(),
		body: JSON.stringify({}),
	});
	const body = (await res.json()) as { data: PluginRow[] };
	return body.data.find((p) => p.id === PLUGIN_ID);
}

async function contributionsOf(app: Hono): Promise<readonly ContributionRow[]> {
	return (await pluginOf(app))?.contributions ?? [];
}

async function editUser(app: Hono, body: unknown): Promise<Response> {
	return app.request("/api/actions/edit_user", {
		method: "POST",
		headers: auth(),
		body: JSON.stringify(body),
	});
}

/** One skill the plugin contributed. */
async function aContributedSkill(app: Hono): Promise<ContributionRow> {
	const row = (await contributionsOf(app)).find((c) => c.kind === "document");
	expect(row, "the plugin must contribute a document").toBeDefined();
	return row as ContributionRow;
}

describe("editing a plugin's contribution detaches it; restore hands it back", () => {
	test("editing a contributed document marks it detached in the view", async ({
		db,
		app,
		asPerson,
	}) => {
		await seedFounder(db);
		await asPerson(FOUNDER);
		await install(app);
		const skill = await aContributedSkill(app);

		const [before] = await db.select().from(documents).where(eq(documents.id, skill.entityId));

		const res = await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: auth(),
			body: JSON.stringify({
				id: skill.entityId,
				version: before?.version,
				body: "My own version of this skill.",
			}),
		});
		expect(res.status).toBe(200);

		const after = (await contributionsOf(app)).find((c) => c.entityId === skill.entityId);
		expect(after?.detachedBy, "an edited contribution says who edited it").toBe(FOUNDER);
		expect(after?.detachedAt, "and when").not.toBeNull();
	});

	test("a reinstall leaves an edited contribution alone", async ({ db, app, asPerson }) => {
		await seedFounder(db);
		await asPerson(FOUNDER);
		await install(app);
		const skill = await aContributedSkill(app);

		const [before] = await db.select().from(documents).where(eq(documents.id, skill.entityId));
		await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: auth(),
			body: JSON.stringify({
				id: skill.entityId,
				version: before?.version,
				body: "My own version of this skill.",
			}),
		});

		await install(app);

		const [after] = await db.select().from(documents).where(eq(documents.id, skill.entityId));
		expect(after?.body, "your edit wins over a reinstall").toBe("My own version of this skill.");
		const view = (await contributionsOf(app)).find((c) => c.entityId === skill.entityId);
		expect(view?.detachedBy, "and it is still yours afterwards").toBe(FOUNDER);
	});

	test("restore re-imports the plugin's version and hands ownership back", async ({
		db,
		pluginsApp,
		asPerson,
	}) => {
		const app = pluginsApp;
		await seedFounder(db);
		await asPerson(FOUNDER, pluginsApp);
		await install(app);
		const skill = await aContributedSkill(app);

		const [original] = await db.select().from(documents).where(eq(documents.id, skill.entityId));
		await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: auth(),
			body: JSON.stringify({
				id: skill.entityId,
				version: original?.version,
				body: "My own version of this skill.",
			}),
		});

		const res = await editPlugin(app, {
			id: PLUGIN_ID,
			restore: { contribution: skill.entityId },
		});
		expect(res.status).toBe(200);

		const [restored] = await db.select().from(documents).where(eq(documents.id, skill.entityId));
		expect(restored?.body, "the plugin's version comes back").toBe(original?.body);

		const view = (await contributionsOf(app)).find((c) => c.entityId === skill.entityId);
		expect(view?.detachedAt, "and it is the plugin's again").toBeNull();
	});

	test("restoring something the plugin never contributed is unknown_contribution", async ({
		db,
		app,
		asPerson,
	}) => {
		await seedFounder(db);
		await asPerson(FOUNDER);
		await install(app);

		const res = await editPlugin(app, {
			id: PLUGIN_ID,
			restore: { contribution: "ki-not-from-this-plugin" },
		});
		expect(res.status).toBe(422);
		const body = (await res.json()) as { problems: ReadonlyArray<{ code: string }> };
		expect(body.problems[0]?.code).toBe("unknown_contribution");
	});

	test("editing the plugin's agent marks it changed by you; restore puts the plugin's agent back", async ({
		db,
		pluginsApp: app,
		asPerson,
	}) => {
		await seedFounder(db);
		await asPerson(FOUNDER, app);
		await install(app);
		const agent = (await contributionsOf(app)).find((c) => c.kind === "agent");
		const agentId = agent?.entityId ?? "";
		const agentNow = async () => {
			const [u] = await db.select().from(users).where(eq(users.id, agentId));
			return { name: u?.name, discipline: u?.discipline, what: u?.what };
		};
		const plugins = await agentNow();

		const res = await editUser(app, {
			id: agentId,
			name: "Archivist",
			discipline: "archivist",
			what: "Files things.",
		});
		expect(res.status).toBe(200);
		const changed = (await contributionsOf(app)).find((c) => c.entityId === agentId);
		expect(changed?.detachedBy).toBe(FOUNDER);

		const restored = await editPlugin(app, { id: PLUGIN_ID, restore: { contribution: agentId } });
		expect(restored.status).toBe(200);
		expect(await agentNow()).toEqual(plugins);
		const view = (await contributionsOf(app)).find((c) => c.entityId === agentId);
		expect(view?.detachedAt).toBeNull();
	});

	test("editing the plugin's reason to start marks it changed by you; restore puts its trigger back", async ({
		db,
		pluginsApp: app,
		asPerson,
	}) => {
		await seedFounder(db);
		await asPerson(FOUNDER, app);
		await install(app);
		const contributions = await contributionsOf(app);
		const agentId = contributions.find((c) => c.kind === "agent")?.entityId ?? "";
		const reasonId = contributions.find((c) => c.kind === "subscription")?.entityId ?? "";
		const reasonNow = async () => {
			const [r] = await db.select().from(subscriptions).where(eq(subscriptions.id, reasonId));
			return { event: r?.event, schedule: r?.schedule, paused: r?.paused };
		};
		const plugins = await reasonNow();

		const res = await editUser(app, {
			id: agentId,
			subscriptions: { change: [{ id: reasonId, schedule: "0 9 * * 1", paused: true }] },
		});
		expect(res.status).toBe(200);
		const changed = (await contributionsOf(app)).find((c) => c.entityId === reasonId);
		expect(changed?.detachedBy).toBe(FOUNDER);

		const restored = await editPlugin(app, { id: PLUGIN_ID, restore: { contribution: reasonId } });
		expect(restored.status).toBe(200);
		expect(await reasonNow()).toEqual(plugins);
		const view = (await contributionsOf(app)).find((c) => c.entityId === reasonId);
		expect(view?.detachedAt).toBeNull();
	});
});

describe("a plugin says where it came from", () => {
	test("search_plugins names the folder it was added from, who added it, and what it is", async ({
		db,
		app,
		asPerson,
	}) => {
		await seedFounder(db);
		await asPerson(FOUNDER);
		const dir = await install(app);

		const plugin = await pluginOf(app);
		expect(plugin?.source).toEqual({ kind: "folder", address: dir, found: true });
		expect(plugin?.installedBy).toBe(FOUNDER);
		expect(plugin?.description).toBe(
			"Document Librarian agent with decay, document triage, and post-task retro subscriptions.",
		);
	});
});
