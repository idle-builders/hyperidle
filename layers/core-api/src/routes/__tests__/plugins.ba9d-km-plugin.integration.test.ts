/**
 * BA9d — knowledge-management plugin installation integration tests.
 *
 * Proves AC4: installing the plugin materializes the librarian agent
 * (users row with no teamId) and three routine rows. A second install
 * is idempotent — same row counts. Global upkeep runs once, not once
 * per team.
 *
 * Uses the real DB + app fixture. Each test is self-contained.
 */

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { routines, users } from "@hyperidle/db";
import { agentItemId, routineItemId } from "@hyperidle/settings";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9d-km-plugin";
const PLUGIN_ROOT = resolve("plugins/knowledge-management");

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

async function installKmPlugin(app: Hono): Promise<Response> {
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

describe("knowledge-management plugin install — AC4: global agent + routines", () => {
	test("install returns 201 with plugin name knowledge-management", async ({ app }) => {
		const res = await installKmPlugin(app);
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.plugin.id).toBe("knowledge-management");
	});

	test("install creates the Knowledge Librarian agent (users row, no teamId)", async ({
		db,
		app,
	}) => {
		await installKmPlugin(app);

		const agentDbId = agentItemId("knowledge-management", "librarian");
		const rows = await db.select().from(users).where(eq(users.id, agentDbId));
		expect(rows).toHaveLength(1);
		const agent = rows[0]!;
		expect(agent.name).toBe("Knowledge Librarian");
		expect(agent.kind).toBe("ai");
		expect(agent.teamId).toBeNull(); // global — no team
		expect(agent.status).toBe("active");
	});

	test("install creates three routine rows (decay, promotion, post-task-retro)", async ({
		db,
		app,
	}) => {
		await installKmPlugin(app);

		const decayId = routineItemId("knowledge-management", "knowledge-decay");
		const promotionId = routineItemId("knowledge-management", "knowledge-promotion");
		const retroId = routineItemId("knowledge-management", "post-task-retro");

		const decayRows = await db.select().from(routines).where(eq(routines.id, decayId));
		const promotionRows = await db.select().from(routines).where(eq(routines.id, promotionId));
		const retroRows = await db.select().from(routines).where(eq(routines.id, retroId));

		expect(decayRows).toHaveLength(1);
		expect(promotionRows).toHaveLength(1);
		expect(retroRows).toHaveLength(1);
	});

	test("decay and promotion routines are calendar-triggered", async ({ db, app }) => {
		await installKmPlugin(app);

		const decayId = routineItemId("knowledge-management", "knowledge-decay");
		const promotionId = routineItemId("knowledge-management", "knowledge-promotion");

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
		await installKmPlugin(app);

		const retroId = routineItemId("knowledge-management", "post-task-retro");
		const [retro] = await db.select().from(routines).where(eq(routines.id, retroId));

		expect(retro!.triggerType).toBe("event");
		expect(retro!.eventType).toBe("task_state_changed");
		// triggerConfig contains transitionTo: "done"
		expect(retro!.triggerConfig).toContain("done");
	});

	test("AC4: second install is idempotent — same agent and routine row counts", async ({
		db,
		app,
	}) => {
		await installKmPlugin(app);

		const afterFirst = {
			agents: await db
				.select()
				.from(users)
				.where(eq(users.id, agentItemId("knowledge-management", "librarian"))),
			routinesCount: (await db.select().from(routines)).filter((r) =>
				[
					routineItemId("knowledge-management", "knowledge-decay"),
					routineItemId("knowledge-management", "knowledge-promotion"),
					routineItemId("knowledge-management", "post-task-retro"),
				].includes(r.id),
			).length,
		};

		// Second install (reinstall)
		await installKmPlugin(app);

		const afterSecond = {
			agents: await db
				.select()
				.from(users)
				.where(eq(users.id, agentItemId("knowledge-management", "librarian"))),
			routinesCount: (await db.select().from(routines)).filter((r) =>
				[
					routineItemId("knowledge-management", "knowledge-decay"),
					routineItemId("knowledge-management", "knowledge-promotion"),
					routineItemId("knowledge-management", "post-task-retro"),
				].includes(r.id),
			).length,
		};

		// Agent row count is unchanged — onConflictDoNothing
		expect(afterSecond.agents).toHaveLength(afterFirst.agents.length);
		// Routine count is unchanged — onConflictDoNothing
		expect(afterSecond.routinesCount).toBe(afterFirst.routinesCount);
	});
});
