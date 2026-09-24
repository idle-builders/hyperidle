/**
 * Installing a plugin makes everything it contributed live again.
 *
 * Installing is a deliberate act. After it, the plugin's agent answers, its
 * subscriptions fire and its skills reach sessions — whatever state those
 * rows were left in by a previous disable or remove.
 *
 * Today that is true of skills only. `upsertPluginSkill` sets `status: "active"`
 * on conflict, so a skill comes back. The agent goes through
 * `insertUserIfAbsent` and the subscriptions through `insertSubscription(…,
 * { onConflictDoNothing: true })` — both no-ops on a row that already exists —
 * so a reinstall over a disabled plugin yields a plugin that reports `enabled`
 * with a dead agent and paused subscriptions, and no route short of manual
 * SQL fixes it. Remove is different now: a subscription has no soft-delete
 * column, so remove hard-deletes the row, and a reinstall's
 * `onConflictDoNothing` insert finds no conflict and creates a fresh live row.
 *
 * One lifecycle, one outcome: three operations that can disagree become one.
 *
 * Re-pointed onto `POST /api/actions/edit_plugin`.
 */

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	documents,
	type HyperIdleDb,
	pluginContributions,
	subscriptions,
	users,
} from "@hyperidle/db";
import { and, eq, inArray } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9g-reinstall";
const PLUGIN_ROOT = resolve("plugins/document-management");
const PLUGIN_ID = "document-management";

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

async function install(db: HyperIdleDb, app: Hono): Promise<void> {
	await seedFounder(db);
	const dir = join(tmpdir(), `ba9g-${Date.now()}-${Math.round(performance.now())}`);
	mkdirSync(dir, { recursive: true });
	cpSync(PLUGIN_ROOT, dir, { recursive: true });
	tempDirs.push(dir);

	const res = await editPlugin(app, {
		source: { kind: "folder", path: dir, scope: { kind: "factory", teamId: null } },
	});
	if (res.status !== 200) {
		throw new Error(`Install failed: ${JSON.stringify(await res.json())}`);
	}
}

async function editPlugin(app: Hono, body: unknown): Promise<Response> {
	return app.request("/api/actions/edit_plugin", {
		method: "POST",
		headers: { ...auth(), "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

/** What the plugin contributed — the registry is the only answer now. */
async function contributed(
	db: HyperIdleDb,
	kind: "agent" | "subscription" | "document",
): Promise<readonly string[]> {
	const rows = await db
		.select({ entityId: pluginContributions.entityId })
		.from(pluginContributions)
		.where(and(eq(pluginContributions.pluginId, PLUGIN_ID), eq(pluginContributions.kind, kind)));
	return rows.map((r) => r.entityId);
}

describe("installing a plugin revives everything it contributed", () => {
	test("install over a DISABLED plugin brings its agent and subscriptions back", async ({
		db,
		app,
	}) => {
		await install(db, app);
		expect((await editPlugin(app, { id: PLUGIN_ID, state: "disabled" })).status).toBe(200);

		// Precondition: disable really did take everything down.
		const [agentAfterDisable] = await db
			.select()
			.from(users)
			.where(inArray(users.id, [...(await contributed(db, "agent"))]));
		expect(agentAfterDisable?.status).toBe("inactive");

		await install(db, app);

		const agents = await db
			.select()
			.from(users)
			.where(inArray(users.id, [...(await contributed(db, "agent"))]));
		const rows = await db
			.select()
			.from(subscriptions)
			.where(inArray(subscriptions.id, [...(await contributed(db, "subscription"))]));
		const skills = await db
			.select()
			.from(documents)
			.where(inArray(documents.id, [...(await contributed(db, "document"))]));

		expect(agents.length).toBeGreaterThan(0);
		expect(rows.length).toBeGreaterThan(0);
		expect(skills.length).toBeGreaterThan(0);

		// A plugin that reports `enabled` with a dead agent is a plugin that does
		// nothing while claiming to work.
		for (const agent of agents) {
			expect(agent.status, `agent ${agent.id} must be live after reinstall`).toBe("active");
		}
		for (const subscription of rows) {
			expect(
				subscription.paused,
				`subscription ${subscription.id} must be live after reinstall`,
			).toBe(false);
		}
		for (const skill of skills) {
			expect(skill.status, `skill ${skill.id} must be live after reinstall`).toBe("active");
		}
	});

	test("install over a REMOVED plugin brings its agent and subscriptions back", async ({
		db,
		app,
	}) => {
		await install(db, app);
		const contributedIds = [...(await contributed(db, "subscription"))];
		const del = await editPlugin(app, { id: PLUGIN_ID, remove: true });
		expect(del.status).toBe(200);

		// Precondition: remove really did delete the subscriptions — no
		// soft-delete column, so the rows are gone outright.
		const afterRemove = await db
			.select()
			.from(subscriptions)
			.where(inArray(subscriptions.id, contributedIds));
		expect(afterRemove).toHaveLength(0);

		await install(db, app);

		const agents = await db
			.select()
			.from(users)
			.where(inArray(users.id, [...(await contributed(db, "agent"))]));
		const rows = await db
			.select()
			.from(subscriptions)
			.where(inArray(subscriptions.id, [...(await contributed(db, "subscription"))]));

		for (const agent of agents) {
			expect(agent.status, `agent ${agent.id} must be live after reinstall`).toBe("active");
		}
		expect(rows.length).toBeGreaterThan(0);
		for (const subscription of rows) {
			expect(
				subscription.paused,
				`subscription ${subscription.id} must be live after reinstall`,
			).toBe(false);
		}
	});

	test("a subscription the plugin disabled comes back unpaused", async ({ db, app }) => {
		await install(db, app);
		expect((await editPlugin(app, { id: PLUGIN_ID, state: "disabled" })).status).toBe(200);
		await install(db, app);

		const rows = await db
			.select()
			.from(subscriptions)
			.where(
				and(
					inArray(subscriptions.id, [...(await contributed(db, "subscription"))]),
					eq(subscriptions.paused, false),
				),
			);

		expect(rows.length).toBeGreaterThan(0);
	});
});
