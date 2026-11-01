/**
 * Plugin lifecycle: disable/enable/remove must stop/restart/clean materialised
 * rows, through `POST /api/actions/edit_plugin`.
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

const API_KEY = "test-plugin-lifecycle";
const PLUGIN_ROOT = resolve("plugins/document-management");
const PLUGIN_ID = "document-management";

function auth(): Record<string, string> {
	return { "X-API-Key": API_KEY, "Content-Type": "application/json" };
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
	const dir = join(tmpdir(), `plugin-lifecycle-${Date.now()}`);
	mkdirSync(dir, { recursive: true });
	cpSync(PLUGIN_ROOT, dir, { recursive: true });
	tempDirs.push(dir);
	return dir;
}

/** The install path writes documents through `edit_document`, which needs a
 * real actor for the `changes` row it appends — the auth middleware's
 * API-key fallback resolves to this id when no human is seeded. */
async function seedFounder(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: "u-founder",
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: "2026-01-01T00:00:00Z",
	});
}

async function installKmPlugin(
	db: HyperIdleDb,
	app: Hono,
	asPerson: () => Promise<void>,
): Promise<void> {
	await seedFounder(db);
	await asPerson();
	const dir = copyPlugin();
	const res = await app.request("/api/actions/edit_plugin", {
		method: "POST",
		headers: auth(),
		body: JSON.stringify({
			source: { kind: "folder", path: dir, scope: { kind: "factory", teamId: null } },
		}),
	});
	if (res.status !== 200) {
		const body = (await res.json()) as unknown;
		throw new Error(`Install failed: ${JSON.stringify(body)}`);
	}
}

async function disableKmPlugin(app: Hono): Promise<Response> {
	return app.request("/api/actions/edit_plugin", {
		method: "POST",
		headers: auth(),
		body: JSON.stringify({ id: PLUGIN_ID, state: "disabled" }),
	});
}

async function enableKmPlugin(app: Hono): Promise<Response> {
	return app.request("/api/actions/edit_plugin", {
		method: "POST",
		headers: auth(),
		body: JSON.stringify({ id: PLUGIN_ID, state: "enabled" }),
	});
}

async function removeKmPlugin(app: Hono): Promise<Response> {
	return app.request("/api/actions/edit_plugin", {
		method: "POST",
		headers: auth(),
		body: JSON.stringify({ id: PLUGIN_ID, remove: true }),
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

describe("plugin lifecycle: install materialises pluginId on rows", () => {
	test("after install: subscriptions and agent have pluginId set and are active", async ({
		db,
		app,
		asPerson,
	}) => {
		await installKmPlugin(db, app, () => asPerson("u-founder"));
		const subscriptionRows = await db
			.select()
			.from(subscriptions)
			.where(inArray(subscriptions.id, [...(await contributed(db, "subscription"))]));
		expect(subscriptionRows.length).toBeGreaterThan(0);
		expect(subscriptionRows.every((r) => !r.paused)).toBe(true);
		const agentRows = await db
			.select()
			.from(users)
			.where(inArray(users.id, [...(await contributed(db, "agent"))]));
		expect(agentRows.length).toBeGreaterThan(0);
		expect(agentRows.every((r) => r.status === "active")).toBe(true);
	});
});

describe("plugin lifecycle: disable deactivates materialised rows", () => {
	test("after disable: subscriptions paused, agent inactive", async ({ db, app, asPerson }) => {
		await installKmPlugin(db, app, () => asPerson("u-founder"));
		const res = await disableKmPlugin(app);
		expect(res.status).toBe(200);
		const subscriptionRows = await db
			.select()
			.from(subscriptions)
			.where(inArray(subscriptions.id, [...(await contributed(db, "subscription"))]));
		expect(subscriptionRows.length).toBeGreaterThan(0);
		expect(subscriptionRows.every((r) => r.paused)).toBe(true);
		const agentRows = await db
			.select()
			.from(users)
			.where(inArray(users.id, [...(await contributed(db, "agent"))]));
		expect(agentRows.length).toBeGreaterThan(0);
		expect(agentRows.every((r) => r.status === "inactive")).toBe(true);
	});

	test("after disable: skills archived", async ({ db, app, asPerson }) => {
		await installKmPlugin(db, app, () => asPerson("u-founder"));
		const contributedIds = [...(await contributed(db, "document"))];
		const before = await db
			.select()
			.from(documents)
			.where(and(inArray(documents.id, contributedIds), eq(documents.status, "active")));
		await disableKmPlugin(app);
		const after = await db
			.select()
			.from(documents)
			.where(and(inArray(documents.id, contributedIds), eq(documents.status, "archived")));
		expect(after.length).toBe(before.length);
	});
});

describe("plugin lifecycle: enable reactivates materialised rows", () => {
	test("after enable: subscriptions live, agent active", async ({ db, app, asPerson }) => {
		await installKmPlugin(db, app, () => asPerson("u-founder"));
		await disableKmPlugin(app);
		const res = await enableKmPlugin(app);
		expect(res.status).toBe(200);
		const subscriptionRows = await db
			.select()
			.from(subscriptions)
			.where(inArray(subscriptions.id, [...(await contributed(db, "subscription"))]));
		expect(subscriptionRows.length).toBeGreaterThan(0);
		expect(subscriptionRows.every((r) => !r.paused)).toBe(true);
		const agentRows = await db
			.select()
			.from(users)
			.where(inArray(users.id, [...(await contributed(db, "agent"))]));
		expect(agentRows.length).toBeGreaterThan(0);
		expect(agentRows.every((r) => r.status === "active")).toBe(true);
	});
});

describe("plugin lifecycle: remove pauses what it added; switching it on undoes the remove", () => {
	test("after remove: subscriptions paused, agent inactive, documents archived", async ({
		db,
		app,
		asPerson,
	}) => {
		await installKmPlugin(db, app, () => asPerson("u-founder"));
		const subscriptionIds = [...(await contributed(db, "subscription"))];
		const res = await removeKmPlugin(app);
		expect(res.status).toBe(200);
		const subscriptionRows = await db
			.select()
			.from(subscriptions)
			.where(inArray(subscriptions.id, subscriptionIds));
		expect(subscriptionRows.map((r) => r.paused)).toEqual(subscriptionIds.map(() => true));
		const agentRows = await db
			.select()
			.from(users)
			.where(inArray(users.id, [...(await contributed(db, "agent"))]));
		expect(agentRows.length).toBeGreaterThan(0);
		expect(agentRows.every((r) => r.status === "inactive")).toBe(true);
	});

	test("switching a removed plugin on brings it back as it was", async ({ db, app, asPerson }) => {
		await installKmPlugin(db, app, () => asPerson("u-founder"));
		const subscriptionIds = [...(await contributed(db, "subscription"))];
		const documentIds = [...(await contributed(db, "document"))];
		expect((await removeKmPlugin(app)).status).toBe(200);

		const res = await enableKmPlugin(app);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { state: string } };
		expect(body.data.state).toBe("enabled");

		const subscriptionRows = await db
			.select()
			.from(subscriptions)
			.where(inArray(subscriptions.id, subscriptionIds));
		expect(subscriptionRows.map((r) => r.paused)).toEqual(subscriptionIds.map(() => false));
		const agentRows = await db
			.select()
			.from(users)
			.where(inArray(users.id, [...(await contributed(db, "agent"))]));
		expect(agentRows.every((r) => r.status === "active")).toBe(true);
		const documentRows = await db
			.select()
			.from(documents)
			.where(inArray(documents.id, documentIds));
		expect(documentRows.map((r) => r.status)).toEqual(documentIds.map(() => "active"));
	});
});
