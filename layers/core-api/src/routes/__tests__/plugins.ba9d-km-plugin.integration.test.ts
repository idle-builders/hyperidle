/**
 * BA9d — knowledge-management plugin installation integration tests.
 *
 * Proves AC4: installing the plugin materializes the librarian agent
 * (users row) and three routine rows. A second factory install is idempotent.
 * Global upkeep runs once, not once per team — guaranteed by scope-aware ids.
 *
 * Proves scope isolation: two teams installing at team scope each receive
 * their own independent agent and routine rows (different ids from different
 * scopeId in the hash). The sanity-break for each is confirmed inline.
 *
 * @lore document-module B10 follow-up: also proves scope isolation for the
 * SKILL documents a team-scoped install contributes (`skillItemId` now folds
 * `scopeKind`/`scopeId` into its hash, same as `agentItemId`/`routineItemId`
 * already did) — before this, two teams installing at team scope resolved
 * the SAME skill document id, and the second team's install failed
 * `not_found` under the visibility rule (architecture.md §5.1) rather than
 * silently overwriting the first team's row.
 *
 * Uses the real DB + app fixture. Each test is self-contained.
 */

import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { documents, type HyperIdleDb, routines, teams, users } from "@hyperidle/db";
import type { DocumentRow } from "@hyperidle/domain-model";
import { agentItemId, routineItemId, skillItemId } from "@hyperidle/settings";
import { eq, inArray } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9d-km-plugin";
const PLUGIN_ROOT = resolve("plugins/knowledge-management");
const PLUGIN_ID = "knowledge-management";
const SKILL_DIR = "post-task-retro";

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
	readonly problems?: ReadonlyArray<{ readonly code: string; readonly message: string }>;
}

/** The agent actor-override header the document seam test already uses. */
function actorHeaders(actorId: string): Record<string, string> {
	return { ...auth(), "Content-Type": "application/json", "x-hyperidle-actor-id": actorId };
}

function auth(): Record<string, string> {
	return { "X-API-Key": API_KEY };
}

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {}
	}
	tempDirs.length = 0;
});

