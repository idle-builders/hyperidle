/**
 * A plugin's contributions view lists what it actually contributed.
 *
 * The shipped `knowledge-management` plugin brings one agent, three routines
 * and three skills. Its contributions view rendered COMPLETELY EMPTY, because
 * the view read `plugin_configuration_defaults` and none of those things is a
 * row in that table — the plugin declares `"contributions": []` in its manifest,
 * and its real contributions are `users`, `routines` and `knowledge_items` rows.
 * The expand button did not even appear.
 *
 * The registry knows all of it now, so the view asks the registry.
 */

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Hono } from "hono";
import { afterEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9g-contributions";
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
	const dir = join(tmpdir(), `ba9g-cv-${Date.now()}-${Math.round(performance.now())}`);
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

interface ContributionRow {
	readonly kind: string;
	readonly entityId?: string;
	readonly label?: string;
	readonly detached: boolean;
}

async function contributionsOf(app: Hono): Promise<readonly ContributionRow[]> {
	const res = await app.request("/api/plugins", { headers: auth() });
	expect(res.status).toBe(200);
	const body = (await res.json()) as {
		plugins: Array<{ id: string; contributions: ContributionRow[] }>;
	};
	const plugin = body.plugins.find((p) => p.id === PLUGIN_ID);
	expect(plugin, "the installed plugin must be listed").toBeDefined();
	return plugin?.contributions ?? [];
}

describe("a plugin's contributions view lists what it contributed", () => {
	test("the shipped plugin's agent, routines and skills all appear", async ({ app }) => {
		await install(app);

		const contributions = await contributionsOf(app);
		const byKind = new Map<string, number>();
		for (const c of contributions) byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1);

		// One agent (the Knowledge Librarian), three routines, and knowledge for
		// the three skills plus each routine's prompt document.
		expect(byKind.get("agent"), "its agent must appear").toBe(1);
		expect(byKind.get("routine"), "its three routines must appear").toBe(3);
		expect(byKind.get("knowledge") ?? 0, "its skills must appear").toBeGreaterThanOrEqual(3);
	});

	test("each contribution names the row it points at", async ({ app }) => {
		await install(app);

		const contributions = await contributionsOf(app);
		for (const c of contributions) {
			expect(c.entityId, `${c.kind} contribution must name its row`).toBeTruthy();
		}
	});

	test("each contribution carries a label a person can read", async ({ app }) => {
		await install(app);

		const contributions = await contributionsOf(app);
		// An id is not a name. The view is a list of what a plugin brought, so
		// each row says what the thing is called.
		for (const c of contributions) {
			expect(c.label, `${c.kind} ${c.entityId} must have a label`).toBeTruthy();
		}
		const labels = contributions.map((c) => c.label);
		expect(labels).toContain("Knowledge Librarian");
	});

	test("nothing is detached until a person edits it", async ({ app }) => {
		await install(app);

		const contributions = await contributionsOf(app);
		expect(contributions.length).toBeGreaterThan(0);
		for (const c of contributions) {
			expect(c.detached, `${c.kind} ${c.entityId} must start attached`).toBe(false);
		}
	});
});
