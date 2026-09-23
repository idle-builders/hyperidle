/**
 * BA9d — document-management plugin installation integration tests.
 *
 * Proves AC4: installing the plugin materializes the librarian agent
 * (users row) and three subscription rows. A second factory install is
 * idempotent. Global upkeep runs once, not once per team — guaranteed by
 * scope-aware ids.
 *
 * Proves scope-aware ids: two teams installing at team scope each compute
 * their own deterministic id (different ids from different scopeId in the
 * hash) — `plugins` is one row per plugin id, so a second team's install
 * re-scopes it rather than running it alongside the first; what a team's
 * install left behind is reclaimed by the contribution registry's stale
 * sweep (an agent goes inactive, a subscription — no soft-delete column
 * on that table — is deleted). The sanity-break for each is confirmed
 * inline.
 *
 * @lore document-module B10 follow-up: also proves scope isolation for the
 * SKILL documents a team-scoped install contributes (`skillItemId` now folds
 * `scopeKind`/`scopeId` into its hash, same as `agentItemId`/`subscriptionItemId`
 * already did) — before this, two teams installing at team scope resolved
 * the SAME skill document id, and the second team's install failed
 * `not_found` under the visibility rule (architecture.md §5.1) rather than
 * silently overwriting the first team's row.
 *
 * @lore BC5 T7b: routine rows become subscription rows —
 * `routineItemId`/`routines` renamed `subscriptionItemId`/`subscriptions`
 * (the hash input stays byte-for-byte so an install's ids don't churn).
 *
 * Uses the real DB + app fixture. Each test is self-contained.
 */

import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { documents, type HyperIdleDb, subscriptions, teams, users } from "@hyperidle/db";
import type { DocumentRow } from "@hyperidle/domain-model";
import { agentItemId, skillItemId, subscriptionItemId } from "@hyperidle/settings";
import { and, eq, inArray } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9d-km-plugin";
const PLUGIN_ROOT = resolve("plugins/document-management");
const PLUGIN_ID = "document-management";
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

async function editPlugin(app: Hono, body: unknown): Promise<Response> {
	return app.request("/api/actions/edit_plugin", {
		method: "POST",
		headers: { ...auth(), "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function installKmPlugin(db: HyperIdleDb, app: Hono): Promise<Response> {
	await seedFounder(db);
	const pluginDir = copyPluginToTemp();
	return editPlugin(app, {
		source: { kind: "folder", path: pluginDir, scope: { kind: "factory", teamId: null } },
	});
}

async function installKmPluginForTeam(
	db: HyperIdleDb,
	app: Hono,
	teamId: string,
): Promise<Response> {
	await seedFounder(db);
	const pluginDir = copyPluginToTemp();
	return editPlugin(app, {
		source: { kind: "folder", path: pluginDir, scope: { kind: "team", teamId } },
	});
}

describe("document-management plugin install — AC4: global agent + subscriptions", () => {
	test("install answers ok with plugin name document-management", async ({ db, app }) => {
		const res = await installKmPlugin(db, app);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.id).toBe(PLUGIN_ID);
	});

	test("install creates the Document Librarian agent (users row, no teamId)", async ({
		db,
		app,
	}) => {
		await installKmPlugin(db, app);

		const agentDbId = agentItemId(PLUGIN_ID, "librarian", "factory", null);
		const rows = await db.select().from(users).where(eq(users.id, agentDbId));
		expect(rows).toHaveLength(1);
		const agent = rows[0]!;
		expect(agent.name).toBe("Document Librarian");
		expect(agent.kind).toBe("ai");
		expect(agent.teamId).toBeNull(); // factory-scoped — global, no team
		expect(agent.status).toBe("active");
	});

	test("install creates three subscription rows (decay, promotion, post-task-retro)", async ({
		db,
		app,
	}) => {
		await installKmPlugin(db, app);

		const decayId = subscriptionItemId(PLUGIN_ID, "document-decay", "factory", null);
		const promotionId = subscriptionItemId(PLUGIN_ID, "document-triage", "factory", null);
		const retroId = subscriptionItemId(PLUGIN_ID, "post-task-retro", "factory", null);

		const decayRows = await db.select().from(subscriptions).where(eq(subscriptions.id, decayId));
		const promotionRows = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.id, promotionId));
		const retroRows = await db.select().from(subscriptions).where(eq(subscriptions.id, retroId));

		expect(decayRows).toHaveLength(1);
		expect(promotionRows).toHaveLength(1);
		expect(retroRows).toHaveLength(1);
	});

	test("decay and promotion subscriptions are schedule-triggered", async ({ db, app }) => {
		await installKmPlugin(db, app);

		const decayId = subscriptionItemId(PLUGIN_ID, "document-decay", "factory", null);
		const promotionId = subscriptionItemId(PLUGIN_ID, "document-triage", "factory", null);

		const [decay] = await db.select().from(subscriptions).where(eq(subscriptions.id, decayId));
		const [promotion] = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.id, promotionId));

		expect(decay!.schedule).toBe("0 3 * * 0");
		expect(promotion!.schedule).toBe("0 4 * * 0");
		expect(decay!.event).toBeNull();
		expect(promotion!.event).toBeNull();
		// nextRunAt is computed at insert time from the cron schedule
		expect(decay!.nextRunAt).toBeTruthy();
		expect(promotion!.nextRunAt).toBeTruthy();
	});

	test("post-task-retro subscription is event-triggered on task.changed", async ({ db, app }) => {
		await installKmPlugin(db, app);

		const retroId = subscriptionItemId(PLUGIN_ID, "post-task-retro", "factory", null);
		const [retro] = await db.select().from(subscriptions).where(eq(subscriptions.id, retroId));

		expect(retro!.event).toBe("task.changed");
		expect(retro!.schedule).toBeNull();
	});

	// @lore BC5 T11 founder ruling: post-task-retro converts task.changed
	// (every edit, not just a completion) into a subscription with no filter
	// of its own — the prompt itself must carry both guards, or a status
	// tweak or a note edit fires a full retro session for nothing.
	test("post-task-retro's prompt carries both guards: not-done and not-root", async ({
		db,
		app,
	}) => {
		await installKmPlugin(db, app);

		const retroId = subscriptionItemId(PLUGIN_ID, "post-task-retro", "factory", null);
		const [promptDoc] = await db
			.select()
			.from(documents)
			.where(and(eq(documents.parentKind, "subscription"), eq(documents.parentId, retroId)));

		expect(promptDoc).toBeDefined();
		expect(promptDoc!.body).toContain("if this change did not move the task to done, stop");
		expect(promptDoc!.body).toContain("if the task is not a root task (it has a parent), stop");
	});

	test("AC4: second factory install is idempotent — same agent and subscription row counts", async ({
		db,
		app,
	}) => {
		await installKmPlugin(db, app);

		const subscriptionIds = [
			subscriptionItemId(PLUGIN_ID, "document-decay", "factory", null),
			subscriptionItemId(PLUGIN_ID, "document-triage", "factory", null),
			subscriptionItemId(PLUGIN_ID, "post-task-retro", "factory", null),
		];
		const agentId = agentItemId(PLUGIN_ID, "librarian", "factory", null);

		const countAgents = async () =>
			(await db.select().from(users).where(eq(users.id, agentId))).length;
		const countSubscriptions = async () =>
			(await db.select().from(subscriptions).where(inArray(subscriptions.id, subscriptionIds)))
				.length;

		const agentsBefore = await countAgents();
		const subscriptionsBefore = await countSubscriptions();

		// Second install (reinstall) — onConflictDoNothing fires
		await installKmPlugin(db, app);

		expect(await countAgents()).toBe(agentsBefore);
		expect(await countSubscriptions()).toBe(subscriptionsBefore);
	});
});