function copyPluginToTemp(): string {
	const dir = join(tmpdir(), `km-plugin-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	cpSync(PLUGIN_ROOT, dir, { recursive: true });
	tempDirs.push(dir);
	return dir;
}

/** The install route writes documents through `edit_document`, which needs a
 * real actor for the `changes` row it appends — the auth middleware's
 * API-key fallback resolves to this id when no human is seeded.
 * `onConflictDoNothing` so a second install in the same test is safe. */
async function seedFounder(db: HyperIdleDb): Promise<void> {
	await db
		.insert(users)
		.values({
			id: "u-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: "2026-01-01T00:00:00Z",
		})
		.onConflictDoNothing();
}

async function installKmPlugin(db: HyperIdleDb, app: Hono): Promise<Response> {
	await seedFounder(db);
	const pluginDir = copyPluginToTemp();
	return app.request("/api/plugins", {
		method: "POST",
		headers: { ...auth(), "Content-Type": "application/json" },
		body: JSON.stringify({
			source: { type: "folder", path: pluginDir },
			scope: { kind: "factory" },
		}),
	});
}

async function installKmPluginForTeam(
	db: HyperIdleDb,
	app: Hono,
	teamId: string,
): Promise<Response> {
	await seedFounder(db);
	const pluginDir = copyPluginToTemp();
	return app.request("/api/plugins", {
		method: "POST",
		headers: { ...auth(), "Content-Type": "application/json" },
		body: JSON.stringify({
			source: { type: "folder", path: pluginDir },
			scope: { kind: "team", teamId },
		}),
	});
}

describe("knowledge-management plugin install — AC4: global agent + routines", () => {
	test("install returns 201 with plugin name knowledge-management", async ({ db, app }) => {
		const res = await installKmPlugin(db, app);
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.plugin.id).toBe(PLUGIN_ID);
	});

	test("install creates the Knowledge Librarian agent (users row, no teamId)", async ({
		db,
		app,
	}) => {
		await installKmPlugin(db, app);

		const agentDbId = agentItemId(PLUGIN_ID, "librarian", "factory", null);
		const rows = await db.select().from(users).where(eq(users.id, agentDbId));
		expect(rows).toHaveLength(1);
		const agent = rows[0]!;
		expect(agent.name).toBe("Knowledge Librarian");
		expect(agent.kind).toBe("ai");
		expect(agent.teamId).toBeNull(); // factory-scoped — global, no team
		expect(agent.status).toBe("active");
	});

	test("install creates three routine rows (decay, promotion, post-task-retro)", async ({
		db,
		app,
	}) => {
		await installKmPlugin(db, app);

		const decayId = routineItemId(PLUGIN_ID, "knowledge-decay", "factory", null);
		const promotionId = routineItemId(PLUGIN_ID, "knowledge-promotion", "factory", null);
		const retroId = routineItemId(PLUGIN_ID, "post-task-retro", "factory", null);

		const decayRows = await db.select().from(routines).where(eq(routines.id, decayId));
		const promotionRows = await db.select().from(routines).where(eq(routines.id, promotionId));
		const retroRows = await db.select().from(routines).where(eq(routines.id, retroId));

		expect(decayRows).toHaveLength(1);
		expect(promotionRows).toHaveLength(1);
		expect(retroRows).toHaveLength(1);
	});

	test("decay and promotion routines are calendar-triggered", async ({ db, app }) => {
		await installKmPlugin(db, app);

		const decayId = routineItemId(PLUGIN_ID, "knowledge-decay", "factory", null);
		const promotionId = routineItemId(PLUGIN_ID, "knowledge-promotion", "factory", null);

		const [decay] = await db.select().from(routines).where(eq(routines.id, decayId));
		const [promotion] = await db.select().from(routines).where(eq(routines.id, promotionId));

		expect(decay!.triggerType).toBe("calendar");
		expect(promotion!.triggerType).toBe("calendar");
		// nextRunAt is set by insertRoutine from the cron schedule
		expect(decay!.nextRunAt).toBeTruthy();
		expect(promotion!.nextRunAt).toBeTruthy();
	});

	test("post-task-retro routine is event-triggered on task_state_changed with transitionTo=done", async ({
		db,
		app,
	}) => {
		await installKmPlugin(db, app);

		const retroId = routineItemId(PLUGIN_ID, "post-task-retro", "factory", null);
		const [retro] = await db.select().from(routines).where(eq(routines.id, retroId));

		expect(retro!.triggerType).toBe("event");
		expect(retro!.eventType).toBe("task_state_changed");
		// triggerConfig contains transitionTo: "done"
		expect(retro!.triggerConfig).toContain("done");
	});

	test("AC4: second factory install is idempotent — same agent and routine row counts", async ({
		db,
		app,
	}) => {
		await installKmPlugin(db, app);

		const routineIds = [
			routineItemId(PLUGIN_ID, "knowledge-decay", "factory", null),
			routineItemId(PLUGIN_ID, "knowledge-promotion", "factory", null),
			routineItemId(PLUGIN_ID, "post-task-retro", "factory", null),
		];
		const agentId = agentItemId(PLUGIN_ID, "librarian", "factory", null);

		const countAgents = async () =>
			(await db.select().from(users).where(eq(users.id, agentId))).length;
		const countRoutines = async () =>
			(await db.select().from(routines).where(inArray(routines.id, routineIds))).length;

		const agentsBefore = await countAgents();
		const routinesBefore = await countRoutines();

		// Second install (reinstall) — onConflictDoNothing fires
		await installKmPlugin(db, app);

		expect(await countAgents()).toBe(agentsBefore);
		expect(await countRoutines()).toBe(routinesBefore);
	});
});

describe("knowledge-management plugin — team-scope isolation", () => {
	test("two teams installing at team scope get independent agent rows", async ({ db, app }) => {
		await db.insert(teams).values([
			{
				id: "team-alpha",
				name: "Alpha",
				phase: "active",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
			{
				id: "team-beta",
				name: "Beta",
				phase: "active",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		]);

		const resA = await installKmPluginForTeam(db, app, "team-alpha");
		const resB = await installKmPluginForTeam(db, app, "team-beta");
		expect(resA.status).toBe(201);
		expect(resB.status).toBe(201);

		const idAlpha = agentItemId(PLUGIN_ID, "librarian", "team", "team-alpha");
		const idBeta = agentItemId(PLUGIN_ID, "librarian", "team", "team-beta");

		// Ids must differ — different teams → different hash
		expect(idAlpha).not.toBe(idBeta);

		const rowAlpha = await db.select().from(users).where(eq(users.id, idAlpha));
		const rowBeta = await db.select().from(users).where(eq(users.id, idBeta));

		// Each team has its own agent row
		expect(rowAlpha).toHaveLength(1);
		expect(rowBeta).toHaveLength(1);

		// Each agent is bound to its own team
		expect(rowAlpha[0]!.teamId).toBe("team-alpha");
		expect(rowBeta[0]!.teamId).toBe("team-beta");
	});

	test("two teams installing at team scope get independent routine rows", async ({ db, app }) => {
		await db.insert(teams).values([
			{
				id: "team-gamma",
				name: "Gamma",
				phase: "active",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
			{
				id: "team-delta",
				name: "Delta",
				phase: "active",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		]);

		await installKmPluginForTeam(db, app, "team-gamma");
		await installKmPluginForTeam(db, app, "team-delta");

		const gammaDecayId = routineItemId(PLUGIN_ID, "knowledge-decay", "team", "team-gamma");
		const deltaDecayId = routineItemId(PLUGIN_ID, "knowledge-decay", "team", "team-delta");

		// Ids must differ
		expect(gammaDecayId).not.toBe(deltaDecayId);

		const gammaRows = await db.select().from(routines).where(eq(routines.id, gammaDecayId));
		const deltaRows = await db.select().from(routines).where(eq(routines.id, deltaDecayId));

		// Each team has its own routine row — not the same row shared via onConflictDoNothing
		expect(gammaRows).toHaveLength(1);
		expect(deltaRows).toHaveLength(1);
	});

	test("two teams installing at team scope get independent SKILL documents", async ({
		db,
		app,
	}) => {
		await db.insert(teams).values([
			{
				id: "team-echo",
				name: "Echo",
				phase: "active",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
			{
				id: "team-foxtrot",
				name: "Foxtrot",
				phase: "active",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		]);
		// A real team member per team — the visibility rule (architecture.md
		// §5.1) reads the actor's own `teamId` off their `users` row, not off
		// any header.
		await db.insert(users).values([
			{
				id: "u-echo-member",
				kind: "human",
				name: "Echo Member",
				role: "member",
				status: "active",
				teamId: "team-echo",
				createdAt: "2026-01-01T00:00:00Z",
			},
			{
				id: "u-foxtrot-member",
				kind: "human",
				name: "Foxtrot Member",
				role: "member",
				status: "active",
				teamId: "team-foxtrot",
				createdAt: "2026-01-01T00:00:00Z",
			},
		]);

		const resEcho = await installKmPluginForTeam(db, app, "team-echo");
		expect(resEcho.status).toBe(201);

		const skillIdEcho = skillItemId(PLUGIN_ID, SKILL_DIR, "team", "team-echo");

		// Team echo edits its own copy's body.
		const editRes = await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: actorHeaders("u-echo-member"),
			body: JSON.stringify({ id: skillIdEcho, body: "TEAM ECHO EDITED CONTENT" }),
		});
		expect(editRes.status).toBe(200);

		// Team foxtrot installs the SAME plugin at its own team scope.
		const resFoxtrot = await installKmPluginForTeam(db, app, "team-foxtrot");
		expect(resFoxtrot.status).toBe(201);

		const skillIdFoxtrot = skillItemId(PLUGIN_ID, SKILL_DIR, "team", "team-foxtrot");

		// Ids must differ — no collision, no shared row.
		expect(skillIdEcho).not.toBe(skillIdFoxtrot);

		// Team echo's text is unchanged, exact string.
		const echoRows = await db.select().from(documents).where(eq(documents.id, skillIdEcho));
		expect(echoRows).toHaveLength(1);
		expect(echoRows[0]!.body).toBe("TEAM ECHO EDITED CONTENT");

		// Team foxtrot has its own document, with the shipped text.
		const shippedBody = readFileSync(join(PLUGIN_ROOT, "skills", SKILL_DIR, "SKILL.md"), "utf-8");
		const foxtrotRows = await db.select().from(documents).where(eq(documents.id, skillIdFoxtrot));
		expect(foxtrotRows).toHaveLength(1);
		expect(foxtrotRows[0]!.body).toBe(shippedBody);

		// Each team's session sees only its own copy.
		const searchAsEcho = await app.request("/api/actions/search_documents", {
			method: "POST",
			headers: actorHeaders("u-echo-member"),
			body: JSON.stringify({ ids: [skillIdEcho, skillIdFoxtrot] }),
		});
		expect(searchAsEcho.status).toBe(200);
		const echoBody = (await searchAsEcho.json()) as ActionEnvelope<readonly DocumentRow[]>;
		expect((echoBody.data ?? []).map((d) => d.id)).toEqual([skillIdEcho]);

		const searchAsFoxtrot = await app.request("/api/actions/search_documents", {
			method: "POST",
			headers: actorHeaders("u-foxtrot-member"),
			body: JSON.stringify({ ids: [skillIdEcho, skillIdFoxtrot] }),
		});
		expect(searchAsFoxtrot.status).toBe(200);
		const foxtrotBody = (await searchAsFoxtrot.json()) as ActionEnvelope<readonly DocumentRow[]>;
		expect((foxtrotBody.data ?? []).map((d) => d.id)).toEqual([skillIdFoxtrot]);
	});
});
