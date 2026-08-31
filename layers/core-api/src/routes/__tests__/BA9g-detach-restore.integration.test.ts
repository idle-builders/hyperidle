/**
 * Editing a plugin's contribution makes it yours; restoring hands it back.
 *
 * A plugin ships a skill. You edit it. A reinstall must not overwrite your
 * version — that is D5, "your edit wins" — and the view must say the row is
 * yours now, so you can see which of a plugin's contributions you have taken
 * over. Restore re-imports the plugin's version and hands ownership back.
 *
 * Detachment used to be `knowledge_items.updated_by <> 'plugin:<id>'`, a
 * sentinel nothing ever read: the view showed every skill as attached, and the
 * restore route's skill branch was unreachable from the UI because skills never
 * appeared in the list to click Restore on. It is a registry column now.
 */

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type HyperIdleDb, knowledgeItems, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9g-detach";
const PLUGIN_ROOT = resolve("plugins/knowledge-management");
const PLUGIN_ID = "knowledge-management";
const FOUNDER = "u-founder-ba9g";

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

async function install(app: Hono): Promise<void> {
	const dir = join(tmpdir(), `ba9g-dr-${Date.now()}-${Math.round(performance.now())}`);
	mkdirSync(dir, { recursive: true });
	cpSync(PLUGIN_ROOT, dir, { recursive: true });
	tempDirs.push(dir);

	const res = await app.request("/api/plugins", {
		method: "POST",
		headers: auth(),
		body: JSON.stringify({ source: { type: "folder", path: dir }, scope: { kind: "factory" } }),
	});
	if (res.status !== 201) {
		throw new Error(`Install failed: ${JSON.stringify(await res.json())}`);
	}
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
	readonly detached: boolean;
}

async function contributionsOf(app: Hono): Promise<readonly ContributionRow[]> {
	const res = await app.request("/api/plugins", { headers: auth() });
	const body = (await res.json()) as {
		plugins: Array<{ id: string; contributions: ContributionRow[] }>;
	};
	return body.plugins.find((p) => p.id === PLUGIN_ID)?.contributions ?? [];
}

/** One skill the plugin contributed. */
async function aContributedSkill(app: Hono): Promise<ContributionRow> {
	const row = (await contributionsOf(app)).find((c) => c.kind === "knowledge");
	expect(row, "the plugin must contribute knowledge").toBeDefined();
	return row as ContributionRow;
}

describe("editing a plugin's contribution detaches it; restore hands it back", () => {
	test("editing a contributed document marks it detached in the view", async ({ db, app }) => {
		await seedFounder(db);
		await install(app);
		const skill = await aContributedSkill(app);

		const [before] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, skill.entityId));

		const res = await app.request(`/api/knowledge/${skill.entityId}`, {
			method: "PATCH",
			headers: auth(),
			body: JSON.stringify({
				version: before?.version,
				updatedBy: FOUNDER,
				body: "My own version of this skill.",
			}),
		});
		expect(res.status).toBe(200);

		const after = (await contributionsOf(app)).find((c) => c.entityId === skill.entityId);
		expect(after?.detached, "an edited contribution reads as yours").toBe(true);
	});

	test("a reinstall leaves an edited contribution alone", async ({ db, app }) => {
		await seedFounder(db);
		await install(app);
		const skill = await aContributedSkill(app);

		const [before] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, skill.entityId));
		await app.request(`/api/knowledge/${skill.entityId}`, {
			method: "PATCH",
			headers: auth(),
			body: JSON.stringify({
				version: before?.version,
				updatedBy: FOUNDER,
				body: "My own version of this skill.",
			}),
		});

		await install(app);

		const [after] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, skill.entityId));
		expect(after?.body, "your edit wins over a reinstall").toBe("My own version of this skill.");
		const view = (await contributionsOf(app)).find((c) => c.entityId === skill.entityId);
		expect(view?.detached, "and it is still yours afterwards").toBe(true);
	});

	test("restore re-imports the plugin's version and hands ownership back", async ({
		db,
		pluginsApp,
	}) => {
		const app = pluginsApp;
		await seedFounder(db);
		await install(app);
		const skill = await aContributedSkill(app);

		const [original] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, skill.entityId));
		await app.request(`/api/knowledge/${skill.entityId}`, {
			method: "PATCH",
			headers: auth(),
			body: JSON.stringify({
				version: original?.version,
				updatedBy: FOUNDER,
				body: "My own version of this skill.",
			}),
		});

		const res = await app.request(`/api/plugins/${PLUGIN_ID}/contributions/restore`, {
			method: "POST",
			headers: auth(),
			body: JSON.stringify({ kind: "knowledge", entityId: skill.entityId }),
		});
		expect(res.status).toBe(200);

		const [restored] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, skill.entityId));
		expect(restored?.body, "the plugin's version comes back").toBe(original?.body);

		const view = (await contributionsOf(app)).find((c) => c.entityId === skill.entityId);
		expect(view?.detached, "and it is the plugin's again").toBe(false);
	});

	test("restoring something the plugin never contributed is a 404", async ({ db, app }) => {
		await seedFounder(db);
		await install(app);

		const res = await app.request(`/api/plugins/${PLUGIN_ID}/contributions/restore`, {
			method: "POST",
			headers: auth(),
			body: JSON.stringify({ kind: "knowledge", entityId: "ki-not-from-this-plugin" }),
		});
		expect(res.status).toBe(404);
	});
});
