/**
 * BA9d plugin lifecycle: disable/enable/remove must stop/restart/clean materialised rows.
 */

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { knowledgeItems, routines, users } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9d-lifecycle";
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

function copyPlugin(): string {
	const dir = join(tmpdir(), `ba9d-lc-${Date.now()}`);
	mkdirSync(dir, { recursive: true });
	cpSync(PLUGIN_ROOT, dir, { recursive: true });
	tempDirs.push(dir);
	return dir;
}

async function installKmPlugin(app: Hono): Promise<void> {
	const dir = copyPlugin();
	const res = await app.request("/api/plugins", {
		method: "POST",
		headers: { ...auth(), "Content-Type": "application/json" },
		body: JSON.stringify({ source: { type: "folder", path: dir }, scope: { kind: "factory" } }),
	});
	if (res.status !== 201) {
		const body = (await res.json()) as unknown;
		throw new Error(`Install failed: ${JSON.stringify(body)}`);
	}
}

describe("BA9d lifecycle: install materialises pluginId on rows", () => {
	test("after install: routines and agent have pluginId set and are active", async ({
		db,
		app,
	}) => {
		await installKmPlugin(app);
		const routineRows = await db.select().from(routines).where(eq(routines.pluginId, PLUGIN_ID));
		expect(routineRows.length).toBeGreaterThan(0);
		expect(routineRows.every((r) => r.active)).toBe(true);
		expect(routineRows.every((r) => r.deletedAt === null)).toBe(true);
		const agentRows = await db.select().from(users).where(eq(users.pluginId, PLUGIN_ID));
		expect(agentRows.length).toBeGreaterThan(0);
		expect(agentRows.every((r) => r.status === "active")).toBe(true);
	});
});

describe("BA9d lifecycle: disable deactivates materialised rows", () => {
	test("after disable: routines inactive, agent inactive", async ({ db, app }) => {
		await installKmPlugin(app);
		const res = await app.request(`/api/plugins/${PLUGIN_ID}/disable`, {
			method: "POST",
			headers: auth(),
		});
		expect(res.status).toBe(200);
		const routineRows = await db.select().from(routines).where(eq(routines.pluginId, PLUGIN_ID));
		expect(routineRows.length).toBeGreaterThan(0);
		expect(routineRows.every((r) => !r.active)).toBe(true);
		const agentRows = await db.select().from(users).where(eq(users.pluginId, PLUGIN_ID));
		expect(agentRows.length).toBeGreaterThan(0);
		expect(agentRows.every((r) => r.status === "inactive")).toBe(true);
	});

	test("after disable: skills archived", async ({ db, app }) => {
		await installKmPlugin(app);
		const before = await db
			.select()
			.from(knowledgeItems)
			.where(
				and(eq(knowledgeItems.topic, `plugin:${PLUGIN_ID}`), eq(knowledgeItems.status, "active")),
			);
		await app.request(`/api/plugins/${PLUGIN_ID}/disable`, { method: "POST", headers: auth() });
		const after = await db
			.select()
			.from(knowledgeItems)
			.where(
				and(eq(knowledgeItems.topic, `plugin:${PLUGIN_ID}`), eq(knowledgeItems.status, "archived")),
			);
		expect(after.length).toBe(before.length);
	});
});

describe("BA9d lifecycle: enable reactivates materialised rows", () => {
	test("after enable: routines active, agent active", async ({ db, app }) => {
		await installKmPlugin(app);
		await app.request(`/api/plugins/${PLUGIN_ID}/disable`, { method: "POST", headers: auth() });
		const res = await app.request(`/api/plugins/${PLUGIN_ID}/enable`, {
			method: "POST",
			headers: auth(),
		});
		expect(res.status).toBe(200);
		const routineRows = await db.select().from(routines).where(eq(routines.pluginId, PLUGIN_ID));
		expect(routineRows.length).toBeGreaterThan(0);
		expect(routineRows.every((r) => r.active)).toBe(true);
		const agentRows = await db.select().from(users).where(eq(users.pluginId, PLUGIN_ID));
		expect(agentRows.length).toBeGreaterThan(0);
		expect(agentRows.every((r) => r.status === "active")).toBe(true);
	});
});

describe("BA9d lifecycle: remove soft-deletes materialised rows", () => {
	test("after remove: routines soft-deleted, agent inactive", async ({ db, app }) => {
		await installKmPlugin(app);
		const res = await app.request(`/api/plugins/${PLUGIN_ID}`, {
			method: "DELETE",
			headers: auth(),
		});
		expect(res.status).toBe(200);
		const routineRows = await db.select().from(routines).where(eq(routines.pluginId, PLUGIN_ID));
		expect(routineRows.length).toBeGreaterThan(0);
		expect(routineRows.every((r) => !r.active)).toBe(true);
		expect(routineRows.every((r) => r.deletedAt !== null)).toBe(true);
		const agentRows = await db.select().from(users).where(eq(users.pluginId, PLUGIN_ID));
		expect(agentRows.length).toBeGreaterThan(0);
		expect(agentRows.every((r) => r.status === "inactive")).toBe(true);
	});
});
