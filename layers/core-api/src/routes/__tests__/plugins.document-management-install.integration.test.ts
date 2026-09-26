/**
 * Installing the document-management plugin materializes the librarian agent
 * (users row) and three subscription rows. A second factory install is
 * idempotent. Global upkeep runs once, not once per team — guaranteed by
 * scope-aware ids: two teams installing at team scope each compute their own
 * deterministic id from `scopeKind`/`scopeId` in the hash, so each team's
 * install is its own `plugins` row and its own skill documents, and neither
 * overwrites the other (`not_found` under the visibility rule, architecture.md
 * §5.1, if it tried).
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

describe("document-management plugin install", () => {
	// @lore post-task-retro converts task.changed (every edit, not just a
	// completion) into a subscription with no filter of its own — the prompt
	// itself must carry both guards, or a status tweak or a note edit fires a
	// full retro session for nothing.
	test("materializes the librarian agent, its three subscriptions, and the retro prompt's guards — idempotent on reinstall", async ({
		db,
		app,
	}) => {
		const res = await installKmPlugin(db, app);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.id).toBe(PLUGIN_ID);

		const agentId = agentItemId(PLUGIN_ID, "librarian", "factory", null);
		const [agent] = await db.select().from(users).where(eq(users.id, agentId));
		expect(agent?.name).toBe("Document Librarian");
		expect(agent?.kind).toBe("ai");
		expect(agent?.teamId).toBeNull(); // factory-scoped — global, no team
		expect(agent?.status).toBe("active");

		const decayId = subscriptionItemId(PLUGIN_ID, "document-decay", "factory", null);
		const promotionId = subscriptionItemId(PLUGIN_ID, "document-triage", "factory", null);
		const retroId = subscriptionItemId(PLUGIN_ID, "post-task-retro", "factory", null);
		const [decay] = await db.select().from(subscriptions).where(eq(subscriptions.id, decayId));
		const [promotion] = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.id, promotionId));
		const [retro] = await db.select().from(subscriptions).where(eq(subscriptions.id, retroId));

		expect(decay?.schedule).toBe("0 3 * * 0");
		expect(promotion?.schedule).toBe("0 4 * * 0");
		expect(decay?.event).toBeNull();
		expect(promotion?.event).toBeNull();
		expect(retro?.event).toBe("task.changed");
		expect(retro?.schedule).toBeNull();

		const [promptDoc] = await db
			.select()
			.from(documents)
			.where(and(eq(documents.parentKind, "subscription"), eq(documents.parentId, retroId)));
		expect(promptDoc?.body).toContain("if this change did not move the task to done, stop");
		expect(promptDoc?.body).toContain("if the task is not a root task (it has a parent), stop");

		// Second install (reinstall) — onConflictDoNothing fires, same rows.
		await installKmPlugin(db, app);
		const agentsAfter = await db.select().from(users).where(eq(users.id, agentId));
		const subscriptionsAfter = await db
			.select()
			.from(subscriptions)
			.where(inArray(subscriptions.id, [decayId, promotionId, retroId]));
		expect(agentsAfter).toHaveLength(1);
		expect(subscriptionsAfter).toHaveLength(3);
	});

	test("refuses a source folder with no plugin.json", async ({ db, app }) => {
		await seedFounder(db);
		const emptyDir = join(
			tmpdir(),
			`empty-plugin-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		mkdirSync(emptyDir, { recursive: true });
		tempDirs.push(emptyDir);

		const res = await editPlugin(app, {
			source: { kind: "folder", path: emptyDir, scope: { kind: "factory", teamId: null } },
		});

		expect(res.status).not.toBe(200);
	});
});

describe("document-management plugin — team-scope isolation", () => {
	test("two teams installing at team scope get independent agent, subscription, and skill-document rows", async ({
		db,
		app,
	}) => {
		await db.insert(teams).values([
			{ id: "team-alpha", name: "Alpha", createdAt: "2026-01-01T00:00:00.000Z" },
			{ id: "team-beta", name: "Beta", createdAt: "2026-01-01T00:00:00.000Z" },
		]);
		// A real team member per team — the visibility rule (architecture.md
		// §5.1) reads the actor's own `teamId` off their `users` row, not off
		// any header.
		await db.insert(users).values([
			{
				id: "u-alpha-member",
				kind: "human",
				name: "Alpha Member",
				role: "member",
				status: "active",
				teamId: "team-alpha",
				createdAt: "2026-01-01T00:00:00Z",
			},
			{
				id: "u-beta-member",
				kind: "human",
				name: "Beta Member",
				role: "member",
				status: "active",
				teamId: "team-beta",
				createdAt: "2026-01-01T00:00:00Z",
			},
		]);

		const resAlpha = await installKmPluginForTeam(db, app, "team-alpha");
		expect(resAlpha.status).toBe(200);

		const skillIdAlpha = skillItemId(PLUGIN_ID, SKILL_DIR, "team", "team-alpha");
		// Team alpha edits its own copy's body before team beta installs.
		const editRes = await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: actorHeaders("u-alpha-member"),
			body: JSON.stringify({ id: skillIdAlpha, body: "TEAM ALPHA EDITED CONTENT" }),
		});
		expect(editRes.status).toBe(200);

		const resBeta = await installKmPluginForTeam(db, app, "team-beta");
		expect(resBeta.status).toBe(200);

		// Agent ids differ — different teams → different hash — and each is its
		// own row, bound to its own team.
		const idAlpha = agentItemId(PLUGIN_ID, "librarian", "team", "team-alpha");
		const idBeta = agentItemId(PLUGIN_ID, "librarian", "team", "team-beta");
		expect(idAlpha).not.toBe(idBeta);
		const [agentAlpha] = await db.select().from(users).where(eq(users.id, idAlpha));
		const [agentBeta] = await db.select().from(users).where(eq(users.id, idBeta));
		expect(agentAlpha?.teamId).toBe("team-alpha");
		expect(agentBeta?.teamId).toBe("team-beta");

		// Subscription ids differ and neither team's install superseded the
		// other's — both stay live.
		const decayIdAlpha = subscriptionItemId(PLUGIN_ID, "document-decay", "team", "team-alpha");
		const decayIdBeta = subscriptionItemId(PLUGIN_ID, "document-decay", "team", "team-beta");
		expect(decayIdAlpha).not.toBe(decayIdBeta);
		const decayRowsAlpha = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.id, decayIdAlpha));
		const decayRowsBeta = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.id, decayIdBeta));
		expect(decayRowsAlpha, "alpha keeps its own install").toHaveLength(1);
		expect(decayRowsBeta, "beta has its own install").toHaveLength(1);

		// Skill documents: no collision, no shared row — alpha's edit survives
		// beta's later install of the SAME plugin at its own team scope, and
		// each team's session sees only its own copy.
		const skillIdBeta = skillItemId(PLUGIN_ID, SKILL_DIR, "team", "team-beta");
		expect(skillIdAlpha).not.toBe(skillIdBeta);
		const alphaRows = await db.select().from(documents).where(eq(documents.id, skillIdAlpha));
		expect(alphaRows[0]?.body).toBe("TEAM ALPHA EDITED CONTENT");
		const shippedBody = readFileSync(join(PLUGIN_ROOT, "skills", SKILL_DIR, "SKILL.md"), "utf-8");
		const betaRows = await db.select().from(documents).where(eq(documents.id, skillIdBeta));
		expect(betaRows[0]?.body).toBe(shippedBody);

		const searchAsAlpha = await app.request("/api/actions/search_documents", {
			method: "POST",
			headers: actorHeaders("u-alpha-member"),
			body: JSON.stringify({ ids: [skillIdAlpha, skillIdBeta] }),
		});
		const alphaBody = (await searchAsAlpha.json()) as ActionEnvelope<readonly DocumentRow[]>;
		expect((alphaBody.data ?? []).map((d) => d.id)).toEqual([skillIdAlpha]);
	});
});