describe("document-management plugin — team-scope isolation", () => {
	test("two teams installing at team scope get independent agent rows", async ({ db, app }) => {
		await db.insert(teams).values([
			{
				id: "team-alpha",
				name: "Alpha",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
			{
				id: "team-beta",
				name: "Beta",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		]);

		const resA = await installKmPluginForTeam(db, app, "team-alpha");
		const resB = await installKmPluginForTeam(db, app, "team-beta");
		expect(resA.status).toBe(200);
		expect(resB.status).toBe(200);

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

	test("two teams installing at team scope get independent subscription rows", async ({
		db,
		app,
	}) => {
		await db.insert(teams).values([
			{
				id: "team-gamma",
				name: "Gamma",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
			{
				id: "team-delta",
				name: "Delta",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		]);

		await installKmPluginForTeam(db, app, "team-gamma");
		await installKmPluginForTeam(db, app, "team-delta");

		const gammaDecayId = subscriptionItemId(PLUGIN_ID, "document-decay", "team", "team-gamma");
		const deltaDecayId = subscriptionItemId(PLUGIN_ID, "document-decay", "team", "team-delta");

		// Ids must differ — different teams → different hash
		expect(gammaDecayId).not.toBe(deltaDecayId);

		const gammaRows = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.id, gammaDecayId));
		const deltaRows = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.id, deltaDecayId));

		// `plugins` is one row per plugin id (`scopeKind`/`scopeTeamId` live on
		// that single row) — a second install of the SAME plugin id re-scopes
		// it, it does not add a second, independently-live installation. The
		// contribution registry's stale-sweep (`forgetContributionsExcept`,
		// keyed by plugin id only) then reclaims whatever the previous scope
		// contributed. For an agent that means `status: "inactive"` (the row
		// stays); for a subscription — no soft-delete column on that table,
		// architecture.md's subscriptions design — it means the row is gone.
		// What IS guaranteed, and what this test proves, is the id hash: each
		// scope computes its own deterministic id, so gamma's and delta's
		// subscriptions never collide even though only one can be live at a time.
		expect(gammaRows, "gamma's scope was superseded by delta's install").toHaveLength(0);
		expect(deltaRows, "delta is the now-live scope").toHaveLength(1);
	});

	test("two teams installing at team scope get independent SKILL documents", async ({
		db,
		app,
	}) => {
		await db.insert(teams).values([
			{
				id: "team-echo",
				name: "Echo",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
			{
				id: "team-foxtrot",
				name: "Foxtrot",
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
		expect(resEcho.status).toBe(200);

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
		expect(resFoxtrot.status).toBe(200);

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
