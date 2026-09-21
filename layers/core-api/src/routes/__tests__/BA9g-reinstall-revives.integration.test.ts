/**
 * Installing a plugin makes everything it contributed live again.
 *
 * Installing is a deliberate act. After it, the plugin's agent answers, its
 * routines fire and its skills reach sessions — whatever state those rows were
 * left in by a previous disable or remove.
 *
 * Today that is true of skills only. `upsertPluginSkill` sets `status: "active"`
 * on conflict, so a skill comes back. The agent goes through
 * `insertUserIfAbsent` and the routines through `insertRoutine(…,
 * { onConflictDoNothing: true })` — both no-ops on a row that already exists —
 * so a reinstall over a disabled plugin yields a plugin that reports `enabled`
 * with a dead agent and dead routines, and no route short of manual SQL fixes
 * it. Remove is worse: the routines keep their `deletedAt` forever.
 *
 * One lifecycle, one outcome: three operations that can disagree become one.
 */

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { documents, type HyperIdleDb, pluginContributions, routines, users } from "@hyperidle/db";
import { and, eq, inArray } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9g-reinstall";
const PLUGIN_ROOT = resolve("plugins/knowledge-management");
const PLUGIN_ID = "knowledge-management";

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

async function install(app: Hono): Promise<void> {
	const dir = join(tmpdir(), `ba9g-${Date.now()}-${Math.round(performance.now())}`);
	mkdirSync(dir, { recursive: true });
	cpSync(PLUGIN_ROOT, dir, { recursive: true });
	tempDirs.push(dir);

	const res = await app.request("/api/plugins", {
		method: "POST",
		headers: { ...auth(), "Content-Type": "application/json" },
		body: JSON.stringify({ source: { type: "folder", path: dir }, scope: { kind: "factory" } }),
	});
	if (res.status !== 201) {
		throw new Error(`Install failed: ${JSON.stringify(await res.json())}`);
	}
}

async function post(app: Hono, path: string): Promise<number> {
	const res = await app.request(path, { method: "POST", headers: auth() });
	return res.status;
}

/** What the plugin contributed — the registry is the only answer now. */
async function contributed(
	db: HyperIdleDb,
	kind: "agent" | "routine" | "document",
): Promise<readonly string[]> {
	const rows = await db
		.select({ entityId: pluginContributions.entityId })
		.from(pluginContributions)
		.where(and(eq(pluginContributions.pluginId, PLUGIN_ID), eq(pluginContributions.kind, kind)));
	return rows.map((r) => r.entityId);
}

describe("installing a plugin revives everything it contributed", () => {
	test("install over a DISABLED plugin brings its agent and routines back", async ({ db, app }) => {
		await install(app);
		expect(await post(app, `/api/plugins/${PLUGIN_ID}/disable`)).toBe(200);

		// Precondition: disable really did take everything down.
		const [agentAfterDisable] = await db
			.select()
			.from(users)
			.where(inArray(users.id, [...(await contributed(db, "agent"))]));
		expect(agentAfterDisable?.status).toBe("inactive");

		await install(app);

		const agents = await db
			.select()
			.from(users)
			.where(inArray(users.id, [...(await contributed(db, "agent"))]));
		const rows = await db
			.select()
			.from(routines)
			.where(inArray(routines.id, [...(await contributed(db, "routine"))]));
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
		for (const routine of rows) {
			expect(routine.active, `routine ${routine.id} must be live after reinstall`).toBe(true);
			expect(routine.deletedAt, `routine ${routine.id} must not be deleted`).toBeNull();
		}
		for (const skill of skills) {
			expect(skill.status, `skill ${skill.id} must be live after reinstall`).toBe("active");
		}
	});

	test("install over a REMOVED plugin brings its agent and routines back", async ({ db, app }) => {
		await install(app);
		const del = await app.request(`/api/plugins/${PLUGIN_ID}`, {
			method: "DELETE",
			headers: auth(),
		});
		expect(del.status).toBe(200);

		// Precondition: remove soft-deleted the routines.
		const afterRemove = await db
			.select()
			.from(routines)
			.where(inArray(routines.id, [...(await contributed(db, "routine"))]));
		expect(afterRemove.some((r) => r.deletedAt !== null)).toBe(true);

		await install(app);

		const agents = await db
			.select()
			.from(users)
			.where(inArray(users.id, [...(await contributed(db, "agent"))]));
		const rows = await db
			.select()
			.from(routines)
			.where(inArray(routines.id, [...(await contributed(db, "routine"))]));

		for (const agent of agents) {
			expect(agent.status, `agent ${agent.id} must be live after reinstall`).toBe("active");
		}
		for (const routine of rows) {
			expect(routine.active, `routine ${routine.id} must be live after reinstall`).toBe(true);
			expect(routine.deletedAt, `routine ${routine.id} must not stay deleted`).toBeNull();
		}
	});

	test("a routine the plugin disabled comes back with state and active agreeing", async ({
		db,
		app,
	}) => {
		await install(app);
		expect(await post(app, `/api/plugins/${PLUGIN_ID}/disable`)).toBe(200);
		await install(app);

		const rows = await db
			.select()
			.from(routines)
			.where(
				and(
					inArray(routines.id, [...(await contributed(db, "routine"))]),
					eq(routines.active, true),
				),
			);

		expect(rows.length).toBeGreaterThan(0);
		// `state` is the field the routine surfaces read; `active` is the one the
		// scheduler reads. A row where they disagree runs while reading as paused,
		// or the reverse.
		for (const routine of rows) {
			expect(routine.state, `routine ${routine.id} state must agree with active`).toBe("active");
		}
	});
});
